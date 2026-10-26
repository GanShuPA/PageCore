/** Adapt the embedded host or WebView2 transport to a request/response API. */
export function createHostBridge({ window, getText, onNotice, onWindowState }) {
  const embedded = window.fieldHost;
  const webview = window.chrome?.webview;
  const requests = new Map();
  let sequence = 0;

  webview?.addEventListener('message', ({ data: message }) => {
    if (message.type === 'window-state') {
      onWindowState(message.maximized);
      return;
    }
    if (message.type === 'notice') {
      onNotice(message.message);
      return;
    }
    const request = requests.get(message.id);
    if (!request) {
      return;
    }
    requests.delete(message.id);
    if (message.ok) {
      request.resolve(message.data);
    } else {
      request.reject(new Error(message.error || '操作失败'));
    }
  });

  return {
    available: Boolean(embedded || webview),
    isNative: Boolean(webview),
    request(command, extra = {}) {
      const payload = { text: getText(), ...extra };
      if (embedded) {
        return embedded.request(command, payload);
      }
      if (!webview) {
        return Promise.reject(new Error('本地文件未连接'));
      }
      const id = String(++sequence);
      return new Promise((resolve, reject) => {
        requests.set(id, { resolve, reject });
        try {
          webview.postMessage({ id, command, ...payload });
        } catch (error) {
          requests.delete(id);
          reject(error);
        }
      });
    },
    notifyChange(text) {
      webview?.postMessage({ command: 'changed', text });
    },
    windowCommand(command, extra = {}) {
      webview?.postMessage({ command: `window:${command}`, ...extra });
    },
  };
}
