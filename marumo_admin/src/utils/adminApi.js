function getCsrfToken() {
  const match = document.cookie.match(/(?:^|; )marumo_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

const REQUEST_TIMEOUT_MS = 15000;

function serverTimeoutError() {
  const error = new Error('Máy chủ không phản hồi trong 15 giây.');
  error.timedOut = true;
  return error;
}

async function request(path, options = {}) {
  const { signal: callerSignal, ...fetchOptions } = options;
  const csrfToken = getCsrfToken();
  const controller = new AbortController();
  const abort = () => controller.abort(callerSignal.reason);
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort(callerSignal.reason);
    else callerSignal.addEventListener('abort', abort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(path, {
      ...fetchOptions,
      signal: controller.signal,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        ...fetchOptions.headers,
      },
    });
    const isJson = response.headers.get('content-type')?.includes('application/json');
    const data = response.status === 204 || !isJson ? null : await response.json();
    if (!response.ok) {
      const error = new Error(data?.message || `Không thể tải dữ liệu từ máy chủ (HTTP ${response.status}). Vui lòng thử lại.`);
      error.status = response.status;
      error.code = data?.code;
      throw error;
    }
    if (response.status !== 204 && !isJson) throw new Error('Phản hồi máy chủ không hợp lệ. Vui lòng thử lại.');
    return data;
  } catch (error) {
    const failure = !callerSignal?.aborted && controller.signal.aborted ? serverTimeoutError() : error;
    if (fetchOptions.method && (!failure.status || failure.status >= 500)) {
      failure.outcomeUnknown = true;
      failure.message = 'Chưa xác nhận được kết quả lưu. Kiểm tra dữ liệu máy chủ trước khi gửi lại.';
    }
    throw failure;
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener('abort', abort);
  }
}

function queryString(params) {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== null && value !== undefined && value !== ''));
  return query.size ? `?${query}` : '';
}

async function listAll(path, key, options = {}) {
  const records = [];
  const cursors = new Set();
  const controller = new AbortController();
  const abort = () => controller.abort(options.signal.reason);
  if (options.signal?.aborted) controller.abort(options.signal.reason);
  else options.signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const deadline = Date.now() + REQUEST_TIMEOUT_MS;
  let after = null;
  try {
    do {
      if (Date.now() >= deadline) throw serverTimeoutError();
      const data = await request(`${path}${queryString({ limit: 100, after })}`, { ...options, signal: controller.signal });
      if (!Array.isArray(data?.[key]) || !Object.hasOwn(data, 'nextAfter')) throw new Error('Danh sách máy chủ không hợp lệ.');
      records.push(...data[key]);
      const next = data.nextAfter;
      if (next !== null && (typeof next !== 'string' || !/^[1-9][0-9]*$/.test(next) || cursors.has(next) || (after !== null && BigInt(next) <= BigInt(after)))) throw new Error('Phân trang máy chủ không hợp lệ. Vui lòng tải lại.');
      if (next) cursors.add(next);
      after = next;
    } while (after);
    return records;
  } catch (error) {
    if (controller.signal.aborted && !options.signal?.aborted) throw serverTimeoutError();
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}

export const adminApi = {
  auth: {
    login: (email, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    logout: () => request('/auth/logout', { method: 'POST' }),
    session: (options) => request('/auth/session', options),
  },
  options: (options) => request('/admin/catalog/options', options),
  movies: {
    list: (params = {}) => request(`/admin/movies${queryString(params)}`),
    listAll: (options) => listAll('/admin/movies', 'movies', options),
    get: (movieId) => request(`/admin/movies/${movieId}`),
    create: (movie) => request('/admin/movies', { method: 'POST', body: JSON.stringify(movie) }),
    update: (movieId, movie) => request(`/admin/movies/${movieId}`, { method: 'PATCH', body: JSON.stringify(movie) }),
    versions: (movieId, options) => request(`/admin/movies/${movieId}/versions`, options),
    createVersion: (movieId, version) => request(`/admin/movies/${movieId}/versions`, { method: 'POST', body: JSON.stringify(version) }),
  },
  showtimes: {
    list: (params = {}) => request(`/admin/showtimes${queryString(params)}`),
    listAll: (options) => listAll('/admin/showtimes', 'showtimes', options),
    create: (showtime) => request('/admin/showtimes', { method: 'POST', body: JSON.stringify(showtime) }),
  },
  bookings: {
    options: (options) => request('/admin/bookings/options', options),
    listAll: (options) => listAll('/admin/bookings', 'bookings', options),
    get: (bookingId, options) => request(`/admin/bookings/${bookingId}`, options),
    cancel: (bookingId, reason) => request(`/admin/bookings/${bookingId}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
  },
};

export function apiErrorMessage(error) {
  if (error.status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  if (error.code === 'PERMISSION_DENIED') return 'Bạn không có quyền thực hiện hành động này.';
  if (error.code === 'SHOWTIME_CONFLICT') return 'Phòng đã có suất chiếu trùng thời gian, kể cả thời gian chuẩn bị và dọn phòng.';
  if (error.code === 'SHOWTIME_CODE_TAKEN') return 'Mã suất chiếu đã tồn tại.';
  if (error.code === 'MOVIE_CONFLICT') return 'Mã phim hoặc slug đã tồn tại.';
  if (error.code === 'MOVIE_VERSION_CONFLICT') return 'Mã phiên bản đã tồn tại trong phim này.';
  if (error.code === 'BOOKING_NOT_CANCELLABLE') return 'Chỉ có thể hủy booking đang chờ thanh toán và chưa được trả tiền. Vui lòng tải lại để xem trạng thái hiện tại.';
  if (error.code === 'BOOKING_NOT_FOUND') return 'Booking không tồn tại hoặc nằm ngoài phạm vi được phép xem.';
  return error.message || 'Không thể kết nối máy chủ. Vui lòng thử lại.';
}
