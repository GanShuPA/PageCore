import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createRenderer,headings,assetURL,countWords,exportDocument } from '../src/render.js';
const dom=new JSDOM('<!doctype html><html><body></body></html>');
globalThis.document=dom.window.document;globalThis.Node=dom.window.Node;
const render=createRenderer(dom.window);
test('tables, tasks, Chinese, fenced code and math render',()=>{
 const html=render('# 中文\n\n- [x] 完成\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```js\nconst x = 1;\n```\n\n$E=mc^2$');
 for(const part of ['<h1','中文','type="checkbox"','<table>','<pre>','katex'])assert.ok(html.includes(part),part);
});
test('document HTML cannot inject scripts, controls or clobber the app',()=>{
 const html=render('<script>alert(1)</script>\n\n<img src="x" onerror="evil()"><a href="javascript:evil()">bad</a><div id="source-editor" style="position:fixed">text</div><iframe src="x"></iframe><button>bad</button>');
 for(const bad of ['<script','onerror','javascript:','id="source-editor"','position:fixed','<iframe','<button'])assert.ok(!html.includes(bad),bad);
});
test('outline excludes headings inside code blocks and tracks source positions',()=>{
 const text='# One\n\n```md\n# Fake\n```\n\n## Two\n';const out=headings(text);
 assert.deepEqual(out.map(x=>x.text),['One','Two']);assert.equal(text.slice(out[1].offset,out[1].offset+6),'## Two');
});
test('safe asset paths and portable export',()=>{
 assert.equal(assetURL('images/a.png','https://media.field.local/'),'https://media.field.local/images/a.png');assert.equal(assetURL('javascript:evil()'),'');assert.equal(assetURL('file:///C:/secret.png'),'');assert.equal(assetURL('data:text/html,x'),'');
 assert.ok(exportDocument('<evil>',render('hello')).includes('<title>&lt;evil&gt;</title>'));
});
test('word counts cover Chinese and English',()=>assert.equal(countWords('你好 Markdown editor'),4));
