import { $ } from './dom.js';
import { version } from '../package.json';

export function setupUpdates({ host, notice }) {
  const status = $('#update-status');
  const check = $('#update-check');
  const download = $('#update-download');
  const install = $('#update-install');
  const cancel = $('#update-cancel');
  const auto = $('#update-auto');
  let running = false;
  let checked = false;
  let cancelled = false;
  $('#app-version').textContent = `v${version}`;
  try {
    auto.checked = localStorage.getItem('pagecore-auto-update') !== 'off';
  } catch {}
  auto.onchange = () => {
    try {
      localStorage.setItem('pagecore-auto-update', auto.checked ? 'on' : 'off');
    } catch {
      status.textContent = '更新偏好无法保存，下次启动可能恢复默认。';
    }
  };
  async function run(command) {
    if (running) {
      return;
    }
    checked = true;
    running = true;
    cancelled = false;
    check.disabled = download.disabled = install.disabled = true;
    cancel.hidden = command === 'install';
    status.textContent =
      command === 'check'
        ? '正在检查新版本…'
        : command === 'download'
          ? '正在下载并校验安装包…'
          : '正在检查文档；若取消关闭，可稍后重试安装。';
    try {
      const result = await host.request(`update:${command}`);
      if (cancelled) {
        status.textContent = '已取消，可稍后重试。';
        return;
      }
      if (command === 'check') {
        install.hidden = true;
        download.hidden = !result;
        $('#update-notes').hidden = !result;
        $('#update-notes').textContent = result?.notes || '';
        status.textContent = result ? `发现新版本 v${result.version}` : '当前已是最新正式版本。';
        if (result) {
          notice(`发现页核 v${result.version}，请到“设置 → 关于与更新”下载。`);
        }
      } else if (command === 'download') {
        download.hidden = true;
        install.hidden = false;
        status.textContent = '下载完成，校验通过。安装时将关闭并重新打开页核。';
      }
    } catch (error) {
      status.textContent = cancelled
        ? '已取消，可稍后重试。'
        : `更新未完成：${error.message}。可重试或打开项目下载页。`;
    } finally {
      running = false;
      check.disabled = download.disabled = install.disabled = false;
      cancel.hidden = true;
    }
  }
  check.onclick = () => run('check');
  download.onclick = () => run('download');
  install.onclick = () => run('install');
  cancel.onclick = () => {
    cancelled = true;
    host.request('update:cancel').catch(() => {});
  };
  $('#update-home').onclick = () => {
    const url = 'https://github.com/GanShuPA/PageCore-Markdown/releases';
    if (host.available) {
      host.request('external', { url }).catch((e) => notice(e.message));
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };
  return {
    start() {
      if (!host.isNative) {
        check.disabled = true;
        auto.disabled = true;
        status.textContent = '自动升级仅适用于 Windows 桌面版。';
        return;
      }
      if (auto.checked) {
        setTimeout(() => {
          if (!checked && auto.checked) {
            run('check');
          }
        }, 5000);
      }
    },
  };
}
