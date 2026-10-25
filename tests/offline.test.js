import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('offline navigation serves the cached root without depending on an index.html redirect', async () => {
  const handlers = {};
  const home = new Response('<h1>Velitas sin conexión</h1>', { headers: { 'Content-Type': 'text/html' } });
  const cacheLookups = [];
  let precached = [], deleted = [], claimed = false;
  runInNewContext(readFileSync(new URL('../dist/sw.js', import.meta.url), 'utf8'), {
    URL,
    self: {
      location: { origin: 'https://velitas.example' },
      addEventListener: (name, handler) => { handlers[name] = handler; },
      skipWaiting: async () => {},
      clients: { claim: async () => { claimed = true; } },
    },
    caches: {
      open: async () => ({ addAll: async assets => { precached = Array.from(assets); } }),
      match: async key => { cacheLookups.push(key); return key === './' ? home : undefined; },
      keys: async () => ['velitas-0.9.0', 'another-app', 'velitas-1.0.0-r2'],
      delete: async key => { deleted.push(key); },
    },
    fetch: async () => { throw new TypeError('Network unavailable'); },
  });
  let pending;
  handlers.install({ waitUntil: value => { pending = value; } });
  await pending;
  assert(precached.includes('./'));
  assert(!precached.includes('./index.html'));
  for (const path of precached) assert(readFileSync(new URL(`../dist/${path === './' ? 'index.html' : path}`, import.meta.url)).length);
  handlers.activate({ waitUntil: value => { pending = value; } });
  await pending;
  assert.deepEqual(deleted, ['velitas-0.9.0']);
  assert.equal(claimed, true);
  handlers.fetch({ request: { url: 'https://velitas.example/', method: 'GET', mode: 'navigate' }, respondWith: value => { pending = value; } });
  assert.equal(await (await pending).text(), '<h1>Velitas sin conexión</h1>');
  assert.deepEqual(cacheLookups, ['./']);
  let intercepted = false;
  handlers.fetch({ request: { url: 'https://other.example/', method: 'GET' }, respondWith: () => { intercepted = true; } });
  assert.equal(intercepted, false);
});
