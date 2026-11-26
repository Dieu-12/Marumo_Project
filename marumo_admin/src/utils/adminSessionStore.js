import { adminApi, apiErrorMessage } from './adminApi.js';

let snapshot = { status: 'loading', session: null, error: '' };
const listeners = new Set();
let requestToken = 0;
let authMutation = false;
let restoreRequest = null;

function publish(next) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

async function restore() {
  if (authMutation) return;
  if (restoreRequest) return restoreRequest.promise;
  const token = ++requestToken;
  const controller = new AbortController();
  const pending = { controller, promise: null };
  restoreRequest = pending;
  publish({ status: 'loading', session: null, error: '' });
  pending.promise = (async () => {
    try {
      const session = await adminApi.auth.session({ signal: controller.signal });
      if (token !== requestToken) return;
      publish({ status: 'authenticated', session, error: '' });
    } catch (error) {
      if (token !== requestToken) return;
      if (error.status === 401) {
        publish({ status: 'anonymous', session: null, error: '' });
        return;
      }
      publish({ status: 'error', session: null, error: apiErrorMessage(error) });
    } finally {
      if (restoreRequest === pending) restoreRequest = null;
    }
  })();
  return pending.promise;
}

async function signIn(email, password) {
  if (authMutation) throw new Error('Đang xử lý đăng nhập hoặc đăng xuất. Vui lòng chờ kết quả.');
  authMutation = true;
  const token = ++requestToken;
  restoreRequest?.controller.abort();
  restoreRequest = null;
  try {
    const session = await adminApi.auth.login(email, password);
    if (token === requestToken) publish({ status: 'authenticated', session, error: '' });
    return session;
  } catch (error) {
    if (token === requestToken && (error.outcomeUnknown || snapshot.status === 'loading')) publish({ status: 'error', session: null, error: 'Chưa xác nhận được phiên đăng nhập. Kiểm tra phiên trước khi thử lại.' });
    throw error;
  } finally {
    authMutation = false;
  }
}

async function signOut() {
  if (authMutation) throw new Error('Đang xử lý đăng nhập hoặc đăng xuất. Vui lòng chờ kết quả.');
  authMutation = true;
  const token = ++requestToken;
  restoreRequest?.controller.abort();
  restoreRequest = null;
  try {
    try {
      await adminApi.auth.logout();
    } catch (error) {
      if (error.status !== 401) {
        if (token === requestToken && (error.outcomeUnknown || snapshot.status === 'loading')) publish({ status: 'error', session: null, error: 'Chưa xác nhận được kết quả đăng xuất. Kiểm tra phiên trước khi thử lại.' });
        throw error;
      }
    }
    if (token === requestToken) publish({ status: 'anonymous', session: null, error: '' });
  } finally {
    authMutation = false;
  }
}

function expire() {
  requestToken += 1;
  restoreRequest?.controller.abort();
  restoreRequest = null;
  publish({ status: 'anonymous', session: null, error: '' });
}

restore();

export const adminSessionStore = {
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot() {
    return snapshot;
  },
  restore,
  signIn,
  signOut,
  expire,
};
