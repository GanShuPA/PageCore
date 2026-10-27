import { marked } from 'marked';
import createDOMPurify from 'dompurify';
import renderMath from 'katex/contrib/auto-render';

export function assetURL(src, base = '') {
  if (/^data:image\/(png|jpeg|gif|webp);base64,/i.test(src)) {
    return src;
  }
  if (/^https?:\/\//i.test(src)) {
    return src;
  }
  if (/^(?:[a-z][\w+.-]*:|\/\/|\\\\)/i.test(src)) {
    return '';
  }
  return base ? new URL(src.replaceAll('\\', '/'), base).href : src;
}
export function createRenderer(win) {
  const purify = createDOMPurify(win);
  return (text, base = '', mathml = false) => {
    const box = win.document.createElement('div');
    box.innerHTML = purify.sanitize(marked.parse(text, { gfm: true, breaks: false }), {
      FORBID_TAGS: [
        'style',
        'script',
        'iframe',
        'object',
        'embed',
        'form',
        'button',
        'textarea',
        'select',
        'audio',
        'video',
      ],
      FORBID_ATTR: ['style', 'id', 'name', 'srcset'],
      ALLOW_DATA_ATTR: false,
    });
    box.querySelectorAll('img').forEach((img) => {
      img.src = assetURL(img.getAttribute('src') || '', base);
      img.setAttribute('loading', 'lazy');
    });
    box.querySelectorAll('a').forEach((a) => {
      a.rel = 'noreferrer noopener';
    });
    box.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((h, i) => (h.id = 'heading-' + i));
    renderMath(box, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false },
        { left: '\\[', right: '\\]', display: true },
      ],
      throwOnError: false,
      trust: false,
      output: mathml ? 'mathml' : 'htmlAndMathml',
    });
    return box.innerHTML;
  };
}
export function headings(text) {
  const items = [];
  let offset = 0;
  for (const token of marked.lexer(text)) {
    if (token.type === 'heading') {
      items.push({ level: token.depth, text: token.text.replace(/[*_`~]/g, ''), offset });
    }
    offset += token.raw.length;
  }
  return items;
}
export function countWords(text) {
  const han = (
    text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) || []
  ).length;
  const words = (
    text
      .replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu, ' ')
      .match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || []
  ).length;
  return han + words;
}
export function exportDocument(title, html) {
  const safeTitle = title.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https: data: file:;"><title>${safeTitle}</title><style>body{max-width:820px;margin:60px auto;padding:0 30px;color:#29312b;background:#fafbf6;font:16px/1.9 'Segoe UI','Microsoft YaHei',sans-serif}h1{font-size:2em;line-height:1.4}h2{margin-top:2em}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccd2c8;padding:10px;text-align:left}th,pre,blockquote{background:#edf0e7}pre{padding:20px;overflow:auto}code{font-family:Consolas,monospace}blockquote{border-left:3px solid #aab870;margin:20px 0;padding:8px 20px}img{max-width:100%}hr{border:0;border-top:1px solid #ccd2c8}a{color:#46673c}math[display=block]{padding:1em}</style><article>${html}</article></html>`;
}
