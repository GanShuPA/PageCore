import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPreferences, defaultPreferences, preferencesKey } from '../src/preferences.js';

test('appearance reads the existing storage key and retains valid user settings', () => {
  const result = loadPreferences({
    getItem(key) {
      assert.equal(key, preferencesKey);
      return JSON.stringify({ dark: true, zoom: 120, spacing: 2.2 });
    },
  });
  assert.deepEqual(result, { dark: true, zoom: 120, spacing: 2.2 });
});

test('appearance tolerates missing, malformed and unavailable storage', () => {
  for (const value of [null, 'null', '{']) {
    assert.deepEqual(loadPreferences({ getItem: () => value }), defaultPreferences);
  }
  assert.deepEqual(
    loadPreferences({
      getItem() {
        throw new Error('denied');
      },
    }),
    defaultPreferences,
  );
});

test('appearance validates types, clamps font size and rejects unsupported spacing', () => {
  const load = (value) => loadPreferences({ getItem: () => JSON.stringify(value) });
  assert.deepEqual(load({ dark: 'true', zoom: 999, spacing: 10 }), {
    dark: false,
    zoom: 150,
    spacing: 1.9,
  });
  assert.equal(load({ zoom: -1 }).zoom, 80);
  assert.equal(load({ zoom: 114 }).zoom, 110);
  assert.equal(load({ zoom: '120' }).zoom, 100);
});
