import { $ } from './dom.js';

// Keep application navigation independent from document and editor state.
export function setupLayout({ measure }) {
  const narrow = matchMedia('(max-width: 960px)');
  const toggle = $('#sidebar-toggle');
  const exportToggle = $('#export-toggle');
  const menu = $('#export-menu');
  let desktopOpen = true;
  let drawerOpen = false;
  try {
    desktopOpen = localStorage.getItem('pagecore-sidebar') !== 'closed';
  } catch {}
  function updateSidebar() {
    const open = narrow.matches ? drawerOpen : desktopOpen;
    document.body.classList.toggle('sidebar-collapsed', !open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? '收起侧栏' : '展开侧栏');
    toggle.title = open ? '收起侧栏' : '展开侧栏';
    $('#sidebar-dismiss').hidden = !narrow.matches || !open;
    requestAnimationFrame(measure);
  }
  function setSidebar(open) {
    if (narrow.matches) {
      drawerOpen = open;
    } else {
      desktopOpen = open;
      try {
        localStorage.setItem('pagecore-sidebar', open ? 'open' : 'closed');
      } catch {}
    }
    updateSidebar();
  }
  $('#sidebar-dismiss').onclick = () => {
    setSidebar(false);
    toggle.focus();
  };
  toggle.onclick = () => setSidebar(toggle.getAttribute('aria-expanded') !== 'true');
  narrow.addEventListener('change', () => {
    drawerOpen = false;
    updateSidebar();
  });
  function closeMenu(restoreFocus = false) {
    menu.hidden = true;
    exportToggle.setAttribute('aria-expanded', 'false');
    if (restoreFocus) {
      exportToggle.focus();
    }
  }
  function openMenu(last = false) {
    menu.hidden = false;
    exportToggle.setAttribute('aria-expanded', 'true');
    const items = [...menu.querySelectorAll('button:not(:disabled)')];
    (last ? items.at(-1) : items[0])?.focus();
  }
  exportToggle.onclick = () => (menu.hidden ? openMenu() : closeMenu());
  exportToggle.addEventListener('keydown', (event) => {
    if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      openMenu(event.key === 'ArrowUp');
    }
  });
  menu.addEventListener('keydown', (event) => {
    const items = [...menu.querySelectorAll('button:not(:disabled)')];
    const index = items.indexOf(document.activeElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? items.length - 1
            : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }
  });
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' && !menu.hidden) {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeMenu(true);
      } else if (
        event.key === 'Escape' &&
        narrow.matches &&
        drawerOpen &&
        !document.querySelector('dialog[open]')
      ) {
        setSidebar(false);
        toggle.focus();
      }
    },
    true,
  );
  document.addEventListener('focusin', (event) => {
    if (!event.target.closest('.export-control')) {
      closeMenu();
    }
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.export-control')) {
      closeMenu();
    } else if (event.target.closest('[role="menuitem"]')) {
      // Return focus before the document action opens its own dialog.
      closeMenu(true);
    }
    if (narrow.matches && drawerOpen && event.target.closest('main')) {
      setSidebar(false);
    }
  });
  updateSidebar();
  return { revealSidebar: () => setSidebar(true) };
}
