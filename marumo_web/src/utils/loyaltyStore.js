const LOAD_ERROR = 'Không thể tải điểm Marumo Point. Vui lòng thử lại.';
const SESSION_ERROR = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
const MAX_LEDGER_ENTRIES = 10;

function parseLedgerEntry(dto) {
  if (!dto || typeof dto !== 'object') return null;
  const points = Number(dto.points ?? dto.changePoints);
  if (!Number.isFinite(points) || points === 0) return null;
  const balanceAfter = Number(dto.balanceAfter);
  return {
    changeType: typeof dto.changeType === 'string' ? dto.changeType : '',
    points: Math.round(points),
    balanceAfter: Number.isFinite(balanceAfter) ? Math.round(balanceAfter) : null,
    description: typeof dto.description === 'string' ? dto.description : '',
    createdAt: typeof dto.createdAt === 'string' ? dto.createdAt : '',
  };
}

function loyaltyFailure(message) {
  const error = new Error(message);
  error.isLoyaltyMessage = true;
  return error;
}

function parseLoyalty(payload) {
  if (!payload || typeof payload !== 'object') throw loyaltyFailure(LOAD_ERROR);
  const source = payload.balance && typeof payload.balance === 'object' ? payload.balance : payload;
  const balancePoints = Number(source.balancePoints ?? source.points);
  if (!Number.isFinite(balancePoints) || balancePoints < 0) throw loyaltyFailure(LOAD_ERROR);
  const lifetimeEarned = Number(source.lifetimeEarned);
  const lifetimeRedeemed = Number(source.lifetimeRedeemed);
  const ledgerSource = Array.isArray(payload.ledger)
    ? payload.ledger
    : Array.isArray(payload.history)
      ? payload.history
      : [];
  return {
    balancePoints: Math.round(balancePoints),
    lifetimeEarned: Number.isFinite(lifetimeEarned) ? Math.round(lifetimeEarned) : null,
    lifetimeRedeemed: Number.isFinite(lifetimeRedeemed) ? Math.round(lifetimeRedeemed) : null,
    ledger: ledgerSource.slice(0, MAX_LEDGER_ENTRIES).map(parseLedgerEntry).filter(Boolean),
  };
}

export function createLoyaltyStore() {
  let state = { status: 'idle', balancePoints: null, lifetimeEarned: null, lifetimeRedeemed: null, ledger: [], error: null };
  const listeners = new Set();
  let pendingRequest = null;

  const publish = (next) => {
    state = next;
    listeners.forEach((listener) => listener());
  };

  const load = (force) => {
    if (!force && state.status === 'ready') return Promise.resolve(state);
    if (pendingRequest) return pendingRequest;

    publish({ ...state, status: 'loading', error: null });
    pendingRequest = (async () => {
      const response = await fetch('/loyalty', {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
      });
      if (!response.ok) {
        throw loyaltyFailure(response.status === 401 ? SESSION_ERROR : LOAD_ERROR);
      }
      const payload = await response.json().catch(() => null);
      const parsed = parseLoyalty(payload);
      publish({ status: 'ready', ...parsed, error: null });
      return state;
    })()
      .catch((error) => {
        publish({ ...state, status: 'error', error: error?.isLoyaltyMessage ? error.message : LOAD_ERROR });
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
    ensure() {
      return load(false);
    },
    reload() {
      return load(true);
    },
  };
}

export const loyaltyStore = createLoyaltyStore();
