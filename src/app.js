import { $, $$ } from './dom.js';
import { initializeIcons } from './icons.js';
import { createHostBridge } from './host-bridge.js';
import { setupWindowFrame, updateWindowState } from './window-frame.js';
import { setupAppearance, setupSettingsTabs } from './settings.js';
import { createSourceExtensions } from './source-editor.js';
import { Crepe } from '@milkdown/crepe';
import { replaceAll, callCommand, insert } from '@milkdown/kit/utils';
import { editorViewCtx } from '@milkdown/kit/core';
import {
  toggleStrongCommand,
  toggleEmphasisCommand,
  wrapInHeadingCommand,
  wrapInBulletListCommand,
  wrapInBlockquoteCommand,
  createCodeBlockCommand,
} from '@milkdown/kit/preset/commonmark';
import { toggleStrikethroughCommand, insertTableCommand } from '@milkdown/kit/preset/gfm';
import { EditorView } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { openSearchPanel } from '@codemirror/search';
import { createRenderer, headings, countWords, exportDocument, assetURL } from './render.js';
import { setupShortcuts } from './shortcuts.js';
import { createPdfDocument } from './pdf-export.js';
import { setupPdfSettings } from './pdf-settings.js';
import welcome from './welcome.md';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import 'katex/dist/katex.min.css';
import './style.css';
import './window-frame.css';
import './settings.css';
import './pdf-settings.css';

let mdText = welcome;
let diskText = welcome;
let metadata = { name: '欢迎使用.md', encoding: 'UTF-8', eol: 'LF', path: null, assetBase: '' };
let mode = 'write';
let rich;
let richReference;
let richSnapshot = '';
let source;
let syncing = false;
let toastTimer;
let paintTimer;
let recovery = null;
let ready = false;
let busy = false;
const subscribers = new Set();
const render = createRenderer(window);
const host = createHostBridge({
  window,
  getText: flush,
  onNotice: toast,
  onWindowState: updateWindowState,
});
const appearance = setupAppearance(() => source?.requestMeasure());
const pdfSettings = setupPdfSettings();
const sourceExtensions = () =>
  createSourceExtensions({
    isSyncing: () => syncing,
    getMode: () => mode,
    onTextChange: updateText,
    onSelectionChange: updateStatus,
  });
