import { $, $$ } from './dom.js';

export function updateWindowState(maximized) {
  document.body.classList.toggle('window-maximized', maximized);
  $('#window-maximize').title = maximized ? '还原' : '最大化';
  $('#window-maximize').setAttribute('aria-label', maximized ? '还原窗口' : '最大化窗口');
}

export function setupWindowFrame(host) {
  document.body.classList.toggle('native-window', host.isNative);
  $$('[data-window]').forEach((button) =>
    button.addEventListener('click', () => host.windowCommand(button.dataset.window)),
  );
  $$('[data-resize]').forEach((edge) =>
    edge.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      host.windowCommand('resize', { edge: edge.dataset.resize });
    }),
  );
}
