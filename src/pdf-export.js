import { exportDocument } from './render.js';
import { normalizePdfOptions, pdfFonts, pdfOptionsError, pdfPapers } from './pdf-options.js';

// Only document content enters this print layout; editor chrome and theme are excluded.
const printStyles = `
  html { color-scheme: light; }
  body {
    max-width: none; margin: 0; padding: 0;
    color: #202820; background: #fff;
    font-size: 11pt; line-height: 1.7;
    overflow-wrap: anywhere;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  h1, h2, h3, h4, h5, h6 { break-after: avoid; page-break-after: avoid; }
  h1 { margin: 0 0 18pt; }
  h2 { margin: 22pt 0 10pt; }
  p, li { orphans: 3; widows: 3; }
  p { margin: 8pt 0; }
  li > p:first-child { margin-top: 0; }
  input[type="checkbox"] { vertical-align: middle; margin: 0 5pt 0 0; }
  table { table-layout: fixed; font-size: 0.91em; margin: 12pt 0; }
  thead { display: table-header-group; }
  tr, img { break-inside: avoid; page-break-inside: avoid; }
  td, th { padding: 6pt 8pt; overflow-wrap: anywhere; }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; overflow: visible; padding: 10pt; }
  pre code { white-space: inherit; font-size: 0.82em; }
  blockquote { margin: 12pt 0; padding: 6pt 12pt; }
  img { max-width: 100%; max-height: 245mm; object-fit: contain; }
  math[display="block"] { break-inside: avoid; }
  a { color: #365a37; text-decoration: underline; }
`;

// Escape CSS strings, including '<' so text cannot terminate the HTML style element.
function cssString(text) {
  return (
    '"' +
    text.replace(/[\\"<>\n\r]/g, (char) => '\\' + char.codePointAt(0).toString(16) + ' ') +
    '"'
  );
}

export function createPdfDocument(title, sanitizedHtml, preferences) {
  const options = normalizePdfOptions(preferences);
  const error = pdfOptionsError(options);
  if (error) {
    throw new Error(error);
  }
  const pageHeight = pdfPapers[options.paper][options.orientation === 'landscape' ? 0 : 1];
  const marginStyle = `font: 9pt 'Microsoft YaHei', sans-serif; color: #666; vertical-align: middle; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`;
  const customStyles = `
    @page {
      size: ${options.paper} ${options.orientation};
      margin: ${options.marginTop}mm ${options.marginRight}mm ${options.marginBottom}mm ${options.marginLeft}mm;
      @top-left { content: ${cssString(options.header)}; width: 100%; ${marginStyle} }
      @bottom-left { content: ${cssString(options.footer)}; width: ${options.pageNumbers ? '70%' : '100%'}; ${marginStyle} }
      @bottom-right { content: ${options.pageNumbers ? '"第 " counter(page) " / " counter(pages) " 页"' : 'none'}; width: ${options.pageNumbers ? '30%' : '0'}; text-align: right; ${marginStyle} }
    }
    body { font-family: ${pdfFonts[options.font]}; font-size: ${options.fontSize}pt; line-height: ${options.lineHeight}; }
    img { max-height: ${pageHeight - options.marginTop - options.marginBottom - 8}mm; }
    li:has(> input[type="checkbox"]) { list-style: none; }
  `;
  return exportDocument(
    title,
    sanitizedHtml.replaceAll('loading="lazy"', 'loading="eager"'),
  ).replace('</style>', `${printStyles}${customStyles}</style>`);
}
