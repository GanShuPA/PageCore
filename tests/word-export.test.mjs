import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import JSZip from 'jszip';
import { createRenderer } from '../src/render.js';
import { createWordDocument } from '../src/word-export.js';

test('Word export creates editable OOXML with headings, lists, tables, links, images and native math', async () => {
  const dom = new JSDOM('');
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  const render = createRenderer(dom.window);
  const html = render(
    '# 中文标题\n\n**加粗** *斜体* ~~删除~~ [链接](https://example.com)\n\n3. 第三项\n4. 第四项\n   - 嵌套列表\n\n- [x] 完成\n\n| 项目 | 说明 |\n| --- | --- |\n| A | 中文 |\n\n```js\nconst x = 1;\n  code();\n```\n\n$E=mc^2$\n\n$$\\frac{1}{2}$$\n\n![示例](image.png)\n\n<script>evil()</script>',
    '',
    true,
  );
  const { base64, warnings } = await createWordDocument('测试.md', html, async () => ({
    type: 'png',
    width: 10,
    height: 10,
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1cAAAAASUVORK5CYII=',
  }));
  assert.deepEqual(warnings, []);
  const zip = await JSZip.loadAsync(base64, { base64: true });
  const xml = await zip.file('word/document.xml').async('string');
  const doc = new JSDOM(xml, { contentType: 'text/xml' }).window.document;
  assert.equal(doc.querySelector('parsererror'), null);
  assert.match(xml, /w:pStyle w:val="Heading1"/);
  assert.match(xml, /<w:tbl>/);
  assert.match(xml, /w:tblHeader/);
  assert.match(xml, /<w:b\/>/);
  assert.match(xml, /<w:i\/>/);
  assert.match(xml, /w:strike/);
  assert.match(xml, /w:numPr/);
  assert.match(xml, /m:oMath/);
  assert.match(xml, /m:f>/);
  assert.match(xml, /w:drawing/);
  assert.match(xml, /☑/);
  assert.match(xml, / {2}code\(\);/);
  assert.doesNotMatch(xml, /evil\(\)/);
  const nums = await zip.file('word/numbering.xml').async('string');
  assert.match(nums, /w:start w:val="3"/);
  assert.match(
    await zip.file('word/_rels/document.xml.rels').async('string'),
    /https:\/\/example.com/,
  );
  assert.ok(
    Object.keys(zip.files).some((path) => path.startsWith('word/media/') && path.endsWith('.png')),
  );
  dom.window.close();
});

test('Word export rejects missing images and preserves unsupported equations with a warning', async () => {
  const dom = new JSDOM('');
  globalThis.document = dom.window.document;
  await assert.rejects(
    createWordDocument('test', '<img src="missing.png" alt="缺失图片">', async () => {
      throw new Error('not found');
    }),
    /缺失图片/,
  );
  const { base64, warnings } = await createWordDocument(
    'test',
    '<p><math><semantics><annotation encoding="application/x-tex">\\unknowncommand{x}</annotation></semantics></math></p>',
  );
  assert.equal(warnings.length, 1);
  const zip = await JSZip.loadAsync(base64, { base64: true });
  assert.match(await zip.file('word/document.xml').async('string'), /unknowncommand/);
  dom.window.close();
});
