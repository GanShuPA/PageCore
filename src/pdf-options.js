export const pdfOptionsKey = 'pagecore-pdf-options-v1';
export const pdfDefaults = Object.freeze({
  paper: 'A4',
  orientation: 'portrait',
  marginTop: 18,
  marginBottom: 18,
  marginLeft: 16,
  marginRight: 16,
  font: 'sans',
  fontSize: 11,
  lineHeight: 1.7,
  header: '',
  footer: '',
  pageNumbers: false,
});
export const pdfPapers = Object.freeze({ A4: [210, 297], A5: [148, 210], Letter: [215.9, 279.4] });
export const pdfFonts = Object.freeze({
  sans: "'Microsoft YaHei', 'Segoe UI', sans-serif",
  serif: "SimSun, 'Times New Roman', serif",
  mono: "Consolas, 'Microsoft YaHei', monospace",
});

export function normalizePdfOptions(value) {
  const raw = value && typeof value === 'object' ? value : {};
  const result = { ...pdfDefaults };
  for (const key of ['paper', 'orientation', 'font']) {
    const allowed =
      key === 'paper'
        ? Object.keys(pdfPapers)
        : key === 'font'
          ? Object.keys(pdfFonts)
          : ['portrait', 'landscape'];
    if (allowed.includes(raw[key])) {
      result[key] = raw[key];
    }
  }
  for (const key of ['marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'fontSize']) {
    const min = key === 'fontSize' ? 8 : 5;
    const max = key === 'fontSize' ? 24 : 40;
    if (typeof raw[key] === 'number' && Number.isFinite(raw[key])) {
      result[key] = Math.min(max, Math.max(min, Math.round(raw[key])));
    }
  }
  if ([1.4, 1.7, 2].includes(raw.lineHeight)) {
    result.lineHeight = raw.lineHeight;
  }
  for (const key of ['header', 'footer']) {
    if (typeof raw[key] === 'string') {
      // Running text is single-line; strip control characters from imported preferences.
      result[key] = raw[key]
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .slice(0, 60)
        .trim();
    }
  }
  result.pageNumbers = raw.pageNumbers === true;
  return result;
}

export function loadPdfOptions(storage) {
  try {
    return normalizePdfOptions(JSON.parse(storage.getItem(pdfOptionsKey)));
  } catch {
    return { ...pdfDefaults };
  }
}

export function pdfOptionsError(options) {
  if (options.header && options.marginTop < 12) {
    return '启用页眉时，上边距至少需要 12 mm。';
  }
  if ((options.footer || options.pageNumbers) && options.marginBottom < 12) {
    return '启用页脚或页码时，下边距至少需要 12 mm。';
  }
  return '';
}
