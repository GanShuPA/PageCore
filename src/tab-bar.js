/** Keep tab controls stable while names and dirty indicators change during typing. */
export function createTabBar(root, { select, close, closeShortcut = () => 'Ctrl+W' }) {
  const controls = new Map();
  root.addEventListener('keydown', (event) => {
    const buttons = [...root.querySelectorAll('[role="tab"]')];
    const index = buttons.indexOf(event.target);
    if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : (index + (event.key === 'ArrowLeft' ? -1 : 1) + buttons.length) % buttons.length;
    buttons[next].focus();
    buttons[next].click();
  });
  return (tabs, activeId) => {
    for (const [id, row] of controls) {
      if (!tabs.some((tab) => tab.id === id)) {
        row.remove();
        controls.delete(id);
      }
    }
    for (const tab of tabs) {
      let row = controls.get(tab.id);
      if (!row) {
        row = document.createElement('div');
        row.className = 'document-tab';
        row.setAttribute('role', 'presentation');
        const button = document.createElement('button');
        button.className = 'tab-select';
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-controls', 'editors');
        button.id = 'tab-' + tab.id;
        button.onclick = () => select(tab.id);
        const label = document.createElement('span');
        label.className = 'tab-name';
        const dot = document.createElement('span');
        dot.className = 'tab-dirty';
        dot.setAttribute('aria-hidden', 'true');
        button.append(label, dot);
        const remove = document.createElement('button');
        remove.className = 'tab-close';
        remove.textContent = '×';
        remove.onclick = () => close(tab.id);
        for (const event of ['mouseenter', 'focus']) {
          remove.addEventListener(event, () => {
            remove.title = '关闭标签页 · ' + closeShortcut();
          });
        }
        row.onauxclick = (event) => {
          if (event.button === 1) {
            event.preventDefault();
            close(tab.id);
          }
        };
        row.append(button, remove);
        controls.set(tab.id, row);
        root.append(row);
      }
      const active = tab.id === activeId;
      const button = row.querySelector('.tab-select');
      row.classList.toggle('active', active);
      row.classList.toggle('unsaved', tab.dirty);
      button.setAttribute('aria-selected', String(active));
      button.setAttribute('aria-label', tab.name + (tab.dirty ? '，未保存' : ''));
      button.tabIndex = active ? 0 : -1;
      button.title = tab.path || tab.name;
      row.querySelector('.tab-name').textContent = tab.name;
      const remove = row.querySelector('.tab-close');
      remove.setAttribute('aria-label', '关闭 ' + tab.name);
      remove.title = '关闭标签页 · ' + closeShortcut();
      remove.tabIndex = active ? 0 : -1;
    }
    document.querySelector('#editors').setAttribute('aria-labelledby', 'tab-' + activeId);
  };
}
