import { toShowtimeView } from './catalogModel.js';

const EMPTY_ENTRY = { status: 'idle', showtime: null, seats: [], error: null };
const LOAD_ERROR = 'Không thể tải sơ đồ ghế. Vui lòng thử lại.';
const SESSION_ERROR = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';

export function toSeatRows(seats = []) {
  const rows = new Map();
  seats.forEach((seat) => {
    const rowKey = seat.rowLabel || '?';
    let row = rows.get(rowKey);
    if (!row) {
      row = { row: rowKey, position: Number.MAX_SAFE_INTEGER, seats: [] };
      rows.set(rowKey, row);
    }
    row.position = Math.min(row.position, seat.rowPosition ?? Number.MAX_SAFE_INTEGER);
    row.seats.push({
      id: seat.code,
      showtimeSeatId: seat.id,
      number: seat.columnPosition ?? seat.seatNumber - 1,
      type: seat.typeCode === 'PREMIUM' ? 'vip' : seat.typeCode === 'COUPLE' ? 'couple' : 'standard',
      price: seat.price,
      isOccupied: seat.status !== 'AVAILABLE',
    });
  });
  return [...rows.values()]
    .sort((left, right) => left.position - right.position || left.row.localeCompare(right.row, 'vi'))
    .map((row) => ({
      row: row.row,
      seats: row.seats.slice().sort((left, right) => left.number - right.number),
    }));
}

export function createSeatStore(fetchImpl) {
  let state = { byShowtime: {} };
  const requests = new Map();
  const listeners = new Set();

  const publish = (next) => {
    state = next;
    listeners.forEach((listener) => listener());
  };

  const request = (path) => {
    const fetcher = fetchImpl ?? globalThis.fetch;
    return fetcher(path, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });
  };

  const loadSeats = (showtimeId, force = false) => {
    if (!showtimeId) return Promise.resolve(null);
    const current = state.byShowtime[showtimeId];
    if (!force && current?.status === 'ready') return Promise.resolve(current);
    const pending = requests.get(showtimeId);
    if (pending) return pending;

    publish({
      byShowtime: {
        ...state.byShowtime,
        [showtimeId]: { ...EMPTY_ENTRY, status: 'loading' },
      },
    });

    const promise = request(`/catalog/showtimes/${encodeURIComponent(showtimeId)}/seats`)
      .then((response) => {
        if (!response.ok) {
          const error = new Error(LOAD_ERROR);
          error.httpStatus = response.status;
          throw error;
        }
        return response.json();
      })
      .then((payload) => {
        if (!payload?.showtime || !Array.isArray(payload?.seats)) {
          throw new Error(LOAD_ERROR);
        }
        publish({
          byShowtime: {
            ...state.byShowtime,
            [showtimeId]: {
              status: 'ready',
              showtime: toShowtimeView(payload.showtime),
              seats: payload.seats,
              error: null,
            },
          },
        });
      })
      .catch((error) => {
        publish({
          byShowtime: {
            ...state.byShowtime,
            [showtimeId]: {
              ...EMPTY_ENTRY,
              status: 'error',
              error: error?.httpStatus === 401 ? SESSION_ERROR : LOAD_ERROR,
            },
          },
        });
      })
      .finally(() => {
        requests.delete(showtimeId);
      });

    requests.set(showtimeId, promise);
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
    loadSeats,
  };
}

export function seatEntryFor(snapshot, showtimeId) {
  return snapshot.byShowtime[showtimeId] ?? EMPTY_ENTRY;
}

export const seatStore = createSeatStore();
