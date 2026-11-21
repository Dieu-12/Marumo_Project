import { authApi } from './authApi.js';

const DEMO_LOYALTY = { tier: 'MARUMO Club', points: 420, memberId: 'MRM-849201' };
const EMPTY_AUTHORIZATION = { roles: [], permissions: [], branchAssignments: [] };

let snapshot = { status: 'loading', user: null };
const listeners = new Set();

function publish(next) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function withLoyalty(customer) {
  return { ...DEMO_LOYALTY, ...customer };
}

async function restore() {
  const session = await authApi.session().catch(() => ({ ok: false }));
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
  register(input) {
    return authApi.register(input);
  },
  verifyEmail(input) {
    return authApi.verifyEmail(input);
  },
  async signIn(input) {
    const result = await authApi.login(input);
    if (!result.ok) return result;
    publish({
      status: 'ready', user: withLoyalty(result.customer),
      roles: result.roles, permissions: result.permissions, branchAssignments: result.branchAssignments,
    });
    return { ok: true };
  },
  async signOut() {
    const result = await authApi.logout().catch(() => ({ ok: false }));
    publish({ status: 'ready', user: null, ...EMPTY_AUTHORIZATION });
    return result;
  },
  awardPoints(earned) {
    if (!snapshot.user) return;
    publish({ ...snapshot, user: { ...snapshot.user, points: snapshot.user.points + earned } });
  },
};
