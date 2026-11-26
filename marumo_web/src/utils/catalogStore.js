import { httpJson, isHttpTimeout } from './httpClient.js';
import { toMovieView, toShowtimeView } from './catalogModel.js';

const MOVIES_URL = '/catalog/movies?limit=100';
const MOVIES_ERROR = 'Không thể tải danh sách phim. Vui lòng thử lại.';
const DETAIL_ERROR = 'Không thể tải thông tin phim. Vui lòng thử lại.';
const TIMEOUT_ERROR = 'Máy chủ không phản hồi trong 15 giây. Vui lòng thử lại.';

const EMPTY_STATE = {
  movies: [],
  moviesStatus: 'idle',
  moviesError: null,
  details: {},
};

const EMPTY_DETAIL = {
  status: 'idle',
  movie: null,
  showtimes: [],
  error: null,
  notFound: false,
};

function requestError(message, httpStatus, requestPath) {
  const error = new Error(message);
  error.httpStatus = httpStatus;
  error.requestPath = requestPath;
  return error;
}

async function requestJson(request, path) {
  const response = await request(path);
  if (!response.ok) {
    throw requestError(
      `Không thể tải dữ liệu phim (mã ${response.status}).`,
      response.status,
      path
    );
  }
  return response.body;
}

function timeoutMessage(error, fallback) {
  return isHttpTimeout(error) ? TIMEOUT_ERROR : fallback;
}

export function createCatalogStore(fetchImpl) {
  let state = EMPTY_STATE;
  let moviesRequest = null;
  const detailRequests = new Map();
  const listeners = new Set();

  const publish = (next) => {
    state = next;
    listeners.forEach((listener) => listener());
  };

  const request = (path) =>
    httpJson(path, { fetchImpl });

  const detailOf = (slug) => state.details[slug] ?? EMPTY_DETAIL;

  const loadMovies = (force) => {
    if (!force && state.moviesStatus === 'ready') return Promise.resolve(state);
    if (moviesRequest) return moviesRequest;

    publish({ ...state, moviesStatus: 'loading', moviesError: null });
    moviesRequest = requestJson(request, MOVIES_URL)
      .then((payload) => {
        if (!Array.isArray(payload?.movies)) {
          throw requestError('Phản hồi danh sách phim không hợp lệ.');
        }
        publish({
          ...state,
          movies: payload.movies.map(toMovieView),
          moviesStatus: 'ready',
          moviesError: null,
        });
      })
      .catch((error) => {
        publish({
          ...state,
          moviesStatus: 'error',
          moviesError: error?.httpStatus ? error.message : timeoutMessage(error, MOVIES_ERROR),
        });
      })
      .finally(() => {
        moviesRequest = null;
      });
    return moviesRequest;
  };

  const loadDetail = (slug, force) => {
    const current = detailOf(slug);
    if (!force && current.status === 'ready') return Promise.resolve(current);

    const pending = detailRequests.get(slug);
    if (pending) return pending;

    publish({
      ...state,
      details: {
        ...state.details,
        [slug]: { ...current, status: 'loading', error: null, notFound: false },
      },
    });

    const encodedSlug = encodeURIComponent(slug);
    const moviePath = `/catalog/movies/${encodedSlug}`;
    const promise = (async () => {
      const [moviePayload, showtimePayload] = await Promise.all([
        requestJson(request, moviePath),
        requestJson(request, `${moviePath}/showtimes?days=3`),
      ]);
      if (!moviePayload?.movie) {
        throw requestError('Phản hồi thông tin phim không hợp lệ.');
      }
      if (!Array.isArray(showtimePayload?.showtimes)) {
        throw requestError('Phản hồi lịch chiếu không hợp lệ.');
      }
      publish({
        ...state,
        details: {
          ...state.details,
          [slug]: {
            status: 'ready',
            movie: toMovieView(moviePayload.movie),
            showtimes: showtimePayload.showtimes.map((dto) => toShowtimeView(dto)),
            error: null,
            notFound: false,
          },
        },
      });
    })()
      .catch((error) => {
        const latest = detailOf(slug);
        publish({
          ...state,
          details: {
            ...state.details,
            [slug]: {
              ...latest,
              status: 'error',
              error: error?.httpStatus ? error.message : timeoutMessage(error, DETAIL_ERROR),
              notFound: error?.httpStatus === 404 && error?.requestPath === moviePath,
            },
          },
        });
      })
      .finally(() => {
        detailRequests.delete(slug);
      });

    detailRequests.set(slug, promise);
    return promise;
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      return state;
    },
    ensureMovies() {
      return loadMovies(false);
    },
    reloadMovies() {
      return loadMovies(true);
    },
    loadDetail(slug) {
      return loadDetail(slug, false);
    },
    reloadDetail(slug) {
      return loadDetail(slug, true);
    },
  };
}

export const catalogStore = createCatalogStore();
