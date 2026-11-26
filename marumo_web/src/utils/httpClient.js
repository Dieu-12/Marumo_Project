export const HTTP_TIMEOUT_MS = 15000;
const TIMEOUT_MESSAGE = 'Máy chủ không phản hồi trong 15 giây. Vui lòng thử lại.';

export function isHttpTimeout(error) {
  return error?.name === 'HttpTimeoutError' || error?.timedOut === true;
}

function timeoutError() {
  const error = new Error(TIMEOUT_MESSAGE);
  error.name = 'HttpTimeoutError';
  error.timedOut = true;
  return error;
}

export async function httpJson(path, { method, body, headers, signal, timeoutMs = HTTP_TIMEOUT_MS, fetchImpl } = {}) {
  const fetcher = fetchImpl ?? globalThis.fetch;
  const timeoutController = new AbortController();
  const forwardAbort = () => timeoutController.abort(signal.reason);
  if (signal?.aborted) throw signal.reason;
  signal?.addEventListener('abort', forwardAbort, { once: true });
  let rejectAborted;
  const aborted = new Promise((resolve, reject) => { rejectAborted = reject; });
  const rejectOnAbort = () => rejectAborted(timeoutController.signal.reason);
  timeoutController.signal.addEventListener('abort', rejectOnAbort, { once: true });
  const timer = setTimeout(() => timeoutController.abort(timeoutError()), timeoutMs);
  try {
    return await Promise.race([aborted, (async () => {
      const response = await fetcher(path, {
        method,
        body,
        headers,
        credentials: 'same-origin',
        cache: 'no-store',
        signal: timeoutController.signal,
      });
      const responseBody = response.status === 204 ? null : await response.json().catch((error) => {
        if (error instanceof SyntaxError) return null;
        throw error;
      });
      return { status: response.status, ok: response.ok, body: responseBody };
    })()]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
    timeoutController.signal.removeEventListener('abort', rejectOnAbort);
  }
}
