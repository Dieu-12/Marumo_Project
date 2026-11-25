const API_BASE = '/admin';

function getCsrfToken() {
  const match = document.cookie.match(/(?:^|; )marumo_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function request(path, options = {}) {
  const csrfToken = getCsrfToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers,
    ...options,
  });

  const contentType = response.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const error = new Error(data?.message || `HTTP ${response.status}`);
    error.status = response.status;
    error.code = data?.code;
    error.body = data;
    throw error;
  }

  return data;
}

export const adminApi = {
  auth: {
    login: (email, password) => request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
    logout: () => request('/auth/logout', { method: 'POST' }),
    session: () => request('/auth/session'),
  },

  movies: {
    list: (params = {}) => {
      const searchParams = new URLSearchParams();
      if (params.limit) searchParams.set('limit', params.limit);
      if (params.after) searchParams.set('after', params.after);
      if (params.status) searchParams.set('status', params.status);
      const query = searchParams.toString();
      return request(`/movies${query ? `?${query}` : ''}`);
    },
    get: (movieId) => request(`/movies/${movieId}`),
    create: (movie) => request('/movies', {
      method: 'POST',
      body: JSON.stringify(movie),
    }),
    update: (movieId, movie) => request(`/movies/${movieId}`, {
      method: 'PATCH',
      body: JSON.stringify(movie),
    }),
    createVersion: (movieId, version) => request(`/movies/${movieId}/versions`, {
      method: 'POST',
      body: JSON.stringify(version),
    }),
  },

  showtimes: {
    list: () => request('/showtimes'),
    create: (showtime) => request('/showtimes', {
      method: 'POST',
      body: JSON.stringify(showtime),
    }),
    update: (showtimeId, showtime) => request(`/showtimes/${showtimeId}`, {
      method: 'PATCH',
      body: JSON.stringify(showtime),
    }),
  },

  cinemas: {
    list: () => request('/cinemas'),
  },
};

export function isAuthError(error) {
  return error.status === 401 || error.status === 403;
}