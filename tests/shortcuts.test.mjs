import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import {
  setupShortcuts,
  loadShortcuts,
  defaultShortcuts,
  eventShortcut,
} from '../src/shortcuts.js';
const html = readFileSync(new URL('../src/index.html', import.meta.url), 'utf8');
function fixture(storage) {
  const dom = new JSDOM(html, { url: 'https://notes.field.local' });
  const document = dom.window.document;
  const calls = [];
  const store = storage || dom.window.localStorage;
  const manager = setupShortcuts({ document, storage: store, run: (id) => calls.push(id) });
  const q = (s) => document.querySelector(s);
  const key = (code, options = {}) => {
    const e = new dom.window.KeyboardEvent('keydown', {
      key: code.startsWith('Key') ? code.slice(3).toLowerCase() : code,
      code,
      ctrlKey: code.startsWith('Key'),
      bubbles: true,
      cancelable: true,
      ...options,
    });
    (document.activeElement || document.body).dispatchEvent(e);
    return e;
  };
  const record = (id) => {
    q('#settings-dialog').setAttribute('open', '');
    q('#shortcuts-panel').hidden = false;
    const button = q(`[data-shortcut="${id}"]`);
    button.focus();
    button.click();
  };
  return { dom, document, calls, store, manager, q, key, record };
}
test('remap applies once, disables old built-in key, updates hints and survives reload', () => {
  const f = fixture();
  f.record('bold');
  f.key('KeyB', { shiftKey: true });
  assert.equal(f.manager.getBindings().bold, 'Ctrl+Shift+B');
  assert.equal(f.q('#bold-tooltip kbd').textContent, 'Ctrl+Shift+B');
  assert.match(f.q('#help-dialog .shortcut-grid').textContent, /Ctrl\+Shift\+B/);
  assert.equal(loadShortcuts(f.store).bold, 'Ctrl+Shift+B');
  f.q('#settings-dialog').removeAttribute('open');
  f.q('[data-shortcut="bold"]').blur();
  let editorEvents = 0;
  f.document.body.addEventListener('keydown', () => editorEvents++);
  assert.equal(f.key('KeyB').defaultPrevented, true);
  assert.deepEqual(f.calls, []);
  f.key('KeyB', { shiftKey: true });
  f.key('KeyB', { shiftKey: true, repeat: true });
  assert.deepEqual(f.calls, ['bold']);
  assert.equal(editorEvents, 0);
  f.dom.window.close();
});
test('conflict, clipboard and plain typing rejected; Escape and focus loss cancel recording', () => {
  const f = fixture();
  f.record('bold');
  f.key('KeyS');
  assert.match(f.q('#shortcut-status').textContent, /已用于「保存」/);
  f.key('KeyC');
  assert.match(f.q('#shortcut-status').textContent, /不可占用/);
  f.key('KeyQ', { ctrlKey: false });
  assert.equal(f.manager.getBindings().bold, 'Ctrl+B');
  f.key('Escape');
  assert(!f.q('[data-shortcut="bold"]').classList.contains('recording'));
  f.record('italic');
  f.q('#close-settings').focus();
  assert(!f.q('[data-shortcut="italic"]').classList.contains('recording'));
  assert.deepEqual(f.calls, []);
  f.dom.window.close();
});
test('modal inputs and IME do not execute commands; reserved shortcuts still reach editor', () => {
  const f = fixture();
  f.q('#settings-dialog').setAttribute('open', '');
  f.key('KeyS');
  assert.deepEqual(f.calls, []);
  f.q('#settings-dialog').removeAttribute('open');
  assert.equal(f.key('KeyB', { isComposing: true }).defaultPrevented, false);
  assert.equal(f.key('KeyC').defaultPrevented, false);
  assert.equal(eventShortcut({ key: 'b', code: 'KeyB', ctrlKey: true, altKey: true }), null);
  f.dom.window.close();
});
test('reset restores saved defaults; corrupt or conflicting stored settings recover safely', () => {
  const f = fixture();
  f.record('save');
  f.key('KeyS', { shiftKey: true });
  assert.equal(f.manager.getBindings().save, 'Ctrl+S');
  f.key('KeyQ', { shiftKey: true });
  f.q('#reset-shortcuts').click();
  assert.deepEqual(f.manager.getBindings(), defaultShortcuts);
  assert.deepEqual(loadShortcuts(f.store), defaultShortcuts);
  f.store.setItem('pagecore-shortcuts-v1', JSON.stringify({ bold: 'Ctrl+S' }));
  assert.deepEqual(loadShortcuts(f.store), defaultShortcuts);
  f.store.setItem('pagecore-shortcuts-v1', '{');
  assert.deepEqual(loadShortcuts(f.store), defaultShortcuts);
  f.dom.window.close();
});
test('failed persistence keeps the previous binding and reports the failure', () => {
  const f = fixture({
    getItem: () => null,
    setItem: () => {
      throw Error('storage unavailable');
    },
  });
  f.record('bold');
  f.key('KeyB', { shiftKey: true });
  assert.equal(f.manager.getBindings().bold, 'Ctrl+B');
  assert.match(f.q('#shortcut-status').textContent, /保存失败/);
  f.dom.window.close();
});
