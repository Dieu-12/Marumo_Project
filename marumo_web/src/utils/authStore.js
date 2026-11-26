import { authApi } from './authApi.js';

const DEMO_LOYALTY = { tier: 'MARUMO Club', memberId: 'MRM-849201' };
const EMPTY_AUTHORIZATION = { roles: [], permissions: [], branchAssignments: [] };

let snapshot = { status: 'loading', user: null };
const listeners = new Set();
let revision = 0;
let refreshRequest = null;

function publish(next) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function withLoyalty(customer) {
  return { ...DEMO_LOYALTY, ...customer };
}

async function restore() {
  const requestRevision = revision;
  const session = await authApi.session().catch(() => ({ ok: false }));
  if (requestRevision !== revision) return;
  if (session.ok) {
    publish({
      status: 'ready',
      user: withLoyalty(session.customer),
      roles: session.roles,
      permissions: session.permissions,
      branchAssignments: session.branchAssignments,
    });
    return;
  }
  if (session.uncertain || session.status >= 500) {
    publish({ ...snapshot, status: 'error', error: session.error || 'Không thể kiểm tra phiên đăng nhập. Vui lòng thử lại.' });
    return;
  }
  publish({ status: 'ready', user: null, ...EMPTY_AUTHORIZATION });
}

restore();

export const authStore = {
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot() {
    return snapshot;
  },
  refresh() {
    if (refreshRequest) return refreshRequest;
    revision++;
    publish({ ...snapshot, status: 'loading', error: null });
    refreshRequest = restore().finally(() => { refreshRequest = null; });
    return refreshRequest;
  },
  register(input) {
    return authApi.register(input);
  },
  verifyEmail(input) {
    return authApi.verifyEmail(input);
  },
  async signIn(input) {
    const requestRevision = ++revision;
    const result = await authApi.login(input);
    if (requestRevision !== revision) return { ok: false, error: 'Phiên đã thay đổi. Vui lòng thử lại.' };
    if (!result.ok) {
      publish({ ...snapshot, status: 'ready' });
      return result;
    }
    publish({
      status: 'ready', user: withLoyalty(result.customer),
      roles: result.roles, permissions: result.permissions, branchAssignments: result.branchAssignments,
    });
    return { ok: true };
  },
  async signOut() {
    const requestRevision = ++revision;
    const result = await authApi.logout().catch(() => ({ ok: false }));
    if (requestRevision === revision && result.ok) publish({ status: 'ready', user: null, ...EMPTY_AUTHORIZATION });
    return result;
  },
};
