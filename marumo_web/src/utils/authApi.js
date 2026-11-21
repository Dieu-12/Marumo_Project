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

async function post(path, body, headers = {}) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    credentials: 'same-origin',
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  return { status: response.status, body: payload };
}

export const authApi = {
  async register({ name, email, password }) {
    const { status, body } = await post('/auth/register', { name, email, password });
    if (status === 202) return { ok: true, verificationPending: true };
    return { ok: false, error: authErrorMessage(body?.code, 'Không thể đăng ký lúc này. Vui lòng thử lại.') };
  },
  async verifyEmail({ token }) {
    const { status, body } = await post('/auth/verify-email', { token });
    if (status === 200) return { ok: true };
    return { ok: false, error: authErrorMessage(body?.code, 'Liên kết xác thực không còn hiệu lực.') };
  },
  async login({ email, password }) {
    const { status, body } = await post('/auth/login', { email, password });
    if (status === 200) return { ok: true, customer: body.customer };
    return { ok: false, error: authErrorMessage(body?.code, 'Không thể đăng nhập lúc này. Vui lòng thử lại.') };
  },
  async session() {
    const response = await fetch('/auth/session', { credentials: 'same-origin' });
    if (response.status !== 200) return { ok: false };
    const body = await response.json().catch(() => null);
    if (!body?.customer) return { ok: false };
    return {
      ok: true,
      customer: body.customer,
      roles: body.roles ?? [],
      permissions: body.permissions ?? [],
      branchAssignments: body.branchAssignments ?? [],
    };
  },
  async logout() {
    const { status } = await post('/auth/logout', {}, { 'X-CSRF-Token': readCsrfToken() });
    return { ok: status === 204 };
  },
};
