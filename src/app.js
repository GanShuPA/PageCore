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
import { createTabBar } from './tab-bar.js';
import { setupFolderWorkspace } from './folder-workspace.js';
import { setupWorkspaceSearch } from './workspace-search.js';
import { setupUpdates } from './updates.js';
import { setupLayout } from './layout.js';
import { normalizeView } from './session-state.js';
import './workspace-search.css';
import welcome from './welcome.md';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import 'katex/dist/katex.min.css';
import './style.css';
import './window-frame.css';
import './settings.css';
import './pdf-settings.css';
import './tabs.css';
import './workspace.css';
import './layout.css';

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
let activeTabId = null;
let sessionEnabled = false;
let sessionTimer;
let untitledCount = 0;
const tabs = new Map();
const subscribers = new Set();
const render = createRenderer(window);
const host = createHostBridge({
  window,
  getText: flush,
  getTabId: () => activeTabId,
  getDark: () => document.body.classList.contains('dark'),
  onNotice: toast,
  onWindowState: updateWindowState,
});
const appearance = setupAppearance(() => {
  source?.requestMeasure();
  host.windowCommand('theme', { dark: document.body.classList.contains('dark') });
});
const pdfSettings = setupPdfSettings();
const updates = setupUpdates({ host, notice: toast });
const sourceExtensions = () =>
  createSourceExtensions({
    isSyncing: () => syncing,
    getMode: () => mode,
    onTextChange: updateText,
    onSelectionChange: () => {
      updateStatus();
      scheduleSession();
    },
  });
initializeIcons();
setupWindowFrame(host);
const layout = setupLayout({ measure: () => source?.requestMeasure() });
function showSidebar(panel, { reveal = true } = {}) {
  if (reveal) {
    layout.revealSidebar();
  }
  $$('[data-side]').forEach((button) => {
    button.classList.toggle('selected', button.dataset.side === panel);
    button.setAttribute('aria-pressed', String(button.dataset.side === panel));
  });
  $('#outline').hidden = panel !== 'outline';
  $('#recent').hidden = panel !== 'recent';
  $('#workspace-panel').hidden = panel !== 'files';
  $('#workspace-search-panel').hidden = panel !== 'search';
}
const workspaceSearch = setupWorkspaceSearch({ host, run: action, show: showSidebar });
const folderWorkspace = setupFolderWorkspace({
  host,
  run: action,
  show: showSidebar,
  notice: toast,
  onFolderChange: (folder) => workspaceSearch.setFolder(folder),
});
const renderTabs = createTabBar($('#document-tabs'), {
  select: (id) => action('select-tab', { targetId: id }),
  close: (id) => action('close-tab', { targetId: id }),
  closeShortcut: () => shortcuts.getBindings()['close-tab'],
});

function updateTabs() {
  renderTabs(
    [...tabs].map(([id, tab]) => ({
      id,
      name: id === activeTabId ? metadata.name : tab.metadata.name,
      path: id === activeTabId ? metadata.path : tab.metadata.path,
      dirty: id === activeTabId ? mdText !== diskText : tab.mdText !== tab.diskText,
    })),
    activeTabId,
  );
}

function captureTab() {
  if (!activeTabId) {
    return;
  }
  flush();
  tabs.set(activeTabId, {
    metadata,
    mdText,
    diskText,
    mode,
    richReference,
    richSnapshot,
    sourceState: source.state,
    richState: rich.editor.action((ctx) => ctx.get(editorViewCtx).state),
    writeScroll: $('#write-pane').scrollTop,
    previewScroll: $('#preview-pane').scrollTop,
    sourceScroll: source.scrollSnapshot(),
    sourceTop: ['source', 'split'].includes(mode)
      ? source.scrollDOM.scrollTop
      : tabs.get(activeTabId)?.sourceTop || 0,
  });
}

