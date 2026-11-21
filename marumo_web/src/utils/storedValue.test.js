import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStoredValue } from './storedValue.js';

test('stored values persist event updates and notify subscribers without a render write', () => {
  const previous = globalThis.window;
  const storage = new Map();
  const events = new Set();
  let writes = 0;
  globalThis.window = {
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => { writes++; storage.set(key, value); } },
    addEventListener: (name, listener) => events.add(listener),
    removeEventListener: (name, listener) => events.delete(listener),
  };
  try {
    const value = createStoredValue('bookings', () => []);
    assert.deepEqual(value.getSnapshot(), []);
    assert.equal(writes, 0);
    let notifications = 0;
    const unsubscribe = value.subscribe(() => notifications++);
    value.set((items) => [...items, { id: 'ticket' }]);
    assert.deepEqual(JSON.parse(storage.get('bookings')), [{ id: 'ticket' }]);
    assert.equal(notifications, 1);
    storage.set('bookings', JSON.stringify([{ id: 'other-tab' }]));
    for (const listener of events) listener({ key: 'bookings' });
    assert.deepEqual(value.getSnapshot(), [{ id: 'other-tab' }]);
    assert.equal(notifications, 2);
    unsubscribe();
    assert.equal(events.size, 0);
  } finally { globalThis.window = previous; }
});

test('unavailable storage retains working in-memory updates', () => {
  const previous = globalThis.window;
  globalThis.window = { localStorage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } } };
  try {
    const value = createStoredValue('cinema', () => 'initial');
    assert.equal(value.getSnapshot(), 'initial');
    value.set('selected');
    assert.equal(value.getSnapshot(), 'selected');
  } finally { globalThis.window = previous; }
});
