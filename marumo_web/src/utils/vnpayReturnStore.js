import { fetchVnpayReturn } from './bookingApi.js';

const UNVERIFIED_ERROR = 'Không xác thực được kết quả thanh toán.';

export function createVnpayReturnStore() {
  let state = { status: 'idle', outcome: null, error: null };
  const listeners = new Set();
  let pendingRequest = null;

  const publish = (next) => {
    state = next;
    listeners.forEach((listener) => listener());
  };

  const load = (query, force = false) => {
    if (!force && state.status !== 'idle') return Promise.resolve(state);
    if (pendingRequest) return pendingRequest;

    publish({ ...state, status: 'loading', error: null });
    pendingRequest = (async () => {
      const { booking, processingStatus } = await fetchVnpayReturn(query);
      const outcome = {
        kind:
          booking.status === 'CONFIRMED'
            ? 'confirmed'
            : booking.status === 'PENDING_PAYMENT'
              ? 'pending'
              : 'failed',
        booking,
        processingStatus,
      };
      publish({ status: 'ready', outcome, error: null });
      return state;
    })()
      .catch(() => {
        publish({ status: 'error', outcome: null, error: UNVERIFIED_ERROR });
        return state;
      })
      .finally(() => {
        pendingRequest = null;
      });
    return pendingRequest;
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      return state;
    },
    load,
    reload(query) {
      return load(query, true);
    },
  };
}

export const vnpayReturnStore = createVnpayReturnStore();
