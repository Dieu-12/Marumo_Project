function getCsrfToken() {
  const match = document.cookie.match(/(?:^|; )marumo_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function request(path, options = {}) {
  const csrfToken = getCsrfToken();
  const response = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      ...options.headers,
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
}

function queryString(params) {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== null && value !== undefined && value !== ''));
  return query.size ? `?${query}` : '';
}

async function listAll(path, key, options = {}) {
  const records = [];
  let after = null;
  do {
    const data = await request(`${path}${queryString({ limit: 100, after })}`, options);
    records.push(...data[key]);
    after = data.nextAfter;
  } while (after);
  return records;
}

export const adminApi = {
  auth: {
    login: (email, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    logout: () => request('/auth/logout', { method: 'POST' }),
    session: () => request('/auth/session'),
  },
  options: () => request('/admin/catalog/options'),
  movies: {
    list: (params = {}) => request(`/admin/movies${queryString(params)}`),
    listAll: () => listAll('/admin/movies', 'movies'),
    get: (movieId) => request(`/admin/movies/${movieId}`),
    create: (movie) => request('/admin/movies', { method: 'POST', body: JSON.stringify(movie) }),
    update: (movieId, movie) => request(`/admin/movies/${movieId}`, { method: 'PATCH', body: JSON.stringify(movie) }),
    versions: (movieId) => request(`/admin/movies/${movieId}/versions`),
    createVersion: (movieId, version) => request(`/admin/movies/${movieId}/versions`, { method: 'POST', body: JSON.stringify(version) }),
  },
  showtimes: {
    list: (params = {}) => request(`/admin/showtimes${queryString(params)}`),
    listAll: () => listAll('/admin/showtimes', 'showtimes'),
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
