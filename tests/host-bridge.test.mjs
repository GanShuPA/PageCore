import test from 'node:test';
import assert from 'node:assert/strict';
import { createHostBridge } from '../src/host-bridge.js';

function fixture() {
  const sent = [];
  const notices = [];
  const states = [];
  let receive;
  const webview = {
    addEventListener(_type, listener) {
      receive = listener;
    },
    postMessage(message) {
      sent.push(message);
    },
  };
  const host = createHostBridge({
    window: { chrome: { webview } },
    getText: () => '# 最新文本',
    onNotice: (message) => notices.push(message),
    onWindowState: (state) => states.push(state),
  });
  return { host, sent, notices, states, webview, receive: (data) => receive({ data }) };
}

test('host correlates out-of-order replies and includes the latest editor text', async () => {
  const f = fixture();
  const save = f.host.request('save');
  const open = f.host.request('open', { path: 'example.md' });
  assert.equal(f.sent[0].text, '# 最新文本');
  assert.equal(f.sent[1].path, 'example.md');
  f.receive({ id: f.sent[1].id, ok: true, data: { name: 'example.md' } });
  f.receive({ id: f.sent[0].id, ok: true, data: { cleanText: '# 最新文本' } });
  assert.deepEqual(await open, { name: 'example.md' });
  assert.deepEqual(await save, { cleanText: '# 最新文本' });
});

test('host errors reject; notifications and window commands do not consume requests', async () => {
  const f = fixture();
  const failed = assert.rejects(f.host.request('save'), /磁盘错误/);
  f.receive({ type: 'notice', message: '恢复草稿' });
  f.receive({ type: 'window-state', maximized: true });
  f.receive({ id: 'unknown', ok: true });
  f.receive({ id: f.sent[0].id, ok: false, error: '磁盘错误' });
  await failed;
  f.host.notifyChange('修改');
  f.host.windowCommand('resize', { edge: 'se' });
  assert.deepEqual(f.notices, ['恢复草稿']);
  assert.deepEqual(f.states, [true]);
  assert.deepEqual(f.sent.slice(1), [
    { command: 'changed', text: '修改' },
    { command: 'window:resize', edge: 'se' },
  ]);
});

test('embedded adapter takes priority; browser fallback rejects native requests', async () => {
  const calls = [];
  const host = createHostBridge({
    window: {
      chrome: {
        webview: {
          addEventListener() {},
          postMessage() {
            throw new Error('Embedded adapter must take precedence');
          },
        },
      },
      fieldHost: {
        request: (...args) => {
          calls.push(args);
          return Promise.resolve('saved');
        },
      },
    },
    getText: () => '正文',
  });
  assert.equal(host.isNative, true);
  assert.equal(await host.request('save'), 'saved');
  assert.deepEqual(calls, [['save', { text: '正文' }]]);
  const browser = createHostBridge({ window: {}, getText: () => '' });
  assert.equal(browser.available, false);
  await assert.rejects(browser.request('save'), /未连接/);
});

test('transport exceptions reject without breaking subsequent requests', async () => {
  const f = fixture();
  f.webview.postMessage = () => {
    throw new Error('transport closed');
  };
  await assert.rejects(f.host.request('save'), /transport closed/);
  f.webview.postMessage = (message) => f.sent.push(message);
  const next = f.host.request('save');
  f.receive({ id: f.sent[0].id, ok: true, data: 'ok' });
  assert.equal(await next, 'ok');
});
