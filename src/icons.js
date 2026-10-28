import { $$ } from './dom.js';

export function initializeIcons() {
  const icons = {
    sidebar: 'M3 4h18v16H3zM9 4v16',
    chevron: 'm7 10 5 5 5-5',
    plus: 'M12 4v16M4 12h16',
    folder: 'M3 7V4h7l3 3h8v13H3zM3 10h18',
    file: 'M5 2h9l5 5v15H5zM14 2v6h5M8 12h8M8 16h8',
    save: 'M4 3h13l4 4v14H3V3zM7 3v7h10V3M7 21v-7h10v7',
    sun: 'M12 2v2M12 20v2M2 12h2M20 12h2M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2M16 12a4 4 0 1 1-8 0 4 4 0 1 1 8 0',
    focus: 'M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6',
    help: 'M9 8a3 3 0 1 1 4 3c-1 1-1 2-1 3M12 17v1M22 12a10 10 0 1 1-20 0 10 10 0 1 1 20 0',
    list: 'M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1',
    check: 'M3 4h17v17H3zM7 12l4 4 7-8',
    quote: 'M4 6h6v7H4zM10 13c0 4-2 5-5 5M14 6h6v7h-6zM20 13c0 4-2 5-5 5',
    code: 'm8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18',
    table: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18',
    link: 'm9 15 6-6M10 7l2-2a5 5 0 0 1 7 7l-2 2M14 17l-2 2a5 5 0 0 1-7-7l2-2',
    image: 'M3 3h18v18H3zM3 17l6-6 4 4 3-3 5 6M15 7h2v2h-2z',
    search: 'M15 15l6 6M17 10a7 7 0 1 1-14 0 7 7 0 1 1 14 0',
    rename: 'M4 17v4h4L20 9l-4-4ZM14 7l4 4M4 4h6',
    refresh: 'M20 8a8 8 0 1 0 0 8M20 3v6h-6',
    close: 'm6 6 12 12M18 6 6 18',
  };
  icons.settings = 'M4 7h16M4 17h16M8 4v6M16 14v6';
  $$('[data-icon]').forEach(
    (el) =>
      (el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[el.dataset.icon]}"/></svg>`),
  );
}