initializeIcons();
setupWindowFrame(host);

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('#toast').hidden = true), 4200);
}
function richDoc() {
  return rich?.editor.action((ctx) => ctx.get(editorViewCtx).state.doc);
}
function updateText(text) {
  text = text.replace(/\r\n?/g, '\n');
  if (text === mdText) {
    return;
  }
  mdText = text;
  updateStatus();
  clearTimeout(paintTimer);
  paintTimer = setTimeout(paint, 130);
  if (host.isNative) {
    host.notifyChange(mdText);
  } else if (!window.fieldHost) {
    try {
      localStorage.setItem(
        'field-notes-draft',
        JSON.stringify({ text: mdText, name: metadata.name }),
      );
    } catch {}
  }
  for (const fn of subscribers) {
    fn(mdText);
  }
}
function flush() {
  if (syncing) {
    return mdText;
  }
  if (mode === 'write' && rich && richDoc() !== richReference) {
    richReference = richDoc();
    const serialized = rich.getMarkdown();
    if (serialized !== richSnapshot) {
      richSnapshot = serialized;
      updateText(serialized);
    }
  } else if ((mode === 'source' || mode === 'split') && source) {
    updateText(source.state.doc.toString());
  }
  return mdText;
}
function updateStatus() {
  const dirty = mdText !== diskText;
  document.body.classList.toggle('dirty', dirty);
  $('#document-name').textContent = metadata.name;
  $('#save-state').textContent = dirty ? '未保存' : '已就绪';
  $('#document-path').textContent = metadata.path || '本地工作空间 / ' + metadata.name;
  $('#encoding').textContent =
    (metadata.encoding || 'UTF-8').toUpperCase() + ' · ' + (metadata.eol || 'LF');
  $('#word-count').textContent = countWords(mdText).toLocaleString() + ' 字 / 词';
  document.title = (dirty ? '● ' : '') + metadata.name + ' — 页核 · PAGECORE';
  if (source && (mode === 'source' || mode === 'split')) {
    const p = source.state.selection.main.head;
    const l = source.state.doc.lineAt(p);
    $('#cursor-position').textContent = `Ln ${l.number}, Col ${p - l.from + 1}`;
  } else {
    $('#cursor-position').textContent =
      mode === 'write' ? '即时排版' : mode === 'read' ? '阅读视图' : '';
  }
}
function paint() {
  updateStatus();
  const list = headings(mdText);
  $('#outline').replaceChildren();
  list.forEach((h, i) => {
    const b = document.createElement('button');
    b.className = 'level-' + h.level;
    b.style.paddingLeft = Math.min(h.level - 1, 3) * 12 + 6 + 'px';
    const n = document.createElement('span');
    n.className = 'outline-number';
    n.textContent = String(i + 1).padStart(2, '0');
    const label = document.createElement('span');
    label.textContent = h.text;
    b.append(n, label);
    b.onclick = () => jumpTo(h, i, b);
    $('#outline').append(b);
  });
  if (!list.length) {
    $('#outline').innerHTML = '<p class="outline-empty">添加一个标题，<br>让文档有清晰的层次。</p>';
  }
  if (mode === 'split' || mode === 'read') {
    $('#preview').innerHTML = render(mdText, metadata.assetBase);
  }
}
function jumpTo(h, i, button) {
  $$('#outline button').forEach((b) => b.classList.toggle('active', b === button));
  if (mode === 'write') {
    $$(
      '#rich-editor h1,#rich-editor h2,#rich-editor h3,#rich-editor h4,#rich-editor h5,#rich-editor h6',
    )[i]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if (mode === 'read') {
    $('#heading-' + i)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    source.dispatch({
      selection: { anchor: Math.min(h.offset, source.state.doc.length) },
      effects: EditorView.scrollIntoView(Math.min(h.offset, source.state.doc.length), {
        y: 'start',
      }),
    });
    source.focus();
    if (mode === 'split') {
      $('#heading-' + i)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}
function setSource(text, reset = false) {
  syncing = true;
  try {
    if (reset) {
      source.setState(EditorState.create({ doc: text, extensions: sourceExtensions() }));
    } else if (source.state.doc.toString() !== text) {
      source.dispatch({ changes: { from: 0, to: source.state.doc.length, insert: text } });
    }
  } finally {
    syncing = false;
  }
}
function setRich(text) {
  syncing = true;
  try {
    rich.editor.action(replaceAll(text, true));
    richReference = richDoc();
    richSnapshot = rich.getMarkdown();
  } finally {
    syncing = false;
  }
}
async function setMode(next) {
  if (!ready || !['write', 'source', 'split', 'read'].includes(next) || mode === next) {
    return;
  }
  flush();
  if (next === 'write') {
    if (mdText.length > 500000) {
      toast('较长文档请使用源码或分栏模式。');
      return;
    }
    setRich(mdText);
  } else if (next === 'source' || next === 'split') {
    setSource(mdText);
  }
  mode = next;
  document.body.dataset.mode = mode;
  $$('.view-switch button').forEach((b) => b.classList.toggle('selected', b.dataset.mode === mode));
  paint();
  if (mode === 'source' || mode === 'split') {
    source.requestMeasure();
  }
}
async function loadDocument(data) {
  syncing = true;
  try {
    metadata = { ...metadata, ...data };
    mdText = (data.text || '').replace(/\r\n?/g, '\n');
    diskText = (data.cleanText ?? mdText).replace(/\r\n?/g, '\n');
    setSource(mdText, true);
    const complex =
      mdText.length > 500000 ||
      /^---\n[\s\S]*?\n---/.test(mdText) ||
      /<(?:script|style|iframe|div|table)\b/i.test(mdText);
    if (complex) {
      mode = 'source';
      document.body.dataset.mode = mode;
      $$('.view-switch button').forEach((b) =>
        b.classList.toggle('selected', b.dataset.mode === mode),
      );
      toast('此文档已使用源码模式打开，保留原始内容。');
    } else {
      setRich(mdText);
    }
    renderRecent(data.recent || []);
    $('#write-pane').scrollTop = 0;
    $('#preview-pane').scrollTop = 0;
  } finally {
    syncing = false;
    paint();
  }
}
function renderRecent(items) {
  $('#recent').replaceChildren();
  if (!items.length) {
    $('#recent').innerHTML =
      '<p class="outline-empty">打开或保存文件后，<br>会在这里留下记录。</p>';
    return;
  }
  items.forEach((item) => {
    const b = document.createElement('button');
    b.textContent = item.name;
    const small = document.createElement('small');
    small.textContent = item.path;
    b.append(small);
    b.title = item.path;
    b.onclick = () => action('recent', { path: item.path });
    $('#recent').append(b);
  });
}
function textInsert(value, selectStart = 0, selectEnd = value.length) {
  if (mode === 'read') {
    return;
  }
  if (mode === 'write') {
    rich.editor.action(insert(value));
    rich.editor.action((ctx) => ctx.get(editorViewCtx).focus());
    flush();
    return;
  }
  const range = source.state.selection.main;
  source.dispatch({
    changes: { from: range.from, to: range.to, insert: value },
    selection: { anchor: range.from + selectStart, head: range.from + selectEnd },
    scrollIntoView: true,
  });
  source.focus();
}
function format(kind) {
  if (!ready || mode === 'read') {
    return;
  }
  if (mode === 'write') {
    const commands = {
      h1: [wrapInHeadingCommand.key, 1],
      h2: [wrapInHeadingCommand.key, 2],
      bold: [toggleStrongCommand.key],
      italic: [toggleEmphasisCommand.key],
      strike: [toggleStrikethroughCommand.key],
      bullet: [wrapInBulletListCommand.key],
      quote: [wrapInBlockquoteCommand.key],
      code: [createCodeBlockCommand.key],
      table: [insertTableCommand.key, { row: 3, col: 3 }],
    };
    if (commands[kind]) {
      rich.editor.action(callCommand(...commands[kind]));
      rich.editor.action((ctx) => ctx.get(editorViewCtx).focus());
      flush();
      return;
    }
    textInsert(
      kind === 'task' ? '- [ ] 待办事项' : kind === 'link' ? '[链接文字](https://example.com)' : '',
    );
    return;
  }
  const r = source.state.selection.main;
  const selected = source.state.sliceDoc(r.from, r.to);
  const wrappers = {
    bold: ['**', '**', '粗体文字'],
    italic: ['*', '*', '斜体文字'],
    strike: ['~~', '~~', '删除线文字'],
    code: ['```javascript\n', '\n```', '// 代码'],
    link: ['[', '](https://example.com)', '链接文字'],
  };
  if (wrappers[kind]) {
    const [a, b, c] = wrappers[kind];
    const t = selected || c;
    textInsert(a + t + b, a.length, a.length + t.length);
    return;
  }
  if (kind === 'table') {
    textInsert('\n| 标题一 | 标题二 |\n| --- | --- |\n| 内容 | 内容 |\n');
    return;
  }
  const prefixes = { h1: '# ', h2: '## ', bullet: '- ', task: '- [ ] ', quote: '> ' };
  const first = source.state.doc.lineAt(r.from);
  const last = source.state.doc.lineAt(r.to);
  const lines = source.state.sliceDoc(first.from, last.to).split('\n');
  const replacement = lines.map((l) => prefixes[kind] + l.replace(/^#{1,6} /, '')).join('\n');
  source.dispatch({ changes: { from: first.from, to: last.to, insert: replacement } });
  source.focus();
}
async function uploadImage(file) {
  if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) {
    throw Error('请选择 PNG、JPEG、GIF 或 WebP 图片。');
  }
  if (file.size > 4 * 1024 * 1024) {
    throw Error('单张图片请小于 4 MB。');
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function fallbackConfirm() {
  return mdText === diskText || confirm('当前文档有未保存的更改，是否放弃更改并继续？');
}
async function action(name, extra = {}) {
  if (!ready) {
    return;
  }
  if (name === 'theme') {
    appearance.toggleTheme();
    return;
  }
  if (name === 'focus') {
    document.body.classList.toggle('focus');
    return;
  }
  if (name === 'help') {
    $('#help-dialog').showModal();
    return;
  }
  if (name === 'settings') {
    $('#settings-dialog').showModal();
    return;
  }
  if (name === 'find') {
    await setMode('source');
    openSearchPanel(source);
    return;
  }
  if (name === 'image') {
    $('#image-input').click();
    return;
  }
  if (busy) {
    return;
  }
  flush();
  busy = true;
  try {
    if (name === 'export-word') {
      if (!host.available) {
        toast('请在页核桌面版中导出 Word。');
        return;
      }
      const button = $('[data-action="export-word"]');
      button.disabled = true;
      button.textContent = '导出中…';
      try {
        const title = metadata.name;
        const html = render(mdText, metadata.assetBase, true);
        const prepared = await host.request('prepare-word', { html });
        const { createWordDocument } = await import('./word-export.js');
        const { base64, warnings } = await createWordDocument(title, prepared.html);
        const result = await host.request('export-word', { base64 });
        if (result) {
          toast('Word 已导出 · ' + result.path);
          if (warnings.length) {
            $('#word-export-warning-text').textContent =
              warnings.join('；') + '。请在 Word 中检查相应公式。';
            $('#word-export-warning').showModal();
          }
        }
      } finally {
        button.disabled = false;
        button.textContent = '导出 Word';
      }
      return;
    }
    if (name === 'export-pdf') {
      if (!host.available) {
        toast('请在页核桌面版中导出 PDF。');
        return;
      }
      const options = await pdfSettings.open();
      if (!options) {
        return;
      }
      flush();
      const button = $('[data-action="export-pdf"]');
      button.disabled = true;
      button.textContent = '导出中…';
      try {
        const html = createPdfDocument(
          metadata.name,
          render(mdText, metadata.assetBase, true),
          options,
        );
        const result = await host.request('export-pdf', { html, options });
        if (result) {
          const remembered = pdfSettings.remember(options);
          toast('PDF 已导出 · ' + result.path + (remembered ? '' : '（设置未能保存到本机）'));
        }
      } finally {
        button.disabled = false;
        button.textContent = '导出 PDF';
      }
      return;
    }
    if (name === 'export') {
      const html = exportDocument(metadata.name, render(mdText, metadata.assetBase, true));
      if (host.available) {
        const r = await host.request('export', { html });
        if (r) {
          toast('HTML 已导出');
        }
      } else {
        download(metadata.name.replace(/\.[^.]+$/, '') + '.html', html, 'text/html');
        toast('已导出 HTML');
      }
      return;
    }
    if (host.available) {
      const result = await host.request(name, extra);
      if (result) {
        if (name === 'save' || name === 'save-as') {
          metadata = { ...metadata, ...result };
          diskText = result.cleanText;
          renderRecent(result.recent || []);
          updateStatus();
          toast('已保存 · ' + metadata.name);
        } else {
          await loadDocument(result);
          $('#recovery-banner').hidden = true;
        }
      }
    } else if (name === 'open') {
      if (fallbackConfirm()) {
        $('#open-input').click();
      }
    } else if (name === 'new') {
      if (fallbackConfirm()) {
        await loadDocument({ name: '未命名.md', text: '', path: null });
      }
    } else if (name === 'save' || name === 'save-as') {
      download(metadata.name, mdText, 'text/markdown');
      diskText = mdText;
      updateStatus();
      toast('已下载 Markdown 副本');
    } else if (name === 'restore' && recovery) {
      if (fallbackConfirm()) {
        await loadDocument({ ...recovery, path: null, cleanText: '' });
      }
      $('#recovery-banner').hidden = true;
    } else if (name === 'dismiss-recovery') {
      $('#recovery-banner').hidden = true;
      localStorage.removeItem('field-notes-draft');
    }
  } catch (e) {
    toast(e.message || String(e));
  } finally {
    busy = false;
  }
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-action]');
  if (a) {
    action(a.dataset.action);
  }
  const b = e.target.closest('[data-format]');
  if (b) {
    format(b.dataset.format);
  }
  const m = e.target.closest('button[data-mode]');
  if (m) {
    setMode(m.dataset.mode);
  }
  const link = e.target.closest('#preview a');
  if (link) {
    e.preventDefault();
    const url = link.getAttribute('href');
    if (url?.startsWith('#')) {
      const label = decodeURIComponent(url.slice(1));
      const h = $$('#preview h1,#preview h2,#preview h3').find(
        (el) => el.id === label || el.textContent.toLowerCase().replace(/\s+/g, '-') === label,
      );
      h?.scrollIntoView({ behavior: 'smooth' });
    } else if (/^https?:\/\//i.test(url || '')) {
      if (host.available) {
        host.request('external', { url }).catch((e) => toast(e.message));
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    }
  }
});
$$('[data-format]').forEach((b) => b.addEventListener('mousedown', (e) => e.preventDefault()));
$$('[data-side]').forEach(
  (b) =>
    (b.onclick = () => {
      $$('[data-side]').forEach((x) => x.classList.toggle('selected', x === b));
      $('#outline').hidden = b.dataset.side !== 'outline';
      $('#recent').hidden = b.dataset.side !== 'recent';
    }),
);
$('#close-help').onclick = () => $('#help-dialog').close();
$('#restore-draft').onclick = () => action('restore');
$('#dismiss-draft').onclick = () => {
  action('dismiss-recovery');
  $('#recovery-banner').hidden = true;
};
$$('.shortcut-button').forEach((b) => {
  for (const event of ['mouseenter', 'focus']) {
    b.addEventListener(event, () => b.classList.remove('tooltip-dismissed'));
  }
});
const shortcuts = setupShortcuts({
  document,
  storage: localStorage,
  run: (id) => (['bold', 'italic'].includes(id) ? format(id) : action(id)),
  canRun: (id) =>
    ready &&
    (!['bold', 'italic'].includes(id) ||
      !!document.activeElement?.closest('.ProseMirror,.cm-content')),
});
setupSettingsTabs(shortcuts);
document.addEventListener(
  'keydown',
  (e) => {
    if (e.key === 'Escape') {
      $$('.shortcut-button').forEach((b) => b.classList.add('tooltip-dismissed'));
    }
    if (e.key === 'Escape' && !document.querySelector('dialog[open]')) {
      document.body.classList.remove('focus');
    }
  },
  true,
);
$('#open-input').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) {
    return;
  }
  try {
    if (file.size > 10 * 1024 * 1024) {
      throw Error('文件超过 10 MB');
    }
    await loadDocument({
      name: file.name,
      text: await file.text(),
      path: null,
      cleanText: undefined,
    });
  } catch (err) {
    toast(err.message);
  }
  e.target.value = '';
};
$('#image-input').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) {
    return;
  }
  try {
    textInsert(`![${file.name.replace(/[[\]]/g, '')}](${await uploadImage(file)})`);
  } catch (err) {
    toast(err.message);
  }
  e.target.value = '';
};
window.addEventListener('beforeunload', (e) => {
  if (!host.isNative && flush() !== diskText) {
    e.preventDefault();
    e.returnValue = '';
  }
});

async function initialize() {
  appearance.apply();
  if (new URLSearchParams(location.search).has('embedded')) {
    document.body.classList.add('embedded');
  }
  source = new EditorView({
    state: EditorState.create({ doc: mdText, extensions: sourceExtensions() }),
    parent: $('#source-editor'),
  });
  rich = new Crepe({
    root: $('#rich-editor'),
    defaultValue: welcome,
    featureConfigs: {
      [Crepe.Feature.Placeholder]: { text: '从一行文字开始。输入 / 插入内容。' },
      [Crepe.Feature.ImageBlock]: {
        onUpload: uploadImage,
        proxyDomURL: (url) => assetURL(url, metadata.assetBase),
        inlineUploadButton: '选择图片',
        blockUploadButton: '选择图片',
        blockUploadPlaceholderText: '图片地址，或选择本地图片',
        blockCaptionPlaceholderText: '添加图片说明',
      },
      [Crepe.Feature.Latex]: { katexOptions: { trust: false, throwOnError: false } },
    },
  });
  rich.on((listener) =>
    listener.markdownUpdated(() => {
      if (!syncing && ready && mode === 'write') {
        flush();
      }
    }),
  );
  await rich.create();
  richReference = richDoc();
  richSnapshot = rich.getMarkdown();
  const pm = $('#rich-editor .ProseMirror');
  pm.setAttribute('aria-label', 'Markdown 正文编辑区');
  pm.setAttribute('role', 'textbox');
  pm.setAttribute('aria-multiline', 'true');
  ready = true;
  if (host.available) {
    const data = await host.request('ready');
    await loadDocument(data.document);
    recovery = data.recovery;
    $('#connection').textContent = '本地文件已连接';
  } else {
    try {
      recovery = JSON.parse(localStorage.getItem('field-notes-draft') || 'null');
    } catch {}
    paint();
    $('#connection').textContent = '浏览器模式 · 保存副本';
  }
  if (recovery && recovery.text !== mdText) {
    $('#recovery-banner').hidden = false;
  }
  $('#loading').hidden = true;
  paint();
}
window.FieldMarkdown = {
  flush,
  getMarkdown: () => flush(),
  setDocument: async (data) => {
    await window.FieldMarkdown.ready;
    if (flush() !== diskText && !confirm('替换当前未保存的文档？')) {
      return false;
    }
    await loadDocument(data);
    return true;
  },
  setMode,
  setTheme: (dark) => {
    appearance.setTheme(dark);
  },
  onChange: (fn) => {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  },
  focus: () =>
    mode === 'write'
      ? rich?.editor.action((ctx) => ctx.get(editorViewCtx).focus())
      : source?.focus(),
};
window.FieldMarkdown.ready = initialize().catch((error) => {
  $('#loading').textContent = '加载失败：' + error.message;
  console.error(error);
  throw error;
});