function revealTab() {
  document.body.dataset.mode = mode;
  $$('.view-switch button').forEach((b) => b.classList.toggle('selected', b.dataset.mode === mode));
  paint();
  source.requestMeasure();
  $('#tab-' + activeTabId)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function activateTab(id) {
  if (id === activeTabId) {
    return;
  }
  const tab = tabs.get(id);
  if (!tab) {
    throw Error('标签页已关闭。');
  }
  captureTab();
  clearTimeout(paintTimer);
  syncing = true;
  try {
    activeTabId = id;
    ({ metadata, mdText, diskText, mode, richReference, richSnapshot } = tab);
    document.body.dataset.mode = mode;
    source.setState(tab.sourceState);
    if (mode === 'source' || mode === 'split') {
      source.dispatch({ effects: tab.sourceScroll });
    }
    rich.editor.action((ctx) => ctx.get(editorViewCtx).updateState(tab.richState));
  } finally {
    syncing = false;
  }
  revealTab();
  $('#write-pane').scrollTop = tab.writeScroll;
  $('#preview-pane').scrollTop = tab.previewScroll;
}

function sessionSnapshot() {
  captureTab();
  return [...tabs].map(([tabId, tab]) => ({
    tabId,
    view: normalizeView(
      {
        mode: tab.mode,
        anchor: tab.sourceState.selection.main.anchor,
        head: tab.sourceState.selection.main.head,
        sourceTop: tab.sourceTop,
        writeTop: tab.writeScroll,
        previewTop: tab.previewScroll,
      },
      tab.mdText.length,
    ),
  }));
}
function scheduleSession() {
  if (!sessionEnabled || !ready) {
    return;
  }
  clearTimeout(sessionTimer);
  sessionTimer = setTimeout(() => {
    if (busy) {
      scheduleSession();
      return;
    }
    host.notifySession(sessionSnapshot());
  }, 500);
}
async function restoreView(value) {
  if (!value) {
    return;
  }
  const view = normalizeView(value, mdText.length);
  const sourceOnly =
    mdText.length > 500000 ||
    /^---\n[\s\S]*?\n---/.test(mdText) ||
    /<(?:script|style|iframe|div|table)\b/i.test(mdText);
  mode = sourceOnly && view.mode === 'write' ? 'source' : view.mode;
  if (mode === 'source' || mode === 'split') {
    setSource(mdText);
  }
  revealTab();
  source.dispatch({ selection: { anchor: view.anchor, head: view.head } });
  await new Promise(requestAnimationFrame);
  await new Promise(requestAnimationFrame);
  source.scrollDOM.scrollTop = view.sourceTop;
  $('#write-pane').scrollTop = view.writeTop;
  $('#preview-pane').scrollTop = view.previewTop;
}
function jumpToSearchHit(hit) {
  setSource(mdText);
  mode = 'source';
  revealTab();
  const line = source.state.doc.line(Math.max(1, Math.min(source.state.doc.lines, hit.line)));
  let from = line.from + Math.min(line.length, hit.column);
  if (mdText.slice(from, from + hit.length) !== hit.match) {
    const nearby = line.text.indexOf(hit.match);
    if (nearby >= 0) {
      from = line.from + nearby;
    } else {
      from = line.from;
      toast('内容已变化，已定位到原行；请重新搜索。');
    }
  }
  source.dispatch({
    selection: { anchor: from, head: Math.min(mdText.length, from + hit.length) },
    effects: EditorView.scrollIntoView(from, { y: 'center' }),
  });
  source.focus();
}
async function openTab(data) {
  const id = data.id || crypto.randomUUID();
  if (tabs.has(id)) {
    activateTab(id);
    return;
  }
  captureTab();
  activeTabId = id;
  mode = 'write';
  await loadDocument({ ...data, id, assetBase: data.assetBase || '' });
  await restoreView(data.view);
  captureTab();
  revealTab();
}

async function selectTab(id) {
  if (id === activeTabId) {
    return true;
  }
  if (host.available) {
    const result = await host.request('select-tab', { targetId: id });
    if (!result) {
      return false;
    }
  }
  activateTab(id);
  return true;
}

function markSaved(data) {
  const id = data.id || activeTabId;
  if (id === activeTabId) {
    metadata = { ...metadata, ...data };
    diskText = data.cleanText;
    renderRecent(data.recent || []);
    updateStatus();
  } else if (tabs.has(id)) {
    const tab = tabs.get(id);
    tab.metadata = { ...tab.metadata, ...data };
    tab.diskText = data.cleanText;
    updateTabs();
  }
}

function persistBrowserDrafts() {
  if (host.available) {
    return;
  }
  try {
    const documents = [
      ...[...tabs]
        .filter(([id, tab]) => id !== activeTabId && tab.mdText !== tab.diskText)
        .map(([, tab]) => ({ text: tab.mdText, name: tab.metadata.name })),
      ...(mdText !== diskText ? [{ text: mdText, name: metadata.name }] : []),
    ];
    if (documents.length) {
      localStorage.setItem('field-notes-draft', JSON.stringify({ documents }));
    } else {
      localStorage.removeItem('field-notes-draft');
    }
  } catch {}
}

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('#toast').hidden = true), 4200);
}
function confirmInApp(title, message, label) {
  const dialog = $('#confirm-dialog');
  if (dialog.open) {
    return Promise.resolve(false);
  }
  $('#confirm-title').textContent = title;
  $('#confirm-message').textContent = message;
  $('#confirm-submit').textContent = label;
  dialog.returnValue = 'cancel';
  return new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), {
      once: true,
    });
    dialog.showModal();
  });
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
  scheduleSession();
  if (host.isNative) {
    host.notifyChange(mdText);
  } else {
    persistBrowserDrafts();
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
  updateTabs();
  folderWorkspace.setActive(metadata.path);
  const dirty = mdText !== diskText;
  document.body.classList.toggle('dirty', dirty);
  $('#document-name').textContent = metadata.name;
  $('#save-state').textContent = dirty ? '未保存' : '已就绪';
  $('#document-path').textContent = metadata.path || '本地工作空间 / ' + metadata.name;
  $('#document-path').title = $('#document-path').textContent;
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
  if (!ready || busy || !['write', 'source', 'split', 'read'].includes(next) || mode === next) {
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
  scheduleSession();
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
    metadata = { encoding: 'UTF-8', eol: 'LF', path: null, assetBase: '', ...data };
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
    if (activeTabId) {
      captureTab();
    }
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
function validateImage(file) {
  if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) {
    throw Error('请选择 PNG、JPEG、GIF 或 WebP 图片。');
  }
  if (!file.size || file.size > 10 * 1024 * 1024) {
    throw Error('图片不能为空，单张图片不能超过 10 MB。');
  }
}
function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}
function setImageBusy(value) {
  busy = value;
  for (const element of [$('.workspace'), $('.app-header'), $('.window-controls')]) {
    element.inert = value;
  }
  $('#image-progress').hidden = !value;
}
async function imageDestination() {
  if (host.isNative && !metadata.path) {
    toast('请先保存文档，以便将图片放在文档旁边。');
    const saved = await host.request('save');
    if (!saved) {
      toast('已取消插入图片。');
      return false;
    }
    markSaved(saved);
    await folderWorkspace.refresh();
  }
  return true;
}
async function storeImage(file) {
  const data = await readImage(file);
  if (!host.isNative) {
    return data;
  }
  const result = await host.request('import-image', {
    mime: file.type,
    base64: data.slice(data.indexOf(',') + 1),
  });
  if (!result?.path) {
    throw Error('图片保存失败。');
  }
  return result.path;
}
async function chooseNativeImages(multiple) {
  if (!ready || busy) {
    return [];
  }
  const files = [];
  setImageBusy(true);
  try {
    const selection = await host.request('choose-images', { multiple });
    if (!selection) {
      return [];
    }
    for (const item of selection.files) {
      const result = await host.request('read-chosen-image', { token: item.token });
      const binary = atob(result.base64);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      files.push(new File([bytes], item.name, { type: item.mime }));
    }
  } catch (error) {
    toast(error.message || String(error));
    return [];
  } finally {
    setImageBusy(false);
  }
  return files;
}
function imageMarkdown(file, path) {
  const name = (file.name || '图片')
    .replaceAll('[', ' ')
    .replaceAll(']', ' ')
    .replaceAll('\\', ' ')
    .replace(/[\r\n]/g, ' ')
    .slice(0, 120);
  return `![${name}](${path})`;
}
async function importImages(files) {
  if (!ready || busy || mode === 'read' || !files.length) {
    return;
  }
  const results = [];
  let acquired = false;
  try {
    files.forEach(validateImage);
    setImageBusy(true);
    acquired = true;
    if (!(await imageDestination())) {
      return;
    }
    for (const file of files) {
      results.push(imageMarkdown(file, await storeImage(file)));
    }
  } catch (error) {
    toast((results.length ? `已插入 ${results.length} 张，其余图片未完成：` : '') + error.message);
  } finally {
    if (acquired) {
      setImageBusy(false);
    }
    if (results.length) {
      const markdown = results.join('\n\n');
      textInsert(markdown, markdown.length, markdown.length);
    } else if (acquired) {
      window.FieldMarkdown.focus();
    }
  }
}
// Crepe's own image picker applies the returned URL to its image node in a microtask.
async function uploadImage(file) {
  let acquired = false;
  try {
    if (!ready || busy) {
      throw Error('请等待当前操作完成。');
    }
    validateImage(file);
    setImageBusy(true);
    acquired = true;
    if (!(await imageDestination())) {
      return '';
    }
    return await storeImage(file);
  } catch (error) {
    toast(error.message);
    return '';
  } finally {
    if (acquired) {
      setTimeout(() => setImageBusy(false), 0);
    }
  }
}
function editorForTransfer(target) {
  if (!(target instanceof Element)) {
    return null;
  }
  if (mode === 'write' && target.closest('#write-pane')) {
    return $('#write-pane');
  }
  if ((mode === 'source' || mode === 'split') && target.closest('#source-pane')) {
    return $('#source-pane');
  }
  return null;
}
function positionForDrop(event) {
  if (mode === 'write') {
    rich.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const location = view.posAtCoords({ left: event.clientX, top: event.clientY });
      if (location) {
        const selection = view.state.selection.constructor.near(
          view.state.doc.resolve(location.pos),
        );
        view.dispatch(view.state.tr.setSelection(selection));
      }
    });
  } else {
    const position = source.posAtCoords({ x: event.clientX, y: event.clientY });
    if (position !== null) {
      source.dispatch({ selection: { anchor: position } });
    }
  }
}
function transferFiles(transfer) {
  return [...(transfer?.files || [])];
}
document.addEventListener(
  'click',
  async (event) => {
    const input = event.target;
    if (
      !host.isNative ||
      !(input instanceof HTMLInputElement) ||
      input.type !== 'file' ||
      !input.closest('#rich-editor')
    ) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const files = await chooseNativeImages(false);
    if (files.length && input.isConnected) {
      const transfer = new DataTransfer();
      transfer.items.add(files[0]);
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  },
  true,
);
document.addEventListener(
  'paste',
  (event) => {
    const files = transferFiles(event.clipboardData);
    if (!editorForTransfer(event.target) || !files.some((file) => file.type.startsWith('image/'))) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    importImages(files);
  },
  true,
);
document.addEventListener(
  'dragover',
  (event) => {
    if (!event.dataTransfer?.types.includes('Files')) {
      return;
    }
    event.preventDefault();
    const editor = editorForTransfer(event.target);
    $$('.image-drop-target').forEach((element) =>
      element.classList.toggle('image-drop-target', element === editor),
    );
    if (editor && !busy) {
      editor.classList.add('image-drop-target');
      event.dataTransfer.dropEffect = 'copy';
    } else {
      event.dataTransfer.dropEffect = 'none';
    }
  },
  true,
);
document.addEventListener(
  'dragleave',
  (event) => {
    if (!event.relatedTarget || !editorForTransfer(event.relatedTarget)) {
      $$('.image-drop-target').forEach((element) => element.classList.remove('image-drop-target'));
    }
  },
  true,
);
document.addEventListener(
  'drop',
  (event) => {
    const files = transferFiles(event.dataTransfer);
    if (!files.length) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    $$('.image-drop-target').forEach((element) => element.classList.remove('image-drop-target'));
    if (!editorForTransfer(event.target)) {
      toast('请将图片拖入正文编辑区。');
      return;
    }
    if (!busy) {
      positionForDrop(event);
      importImages(files);
    }
  },
  true,
);
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
async function action(name, extra = {}) {
  if (!ready || busy) {
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
  if (name === 'workspace-search') {
    workspaceSearch.open();
    return;
  }
  if (name === 'find') {
    await setMode('source');
    openSearchPanel(source);
    return;
  }
  if (name === 'image') {
    if (host.isNative) {
      const files = await chooseNativeImages(true);
      if (files.length) {
        await importImages(files);
      }
    } else {
      $('#image-input').dataset.tabId = activeTabId;
      $('#image-input').click();
    }
    return;
  }
  flush();
  busy = true;
  try {
    if (name.startsWith('workspace:')) {
      if (!host.available) {
        throw new Error('请在页核桌面版中使用文件夹工作区。');
      }
      const result = await host.request(name, extra);
      if (result?.document) {
        await openTab(result.document);
        if (extra.searchHit) {
          jumpToSearchHit(extra.searchHit);
        }
      }
      if (name === 'workspace:rename' && result) {
        for (const change of result.documents) {
          if (change.id === activeTabId) {
            metadata = { ...metadata, ...change };
          } else if (tabs.has(change.id)) {
            const tab = tabs.get(change.id);
            tab.metadata = { ...tab.metadata, ...change };
          }
        }
        renderRecent(result.recent || []);
        paint();
      }
      return result;
    }
    if (name === 'select-tab' || name === 'next-tab' || name === 'previous-tab') {
      const ids = [...tabs.keys()];
      const offset = name === 'previous-tab' ? -1 : 1;
      const id =
        extra.targetId || ids[(ids.indexOf(activeTabId) + offset + ids.length) % ids.length];
      await selectTab(id);
      return;
    }
    if (name === 'close-tab') {
      if (!(await selectTab(extra.targetId || activeTabId))) {
        return;
      }
      const closingId = activeTabId;
      let result;
      if (host.available) {
        result = await host.request('close-tab');
        if (!result) {
          return;
        }
      } else if (
        mdText !== diskText &&
        !(await confirmInApp(
          '关闭文档？',
          '“' + metadata.name + '”有未保存的更改，关闭后这些更改将被放弃。',
          '不保存并关闭',
        ))
      ) {
        return;
      }
      const ids = [...tabs.keys()];
      const index = ids.indexOf(closingId);
      tabs.delete(closingId);
      activeTabId = null;
      if (result) {
        await openTab(result);
      } else if (tabs.size) {
        activateTab([...tabs.keys()][Math.min(index, tabs.size - 1)]);
      } else {
        await openTab({ name: `未命名 ${++untitledCount}.md`, text: '', path: null });
      }
      updateTabs();
      window.FieldMarkdown.focus();
      return;
    }
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
          markSaved(result);
          toast('已保存 · ' + metadata.name);
          await folderWorkspace.refresh();
        } else {
          for (const document of result.documents || [result]) {
            await openTab(document);
          }
          window.FieldMarkdown.focus();
          $('#recovery-banner').hidden = true;
        }
      }
    } else if (name === 'open') {
      $('#open-input').click();
    } else if (name === 'new') {
      await openTab({ name: `未命名 ${++untitledCount}.md`, text: '', path: null });
      window.FieldMarkdown.focus();
    } else if (name === 'save' || name === 'save-as') {
      download(metadata.name, mdText, 'text/markdown');
      diskText = mdText;
      updateStatus();
      toast('已下载 Markdown 副本');
    } else if (name === 'restore' && recovery) {
      for (const draft of recovery.documents || [recovery]) {
        await openTab({ ...draft, path: null, cleanText: '' });
      }
      $('#recovery-banner').hidden = true;
    } else if (name === 'dismiss-recovery') {
      $('#recovery-banner').hidden = true;
      localStorage.removeItem('field-notes-draft');
    }
  } catch (e) {
    toast(e.message || String(e));
    if (name.startsWith('workspace:')) {
      return { error: e.message || String(e) };
    }
  } finally {
    persistBrowserDrafts();
    busy = false;
    scheduleSession();
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
$$('[data-side]').forEach((b) => (b.onclick = () => showSidebar(b.dataset.side)));
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
    !busy &&
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
    await openTab({
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
  const files = [...e.target.files];
  if (!files.length) {
    return;
  }
  if (e.target.dataset.tabId !== activeTabId) {
    toast('文档已切换，请重新选择图片。');
  } else {
    await importImages(files);
  }
  e.target.value = '';
};
document.addEventListener('scroll', scheduleSession, { capture: true, passive: true });
window.addEventListener('beforeunload', (e) => {
  if (sessionEnabled) {
    host.notifySession(sessionSnapshot());
  }
  captureTab();
  if (!host.isNative && [...tabs.values()].some((tab) => tab.mdText !== tab.diskText)) {
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
    for (const document of data.documents || [data.document]) {
      await openTab(document);
    }
    if (data.activeId && tabs.has(data.activeId)) {
      activateTab(data.activeId);
    }
    sessionEnabled = Boolean(data.sessionSupported);
    await folderWorkspace.setFolder(data.folder || null, { reveal: false });
    recovery = data.recovery;
    $('#connection').textContent = '本地文件已连接';
  } else {
    await openTab({ name: metadata.name, text: mdText });
    try {
      recovery = JSON.parse(localStorage.getItem('field-notes-draft') || 'null');
    } catch {}
    paint();
    $('#connection').textContent = '浏览器模式 · 保存副本';
  }
  if (recovery && (recovery.text || recovery.documents?.length || recovery.pending)) {
    $('#recovery-banner').hidden = false;
  }
  $('#loading').hidden = true;
  paint();
}
window.FieldMarkdown = {
  flush,
  flushAll: (includeView = false) => {
    captureTab();
    const views = new Map(sessionSnapshot().map((entry) => [entry.tabId, entry.view]));
    return [...tabs].map(([id, tab]) => ({
      tabId: id,
      text: tab.mdText,
      ...(includeView ? { view: views.get(id) } : {}),
    }));
  },
  markSaved,
  sessionSnapshot,
  getMarkdown: () => flush(),
  setDocument: async (data) => {
    await window.FieldMarkdown.ready;
    if (busy) {
      return false;
    }
    if (
      flush() !== diskText &&
      !(await confirmInApp(
        '替换文档？',
        '当前文档有未保存的更改，替换后这些更改将被放弃。',
        '替换文档',
      ))
    ) {
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
window.FieldMarkdown.ready = initialize()
  .then(() => updates.start())
  .catch((error) => {
    $('#loading').textContent = '加载失败：' + error.message;
    console.error(error);
    throw error;
  });
