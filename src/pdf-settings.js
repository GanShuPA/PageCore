import { $ } from './dom.js';
import {
  loadPdfOptions,
  normalizePdfOptions,
  pdfDefaults,
  pdfOptionsKey,
  pdfOptionsError,
  pdfPapers,
} from './pdf-options.js';

export function setupPdfSettings() {
  const dialog = $('#pdf-dialog');
  const form = $('#pdf-form');
  let resolveSelection;
  let selected = null;
  function populate(options) {
    for (const [key, value] of Object.entries(options)) {
      const control = form.elements.namedItem(key);
      if (control.type === 'checkbox') {
        control.checked = value;
      } else {
        control.value = value;
      }
    }
    update();
  }
  function read() {
    const values = {};
    for (const key of Object.keys(pdfDefaults)) {
      const control = form.elements.namedItem(key);
      values[key] =
        control.type === 'checkbox'
          ? control.checked
          : control.type === 'number' || key === 'lineHeight'
            ? Number(control.value)
            : control.value;
    }
    return normalizePdfOptions(values);
  }
  function update() {
    const options = read();
    const dimensions = [...pdfPapers[options.paper]];
    if (options.orientation === 'landscape') {
      dimensions.reverse();
    }
    $('#pdf-summary').textContent =
      `${options.paper} · ${dimensions.join(' × ')} mm · ${options.fontSize} pt · ${options.pageNumbers ? '显示页码' : '不显示页码'}`;
    $('#pdf-error').textContent = pdfOptionsError(options);
  }
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  $('#pdf-reset').onclick = () => populate(pdfDefaults);
  $('#pdf-cancel').onclick = $('#pdf-close').onclick = () => dialog.close();
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const options = read();
    const error = pdfOptionsError(options);
    if (error) {
      $('#pdf-error').textContent = error;
      return;
    }
    selected = options;
    dialog.close();
  });
  dialog.addEventListener('close', () => {
    resolveSelection?.(selected);
    resolveSelection = null;
  });
  return {
    open() {
      selected = null;
      populate(loadPdfOptions(localStorage));
      dialog.showModal();
      return new Promise((resolve) => {
        resolveSelection = resolve;
      });
    },
    remember(options) {
      try {
        localStorage.setItem(pdfOptionsKey, JSON.stringify(options));
        return true;
      } catch {
        return false;
      }
    },
  };
}
