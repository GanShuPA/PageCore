import { $, $$ } from './dom.js';

const parentPath = (path) => path.slice(0, Math.max(0, path.lastIndexOf('/')));
const samePath = (a, b) =>
  a?.replaceAll('\\', '/').toLowerCase() === b?.replaceAll('\\', '/').toLowerCase();

/** The host owns filesystem access. This view keeps only a lazily loaded directory tree. */
export function setupFolderWorkspace({ host, run, show, notice, onFolderChange = () => {} }) {
  let folder = null;
  let generation = 0;
  let selected = null;
  let activePath = null;
  let editing = null;
  let refreshing = false;
  const children = new Map();
  const expanded = new Set();
  const loading = new Set();
  const errors = new Map();
  const tree = $('#workspace-tree');
  const dialog = $('#workspace-dialog');
  const nameInput = $('#workspace-name');

  function select(entry) {
    selected = entry;
    $('#workspace-root').classList.toggle('selected', !selected);
    $('[data-workspace="rename"]').disabled = !entry || entry.directory;
    $$('.workspace-row').forEach((row) => {
      row.classList.toggle('selected', row.dataset.path === entry?.path);
      const absolute = folder.root.replace(/\\?$/, '\\') + row.dataset.path.replaceAll('/', '\\');
      if (samePath(absolute, activePath)) {
        row.setAttribute('aria-current', 'page');
      } else {
        row.removeAttribute('aria-current');
      }
    });
  }

  function render() {
    if (!folder) {
      return;
    }
    const focusPath = tree.contains(document.activeElement)
      ? document.activeElement.dataset.path
      : null;
    tree.replaceChildren();
    function append(parent, path, depth) {
      if (!children.has(path)) {
        const message = document.createElement('li');
        message.className = 'tree-message';
        message.role = 'none';
        message.textContent = errors.get(path) || '正在读取…';
        parent.append(message);
        return;
      }
      if (!children.get(path).length) {
        const message = document.createElement('li');
        message.className = 'tree-message';
        message.role = 'none';
        message.textContent = '没有 Markdown 或文本文件';
        parent.append(message);
      }
      for (const entry of children.get(path)) {
        const item = document.createElement('li');
        item.role = 'none';
        const row = document.createElement('button');
        row.className = 'workspace-row';
        row.dataset.path = entry.path;
        row.role = 'treeitem';
        row.setAttribute('aria-level', depth);
        row.setAttribute('aria-label', entry.name);
        row.title = entry.path;
        row.style.paddingLeft = `${(depth - 1) * 13 + 4}px`;
        const arrow = document.createElement('span');
        arrow.className = 'tree-arrow';
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = entry.directory ? (expanded.has(entry.path) ? '▾' : '▸') : '';
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.setAttribute('viewBox', '0 0 24 24');
        icon.setAttribute('aria-hidden', 'true');
        icon.innerHTML = entry.directory
          ? '<path d="M3 7V4h7l3 3h8v13H3zM3 10h18"/>'
          : '<path d="M5 2h9l5 5v15H5zM14 2v6h5M8 12h8M8 16h6"/>';
        const label = document.createElement('span');
        label.textContent = entry.name;
        row.append(arrow, icon, label);
        row.onfocus = () => select(entry);
        row.onclick = async () => {
          select(entry);
          if (entry.directory) {
            if (expanded.has(entry.path)) {
              expanded.delete(entry.path);
            } else {
              expanded.add(entry.path);
              load(entry.path);
            }
            render();
          } else {
            await run('workspace:file', { path: entry.path });
          }
        };
        if (entry.directory) {
          row.setAttribute('aria-expanded', expanded.has(entry.path));
        }
        item.append(row);
        if (entry.directory && expanded.has(entry.path)) {
          const group = document.createElement('ul');
          group.role = 'group';
          append(group, entry.path, depth + 1);
          item.append(group);
        }
        parent.append(item);
      }
    }
    append(tree, '', 1);
    select(selected);
    if (focusPath !== null) {
      $$('.workspace-row')
        .find((row) => row.dataset.path === focusPath)
        ?.focus();
    }
  }

  async function load(path, force = false) {
    if (!folder || loading.has(path) || (!force && children.has(path))) {
      return;
    }
    const version = generation;
    loading.add(path);
    errors.delete(path);
    try {
      const result = await host.request('workspace:list', { path });
      if (version !== generation) {
        return;
      }
      children.set(path, result.entries);
    } catch (error) {
      if (version === generation) {
        errors.set(path, error.message);
        $('#workspace-status').textContent = error.message;
      }
    } finally {
      if (version === generation) {
        loading.delete(path);
        render();
      }
    }
  }

  async function setFolder(value, { reveal = true } = {}) {
    generation++;
    folder = value;
    onFolderChange(folder);
    selected = null;
    children.clear();
    expanded.clear();
    errors.clear();
    loading.clear();
    tree.replaceChildren();
    $('#folder-content').hidden = !folder;
    $('.workspace-empty').hidden = Boolean(folder);
    if (folder) {
      $('#workspace-root').textContent = folder.name || folder.root;
      $('#workspace-root').title = folder.root;
      $('#workspace-status').textContent = '仅显示 .md / .markdown / .txt';
      show('files', { reveal });
      await load('');
    }
  }

  async function refresh() {
    if (!folder || refreshing) {
      return;
    }
    refreshing = true;
    const version = generation;
    $('[data-workspace="refresh"]').disabled = true;
    $('#workspace-status').textContent = '正在刷新…';
    try {
      const queue = [''];
      const visible = new Set();
      for (let index = 0; index < queue.length; index++) {
        if (generation !== version) {
          return;
        }
        const path = queue[index];
        await load(path, true);
        visible.add(path);
        for (const entry of children.get(path) || []) {
          if (entry.directory && expanded.has(entry.path)) {
            queue.push(entry.path);
          }
        }
      }
      if (generation === version) {
        for (const path of errors.keys()) {
          if (!visible.has(path)) {
            errors.delete(path);
          }
        }
        if (selected && ![...children.values()].flat().some((e) => e.path === selected.path)) {
          select(null);
        }
        $('#workspace-status').textContent = errors.size
          ? [...errors.values()][0]
          : '已刷新 · .md / .markdown / .txt';
      }
    } finally {
      refreshing = false;
      $('[data-workspace="refresh"]').disabled = false;
    }
  }

  function edit(command) {
    const parent = selected ? (selected.directory ? selected.path : parentPath(selected.path)) : '';
    editing = { command, path: command === 'rename' ? selected.path : parent };
    $('#workspace-dialog-title').textContent =
      command === 'rename' ? '重命名文档' : command === 'create-folder' ? '新建文件夹' : '新建文档';
    $('#workspace-location').textContent = folder.root + (parent ? ' / ' + parent : '');
    $('#workspace-name-hint').hidden = command === 'create-folder';
    $('#workspace-error').textContent = '';
    $('#workspace-submit').textContent = command === 'rename' ? '重命名' : '创建';
    nameInput.value =
      command === 'rename' ? selected.name : command === 'create-file' ? '未命名.md' : '';
    dialog.showModal();
    nameInput.focus();
    nameInput.setSelectionRange(
      0,
      command !== 'create-folder' ? nameInput.value.lastIndexOf('.') : nameInput.value.length,
    );
  }

  document.addEventListener('click', async (event) => {
    const command = event.target.closest('[data-workspace]')?.dataset.workspace;
    if (!command) {
      return;
    }
    if (!host.available) {
      notice('请在页核桌面版中打开本地文件夹工作区。');
      return;
    }
    if (command === 'choose') {
      const result = await run('workspace:choose');
      if (result && !result.error) {
        await setFolder(result);
      }
    } else if (command === 'close') {
      const result = await run('workspace:close');
      if (result && !result.error) {
        await setFolder(null);
      }
    } else if (command === 'refresh') {
      await refresh();
    } else if (folder && (command !== 'rename' || (selected && !selected.directory))) {
      edit(command);
    }
  });

  $('#workspace-root').onclick = () => select(null);
  $('#workspace-cancel').onclick = $('#workspace-cancel-x').onclick = () => dialog.close();
  $('#workspace-form').onsubmit = async (event) => {
    event.preventDefault();
    let name = nameInput.value;
    if (editing.command !== 'create-folder' && !name.includes('.')) {
      name += '.md';
    }
    const button = $('#workspace-submit');
    button.disabled = true;
    try {
      const result = await run('workspace:' + editing.command, { path: editing.path, name });
      if (!result || result.error) {
        $('#workspace-error').textContent = result?.error || '操作未完成，请稍后重试。';
        return;
      }
      dialog.close();
      const parent = editing.command === 'rename' ? parentPath(editing.path) : editing.path;
      if (parent) {
        expanded.add(parent);
      }
      selected = null;
      await refresh();
    } finally {
      button.disabled = false;
    }
  };
  tree.addEventListener('keydown', (event) => {
    const rows = $$('.workspace-row');
    const index = rows.indexOf(document.activeElement);
    if (index < 0) {
      return;
    }
    const row = rows[index];
    let target;
    if (event.key === 'ArrowDown') {
      target = rows[Math.min(index + 1, rows.length - 1)];
    } else if (event.key === 'ArrowUp') {
      target = rows[Math.max(index - 1, 0)];
    } else if (event.key === 'Home') {
      target = rows[0];
    } else if (event.key === 'End') {
      target = rows.at(-1);
    } else if (event.key === 'ArrowRight' && row.hasAttribute('aria-expanded')) {
      if (row.getAttribute('aria-expanded') === 'false') {
        row.click();
      } else {
        target = rows[index + 1];
      }
    } else if (event.key === 'ArrowLeft') {
      if (row.getAttribute('aria-expanded') === 'true') {
        row.click();
      } else {
        target = rows.find((r) => r.dataset.path === parentPath(row.dataset.path));
      }
    } else if (event.key === 'F2' && selected && !selected.directory) {
      edit('rename');
    } else {
      return;
    }
    event.preventDefault();
    target?.focus();
  });
  window.addEventListener('focus', () => {
    if (!$('#workspace-panel').hidden && !dialog.open) {
      refresh();
    }
  });
  return {
    setFolder,
    refresh,
    setActive(path) {
      if (samePath(activePath, path)) {
        return;
      }
      activePath = path;
      if (folder) {
        select(selected);
      }
    },
  };
}
