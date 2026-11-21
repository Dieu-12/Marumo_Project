export function createStoredValue(key, fallback, normalize = (value) => value) {
  let initialized = false;
  let value;
  const listeners = new Set();
  const load = () => {
    try {
      const raw = window.localStorage.getItem(key);
      return normalize(raw === null ? fallback() : JSON.parse(raw));
    } catch {
      return fallback();
    }
  };
  const getSnapshot = () => {
    if (!initialized) { value = load(); initialized = true; }
    return value;
  };
  const publish = () => listeners.forEach((listener) => listener());
  const subscribe = (listener) => {
    const handleStorage = (event) => {
      if (event.key === key || event.key === null) { value = load(); publish(); }
    };
    listeners.add(listener);
    window.addEventListener('storage', handleStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener('storage', handleStorage);
    };
  };
  const set = (update) => {
    value = typeof update === 'function' ? update(getSnapshot()) : update;
    initialized = true;
    try { window.localStorage.setItem(key, JSON.stringify(value)); }
    catch { return value; }
    finally { publish(); }
  };
  return { subscribe, getSnapshot, set };
}
