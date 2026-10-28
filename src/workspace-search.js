import { $ } from './dom.js';

/** Query state is isolated from editor actions so typing and cancellation stay responsive. */
export function setupWorkspaceSearch({ host, run, show }) {
  let folder = null;
  let generation = 0;
  let timer;
  const input = $('#workspace-query');
  const results = $('#workspace-results');
  const status = $('#workspace-search-status');
  const stop = $('#workspace-search-stop');
  const matchCase = $('#workspace-match-case');

  function cancel() {
    clearTimeout(timer);
    generation++;
    stop.hidden = true;
    if (host.available) {
      host.request('workspace:search-cancel').catch(() => {});
    }
  }

  async function search() {
    cancel();
    const version = generation;
    results.replaceChildren();
    if (!folder) {
      status.textContent = '请先打开文件夹工作区。';
      return;
    }
    const query = input.value;
    if (!query.trim()) {
      status.textContent = '搜索工作区内的 Markdown 和文本文件。';
      return;
    }
    stop.hidden = false;
    status.textContent = '正在搜索…';
    try {
      const data = await host.request('workspace:search', { query, matchCase: matchCase.checked });
      if (version !== generation || data?.cancelled) {
        return;
      }
      let previous = null;
      for (const hit of data.hits) {
        if (previous !== hit.path) {
          const heading = document.createElement('p');
          heading.className = 'search-file';
          heading.textContent = hit.path;
          results.append(heading);
          previous = hit.path;
        }
        const button = document.createElement('button');
        button.className = 'search-hit';
        button.title = `${hit.path} · 第 ${hit.line} 行${hit.unsaved ? ' · 未保存内容' : ''}`;
        const line = document.createElement('span');
        line.className = 'search-line';
        line.textContent = hit.line;
        const snippet = document.createElement('span');
        snippet.className = 'search-snippet';
        const mark = document.createElement('mark');
        mark.textContent = hit.preview.slice(hit.previewColumn, hit.previewColumn + hit.length);
        snippet.append(
          hit.preview.slice(0, hit.previewColumn),
          mark,
          hit.preview.slice(hit.previewColumn + hit.length),
        );
        button.append(line, snippet);
        button.onclick = async () => {
          button.disabled = true;
          try {
            await run('workspace:file', { path: hit.path, searchHit: hit });
          } finally {
            button.disabled = false;
          }
        };
        results.append(button);
      }
      status.textContent = `${data.hits.length} 处匹配 · 已搜索 ${data.scanned} 个文件${data.skipped ? ` · 跳过 ${data.skipped} 项` : ''}${data.limited ? ' · 已达搜索上限，请缩小范围或补全关键词' : ''}`;
    } catch (error) {
      if (version === generation) {
        status.textContent = error.message;
      }
    } finally {
      if (version === generation) {
        stop.hidden = true;
      }
    }
  }

  input.addEventListener('input', (event) => {
    cancel();
    results.replaceChildren();
    status.textContent = input.value.trim() ? '等待输入…' : '输入关键词开始搜索。';
    if (!event.isComposing) {
      timer = setTimeout(search, 300);
    }
  });
  $('#workspace-search-form').onsubmit = (event) => {
    event.preventDefault();
    search();
  };
  matchCase.onchange = search;
  stop.onclick = () => {
    cancel();
    status.textContent = '搜索已停止。';
  };
  return {
    setFolder(value) {
      cancel();
      folder = value;
      results.replaceChildren();
      status.textContent = folder
        ? `搜索范围：${folder.name || folder.root}`
        : '请先打开文件夹工作区。';
    },
    open() {
      show('search');
      input.focus();
      input.select();
    },
  };
}
