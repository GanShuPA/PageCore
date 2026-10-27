export const shortcutCommands = [
  ['new', '新建文档', 'Ctrl+N'],
  ['open', '打开文件', 'Ctrl+O'],
  ['save', '保存', 'Ctrl+S'],
  ['save-as', '另存为', 'Ctrl+Shift+S'],
  ['close-tab', '关闭标签页', 'Ctrl+W'],
  ['next-tab', '下一个标签页', 'Ctrl+Tab'],
  ['previous-tab', '上一个标签页', 'Ctrl+Shift+Tab'],
  ['find', '查找与替换', 'Ctrl+F'],
  ['bold', '加粗', 'Ctrl+B'],
  ['italic', '斜体', 'Ctrl+I'],
  ['focus', '专注模式', 'F8'],
  ['settings', '打开设置', 'Ctrl+,'],
];
export const defaultShortcuts = Object.fromEntries(
  shortcutCommands.map(([id, , key]) => [id, key]),
);
const storageKey = 'pagecore-shortcuts-v1';
// Leave system, clipboard, navigation and editor history shortcuts available.
const reserved = new Set([
  'Ctrl+A',
  'Ctrl+C',
  'Ctrl+X',
  'Ctrl+V',
  'Ctrl+Z',
  'Ctrl+Y',
  'Ctrl+Shift+Z',
  'Ctrl+Shift+V',
  'Ctrl+R',
  'Ctrl+Shift+R',
  'Ctrl+L',
  'Ctrl+T',
  'Ctrl+Shift+T',
  'Ctrl+Shift+W',
  'Ctrl+P',
  'Ctrl+H',
  'Ctrl+J',
  'Ctrl+D',
  'Ctrl+E',
  'Ctrl+K',
  'Ctrl+U',
]);
export function validShortcut(key) {
  return (
    typeof key === 'string' &&
    !reserved.has(key) &&
    (/^(Ctrl\+(Shift\+)?([A-Z0-9]|,|Tab))$/.test(key) || /^(Ctrl\+)?(Shift\+)?F(2|8|9)$/.test(key))
  );
}
export function eventShortcut(e) {
  if (e.isComposing || e.keyCode === 229 || e.altKey || e.metaKey) {
    return null;
  }
  const key = /^Key[A-Z]$/.test(e.code)
    ? e.code.slice(3)
    : /^Digit[0-9]$/.test(e.code)
      ? e.code.slice(5)
      : e.code === 'Comma'
        ? ','
        : /^F\d+$/.test(e.key) || e.key === 'Tab'
          ? e.key
          : e.key?.length === 1
            ? e.key.toUpperCase()
            : null;
  return key ? `${e.ctrlKey ? 'Ctrl+' : ''}${e.shiftKey ? 'Shift+' : ''}${key}` : null;
}
export function loadShortcuts(storage) {
  try {
    const saved = JSON.parse(storage.getItem(storageKey));
    const result = { ...defaultShortcuts, ...saved };
    const values = shortcutCommands.map(([id]) => result[id]);
    if (values.every(validShortcut) && new Set(values).size === values.length) {
      return Object.fromEntries(shortcutCommands.map(([id]) => [id, result[id]]));
    }
  } catch {}
  return { ...defaultShortcuts };
}
export function setupShortcuts({ document, storage, run, canRun = () => true }) {
  let bindings = loadShortcuts(storage);
  let recording = null;
  const list = document.querySelector('#shortcut-list');
  const status = document.querySelector('#shortcut-status');
  const buttons = new Map();
  function announce(message) {
    status.textContent = message;
  }
  function sync() {
    for (const [id, label] of shortcutCommands) {
      const key = bindings[id];
      const button = buttons.get(id);
      button.textContent = key;
      button.classList.remove('recording');
      button.setAttribute('aria-label', `${label}：${key}，点击修改`);
      const selector = ['bold', 'italic'].includes(id)
        ? `[data-format="${id}"]`
        : `[data-action="${id}"]`;
      for (const target of document.querySelectorAll(selector)) {
        target.setAttribute('aria-keyshortcuts', key.replace('Ctrl', 'Control'));
        const tooltip = target.querySelector('.shortcut-tooltip kbd');
        if (tooltip) {
          tooltip.textContent = key;
          target.setAttribute('aria-label', `${label}，快捷键 ${key}`);
        } else {
          target.title = `${label} ${key}`;
        }
      }
    }
    document.querySelector('#leave-focus').textContent = `退出专注 · ${bindings.focus}`;
    const guide = document.querySelector('#help-dialog .shortcut-grid');
    guide.replaceChildren();
    for (const [label, key] of [
      ...shortcutCommands.map(([id, label]) => [label, bindings[id]]),
      ['撤销 / 重做', 'Ctrl+Z / Ctrl+Shift+Z'],
    ]) {
      const text = document.createElement('span');
      const kbd = document.createElement('kbd');
      text.textContent = label;
      kbd.textContent = key;
      guide.append(text, kbd);
    }
  }
  function cancel() {
    recording = null;
    sync();
  }
  function save(next) {
    try {
      storage.setItem(storageKey, JSON.stringify(next));
    } catch {
      announce('保存失败，快捷键保持不变。');
      cancel();
      return false;
    }
    bindings = next;
    cancel();
    return true;
  }
  for (const [id, label] of shortcutCommands) {
    const row = document.createElement('div');
    const name = document.createElement('span');
    const button = document.createElement('button');
    row.className = 'shortcut-row';
    name.textContent = label;
    button.type = 'button';
    button.dataset.shortcut = id;
    button.setAttribute('aria-describedby', 'shortcut-status');
    buttons.set(id, button);
    button.addEventListener('click', () => {
      cancel();
      recording = id;
      button.textContent = '按下组合键…';
      button.classList.add('recording');
      announce(`正在修改「${label}」。按 Esc 取消。`);
    });
    button.addEventListener('blur', () => {
      if (recording === id) {
        cancel();
        announce('已取消修改。');
      }
    });
    row.append(name, button);
    list.append(row);
  }
  document.querySelector('#reset-shortcuts').onclick = () => {
    if (save({ ...defaultShortcuts })) {
      announce('已恢复全部默认快捷键。');
    }
  };
  document.querySelector('#settings-dialog').addEventListener('close', cancel);
  function handleKey(e) {
    if (recording) {
      if (e.key === 'Tab' && !e.ctrlKey) {
        cancel();
        announce('已取消修改。');
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === 'Escape') {
        cancel();
        announce('已取消修改。');
        return;
      }
      if (
        ['Control', 'Shift', 'Alt', 'Meta'].includes(e.key) ||
        e.isComposing ||
        e.keyCode === 229
      ) {
        return;
      }
      const key = eventShortcut(e);
      if (!validShortcut(key)) {
        announce(
          '请使用 Ctrl + 字母 / 数字 / 逗号（可加 Shift），或 F2、F8、F9；系统与复制、粘贴、撤销等常用快捷键不可占用。',
        );
        return;
      }
      const conflict = shortcutCommands.find(([id]) => id !== recording && bindings[id] === key);
      if (conflict) {
        announce(`${key} 已用于「${conflict[1]}」，请换一个组合键。`);
        return;
      }
      const label = shortcutCommands.find(([id]) => id === recording)[1];
      if (save({ ...bindings, [recording]: key })) {
        announce(`「${label}」已改为 ${key}，已保存。`);
      }
      return;
    }
    if (document.querySelector('dialog[open]')) {
      return;
    }
    const key = eventShortcut(e);
    if (!key) {
      return;
    }
    const entry = shortcutCommands.find(([id]) => bindings[id] === key);
    // Suppress the old built-in bindings as well, so Milkdown cannot apply both mappings.
    if (entry || Object.values(defaultShortcuts).includes(key)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (entry && !e.repeat && canRun(entry[0], e)) {
        run(entry[0]);
      }
    }
  }
  document.addEventListener('keydown', handleKey, true);
  sync();
  return { getBindings: () => ({ ...bindings }), cancel, handleKey };
}
