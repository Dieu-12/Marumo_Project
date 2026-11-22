import { bookingErrorMessage, fetchBookingByCode, fetchBookings } from './bookingApi.js';

const EMPTY_LIST = { status: 'idle', bookings: [], error: null };
const EMPTY_DETAIL = { status: 'idle', booking: null, error: null, notFound: false };

export function createBookingStore() {
  let state = { list: EMPTY_LIST, byCode: {} };
  const listeners = new Set();
  let listRequest = null;
  const detailRequests = new Map();

  const publish = (next) => {
    state = next;
    listeners.forEach((listener) => listener());
  };

  const detailOf = (code) => state.byCode[code] ?? EMPTY_DETAIL;

  const loadList = (force) => {
    if (!force && state.list.status === 'ready') return Promise.resolve(state.list);
    if (listRequest) return listRequest;

    publish({ ...state, list: { ...state.list, status: 'loading', error: null } });
    listRequest = (async () => {
      const bookings = await fetchBookings();
      publish({ ...state, list: { status: 'ready', bookings, error: null } });
      return state.list;
    })()
      .catch((error) => {
        publish({
          ...state,
          list: { status: 'error', bookings: state.list.bookings, error: bookingErrorMessage(error) },
        });
        return state.list;
      })
      .finally(() => {
        listRequest = null;
      });
    return listRequest;
  };

  const loadBookingByCode = (code, force) => {
    if (!code) return Promise.resolve(EMPTY_DETAIL);
    const current = detailOf(code);
    if (!force && current.status === 'ready') return Promise.resolve(current);
    const pending = detailRequests.get(code);
    if (pending) return pending;

    publish({
      ...state,
      byCode: { ...state.byCode, [code]: { ...current, status: 'loading', error: null, notFound: false } },
    });

    const promise = (async () => {
      const booking = await fetchBookingByCode(code);
      publish({
        ...state,
        byCode: { ...state.byCode, [code]: { status: 'ready', booking, error: null, notFound: false } },
      });
      return state.byCode[code];
    })()
      .catch((error) => {
        const status = error?.status;
        const notFound = status === 404;
        publish({
          ...state,
          byCode: {
            ...state.byCode,
            [code]: {
              ...EMPTY_DETAIL,
              status: 'error',
              error: bookingErrorMessage(error),
              notFound,
            },
          },
        });
        return state.byCode[code];
      })
      .finally(() => {
        detailRequests.delete(code);
      });

    detailRequests.set(code, promise);
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
    listEntry() {
      return state.list;
    },
    detailEntry(code) {
      return detailOf(code);
    },
    loadList,
    loadBookingByCode,
  };
}

export const bookingStore = createBookingStore();
