import { httpJson, isHttpTimeout } from './httpClient.js';

const CSRF_COOKIE = 'marumo_csrf';

const AUTH_ERROR_MESSAGES = {
  INVALID_INPUT: 'Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại thông tin.',
  INVALID_CREDENTIALS: 'Email hoặc mật khẩu không đúng.',
  EMAIL_NOT_VERIFIED: 'Hãy xác thực email trước khi đăng nhập.',
  ACCOUNT_LOCKED: 'Tài khoản đang bị tạm khóa. Vui lòng thử lại sau.',
  ACCOUNT_DISABLED: 'Tài khoản đã bị vô hiệu hóa.',
  RATE_LIMITED: 'Bạn đã thao tác nhiều lần. Vui lòng chờ ít phút rồi thử lại.',
  TOKEN_INVALID: 'Liên kết xác thực không còn hiệu lực.',
  CSRF_INVALID: 'Phiên đã hết hạn. Vui lòng tải lại trang rồi thử lại.',
  ORIGIN_INVALID: 'Nguồn yêu cầu không được cho phép.',
};

export function authErrorMessage(code, fallback) {
  return AUTH_ERROR_MESSAGES[code] ?? fallback;
}

function readCsrfToken() {
  const pair = document.cookie.split('; ').find((entry) => entry.startsWith(`${CSRF_COOKIE}=`));
  return pair ? decodeURIComponent(pair.slice(CSRF_COOKIE.length + 1)) : '';
}

let uncertainLoginEmail = null;
let uncertainLogout = false;

function sessionResult(body) {
  if (typeof body?.customer?.id !== 'string' || typeof body.customer.email !== 'string') return null;
  return {
    ok: true,
    customer: body.customer,
    roles: body.roles ?? [],
    permissions: body.permissions ?? [],
    branchAssignments: body.branchAssignments ?? [],
  };
}

async function post(path, body, headers = {}) {
  const response = await httpJson(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: response.body };
}

export const authApi = {
  async register({ name, email, password }) {
    let response;
    try {
      response = await post('/auth/register', { name, email, password });
    } catch (error) {
      if (isHttpTimeout(error) || error instanceof TypeError) return {
        ok: false,
        error: 'Chưa xác nhận được kết quả đăng ký. Hãy kiểm tra email xác thực trước khi gửi lại. Gửi lại cùng email không tạo tài khoản trùng.',
      };
      throw error;
    }
    if (response.status === 202) return { ok: true, verificationPending: true };
    if (response.status >= 500) return { ok: false, error: 'Chưa xác nhận được kết quả đăng ký. Hãy kiểm tra email xác thực trước khi gửi lại.' };
    return { ok: false, error: authErrorMessage(response.body?.code, 'Không thể đăng ký lúc này. Vui lòng thử lại.') };
  },
  async verifyEmail({ token }) {
    let response;
    try {
      response = await post('/auth/verify-email', { token });
    } catch (error) {
      if (isHttpTimeout(error) || error instanceof TypeError) return {
        ok: false,
        error: 'Chưa xác nhận được kết quả xác thực. Hãy thử đăng nhập trước khi mở lại liên kết.',
      };
      throw error;
    }
    if (response.status === 200) return { ok: true };
    if (response.status >= 500) return { ok: false, error: 'Chưa xác nhận được kết quả xác thực. Hãy thử đăng nhập trước khi mở lại liên kết.' };
    return { ok: false, error: authErrorMessage(response.body?.code, 'Liên kết xác thực không còn hiệu lực.') };
  },
  async login({ email, password }) {
    if (uncertainLoginEmail !== null) {
      const recovered = await authApi.session();
      if (recovered.ok && recovered.customer.email.toLowerCase() === email.trim().toLowerCase()) {
        uncertainLoginEmail = null;
        return recovered;
      }
      if (!recovered.ok && recovered.status === 401) {
        uncertainLoginEmail = null;
        return { ok: false, error: 'Chưa có phiên đăng nhập. Bạn có thể gửi lại thông tin đăng nhập.' };
      }
      if (recovered.ok) {
        uncertainLoginEmail = null;
        return { ok: false, error: 'Đã kiểm tra phiên hiện tại. Bạn có thể gửi lại thông tin để chuyển tài khoản.' };
      }
      return { ok: false, error: 'Chưa đối chiếu được phiên của yêu cầu trước. Vui lòng kiểm tra kết nối rồi thử lại.' };
    }
    let response;
    try {
      response = await post('/auth/login', { email, password });
    } catch (error) {
      if (isHttpTimeout(error) || error instanceof TypeError) {
        uncertainLoginEmail = email.trim().toLowerCase();
        return { ok: false, error: 'Chưa xác nhận được đăng nhập. Bấm Đăng nhập để kiểm tra phiên trước khi gửi lại.' };
      }
      throw error;
    }
    const body = response.body;
    if (response.status === 200) {
      const result = sessionResult(body);
      if (result) return result;
    }
    if (response.status === 200 || response.status >= 500) {
      uncertainLoginEmail = email.trim().toLowerCase();
      return { ok: false, error: 'Chưa xác nhận được đăng nhập. Bấm Đăng nhập để kiểm tra phiên trước khi gửi lại.' };
    }
    return { ok: false, error: authErrorMessage(body?.code, 'Không thể đăng nhập lúc này. Vui lòng thử lại.') };
  },
  async session() {
    let response;
    try {
      response = await httpJson('/auth/session');
    } catch (error) {
      return { ok: false, uncertain: true, error: isHttpTimeout(error) ? error.message : 'Không thể kiểm tra phiên đăng nhập.' };
    }
    if (response.status !== 200) return { ok: false, status: response.status };
    const body = response.body;
    return sessionResult(body) ?? { ok: false, uncertain: true };
  },
  async logout() {
    if (uncertainLogout) {
      const recovered = await authApi.session();
      if (!recovered.ok && recovered.status === 401) {
        uncertainLogout = false;
        return { ok: true };
      }
      if (recovered.ok) uncertainLogout = false;
      return { ok: false, error: 'Chưa xác nhận đăng xuất. Vui lòng thử lại sau khi kiểm tra kết nối.' };
    }
    let response;
    try {
      response = await post('/auth/logout', {}, { 'X-CSRF-Token': readCsrfToken() });
    } catch (error) {
      uncertainLogout = true;
      return { ok: false, error: isHttpTimeout(error) ? error.message : 'Chưa xác nhận được đăng xuất. Vui lòng thử lại.' };
    }
    return { ok: response.status === 204 || response.status === 401 };
  },
};
