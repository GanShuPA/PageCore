import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createRenderer } from '../src/render.js';
import { createPdfDocument } from '../src/pdf-export.js';
import { loadPdfOptions, normalizePdfOptions, pdfDefaults } from '../src/pdf-options.js';

test('PDF preferences recover from malformed data and constrain unsafe settings', () => {
  assert.deepEqual(loadPdfOptions({ getItem: () => '{bad' }), pdfDefaults);
  assert.deepEqual(normalizePdfOptions(null), pdfDefaults);
  const options = normalizePdfOptions({
    paper: '__proto__',
    font: 'url(evil)',
    orientation: 'other',
    fontSize: 100,
    marginTop: -5,
    marginLeft: '20',
    marginRight: Infinity,
    pageNumbers: 'true',
  });
  assert.equal(options.paper, 'A4');
  assert.equal(options.font, 'sans');
  assert.equal(options.fontSize, 24);
  assert.equal(options.marginTop, 5);
  assert.equal(options.marginLeft, 16);
  assert.equal(options.marginRight, 16);
  assert.equal(options.pageNumbers, false);
});

test('PDF custom layout escapes running text and rejects insufficient header space', () => {
  const html = createPdfDocument('标题', '<p>正文</p>', {
    paper: 'Letter',
    orientation: 'landscape',
    font: 'serif',
    fontSize: 16,
    header: '</style><script>alert(1)</script>"\\',
    footer: '页核',
    pageNumbers: true,
    marginTop: 25,
  });
  const doc = new JSDOM(html).window.document;
  assert.equal(doc.querySelector('script'), null);
  assert.equal(doc.querySelectorAll('style').length, 1);
  const css = doc.querySelector('style').textContent;
  assert.match(css, /size: Letter landscape/);
  assert.match(css, /margin: 25mm 16mm 18mm 16mm/);
  assert.match(css, /counter\(pages\)/);
  assert.match(css, /font-size: 16pt/);
  assert.throws(() => createPdfDocument('', '', { header: '页眉', marginTop: 5 }), /12 mm/);
  assert.throws(() => createPdfDocument('', '', { pageNumbers: true, marginBottom: 5 }), /12 mm/);
});

test('PDF layout preserves sanitized content and eagerly loads images for printing', () => {
  const dom = new JSDOM('');
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  const render = createRenderer(dom.window);
  const html = createPdfDocument(
    '<文件名>',
    render(
      '# 中文标题\n\n- [x] 已完成\n\n| 项目 | 内容 |\n| --- | --- |\n| 一 | 中文 |\n\n```js\nconst value = 1;\n```\n\n$E=mc^2$\n\n![图](images/example.png)\n\n<script>alert(1)</script>',
      'https://media.field.local/',
      true,
    ),
  );
  const output = new JSDOM(html).window.document;
  assert.equal(output.title, '<文件名>');
  assert.equal(output.querySelector('h1').textContent, '中文标题');
  assert.ok(output.querySelector('input[type="checkbox"]').checked);
  assert.equal(output.querySelector('img').getAttribute('loading'), 'eager');
  assert.equal(output.querySelector('img').src, 'https://media.field.local/images/example.png');
  assert.ok(output.querySelector('table'));
  assert.ok(output.querySelector('pre code'));
  assert.ok(output.querySelector('math'));
  assert.equal(output.querySelector('script'), null);
  assert.match(output.querySelector('style').textContent, /size: A4 portrait/);
  assert.match(output.querySelector('style').textContent, /white-space: pre-wrap/);
  assert.match(output.querySelector('style').textContent, /table-header-group/);
  dom.window.close();
});
