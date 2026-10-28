import { test, expect } from '@playwright/test';

const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2ioAAAAASUVORK5CYII=';

async function boot(page, saved = true) {
  await page.addInitScript(
    ({ saved }) => {
      window.imageState = { calls: [], cancelled: false, delay: false, failAt: 0, count: 0 };
      window.chrome ||= {};
      window.chrome.webview = { addEventListener() {}, postMessage() {} };
      let doc = {
        id: 'tab-a',
        name: saved ? '笔记.md' : '未命名.md',
        path: saved ? 'C:\\笔记.md' : null,
        text: '# 原文\n',
        cleanText: '# 原文\n',
        assetBase: saved ? 'https://media.field.local/tab-a/' : '',
      };
      window.fieldHost = {
        async request(command, payload) {
          window.imageState.calls.push({ command, ...payload });
          if (command === 'ready') {
            return { document: doc };
          }
          if (command === 'save') {
            if (window.imageState.cancelled) {
              return null;
            }
            doc = {
              ...doc,
              name: '笔记.md',
              path: 'C:\\笔记.md',
              text: payload.text,
              cleanText: payload.text,
              assetBase: 'https://media.field.local/tab-a/',
            };
            return doc;
          }
          if (command === 'choose-images') {
            return window.imageState.selection || null;
          }
          if (command === 'read-chosen-image') {
            return { base64: window.imageState.imageBase64 };
          }
          if (command === 'import-image') {
            const number = ++window.imageState.count;
            if (window.imageState.delay) {
              await new Promise((resolve) => {
                window.imageState.resume = resolve;
              });
            }
            if (number === window.imageState.failAt) {
              throw new Error('图片目录不可写');
            }
            return {
              path:
                'notes_assets/image-' + number + (payload.mime === 'image/jpeg' ? '.jpg' : '.png'),
            };
          }
          if (command === 'new') {
            return { id: 'tab-b', name: '第二个.md', text: '', path: null };
          }
          return null;
        },
      };
    },
    { saved },
  );
  await page.route('https://media.field.local/**', (route) =>
    route.fulfill({ contentType: 'image/png', body: Buffer.from(png, 'base64') }),
  );
  await page.goto('/');
  await page.evaluate(() => window.FieldMarkdown.ready);
}

async function transfer(page, selector, kind, files) {
  await page.locator(selector).evaluate(
    (target, { kind, files }) => {
      const transfer = new DataTransfer();
      for (const file of files) {
        const bytes = Uint8Array.from(atob(file.data), (value) => value.charCodeAt(0));
        transfer.items.add(new File([bytes], file.name, { type: file.type }));
      }
      if (kind === 'paste') {
        target.dispatchEvent(
          new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }),
        );
      } else {
        const bounds = target.getBoundingClientRect();
        target.dispatchEvent(
          new DragEvent('drop', {
            bubbles: true,
            cancelable: true,
            dataTransfer: transfer,
            clientX: bounds.left + 12,
            clientY: bounds.top + 12,
          }),
        );
      }
    },
    { kind, files },
  );
}

test('pastes and drops several images into source with relative paths and displays them in preview', async ({
  page,
}) => {
  await boot(page);
  await page.locator('[data-mode="source"]').click();
  await page.locator('.cm-content').focus();
  await page.keyboard.press('Control+End');
  await transfer(page, '.cm-content', 'paste', [
    { name: '截图.png', type: 'image/png', data: png },
  ]);
  await expect
    .poll(() => page.evaluate(() => window.FieldMarkdown.getMarkdown()))
    .toContain('![截图.png](notes_assets/image-1.png)');
  await transfer(page, '.cm-content', 'drop', [
    { name: '二.png', type: 'image/png', data: png },
    { name: '三.png', type: 'image/png', data: png },
  ]);
  await expect
    .poll(() => page.evaluate(() => window.FieldMarkdown.getMarkdown()))
    .toContain('![三.png](notes_assets/image-3.png)');
  const calls = await page.evaluate(() =>
    window.imageState.calls.filter((call) => call.command === 'import-image'),
  );
  expect(calls).toHaveLength(3);
  expect(calls[0]).toMatchObject({ tabId: 'tab-a', mime: 'image/png', base64: png });
  expect(await page.evaluate(() => window.FieldMarkdown.getMarkdown())).not.toContain('data:image');
  await page.locator('[data-mode="read"]').click();
  await expect(page.locator('#preview img')).toHaveCount(3);
  await expect(page.locator('#preview img').first()).toHaveJSProperty('naturalWidth', 1);
});

test('pastes and drops images into the rich editor once', async ({ page }) => {
  await boot(page);
  await page.locator('.ProseMirror').click();
  await transfer(page, '.ProseMirror', 'paste', [
    { name: '截图.png', type: 'image/png', data: png },
  ]);
  await expect
    .poll(() => page.evaluate(() => window.FieldMarkdown.getMarkdown()))
    .toContain('notes_assets/image-1.png');
  await expect(page.locator('#rich-editor img')).toHaveCount(1);
  await transfer(page, '.ProseMirror', 'drop', [
    { name: '拖入.png', type: 'image/png', data: png },
  ]);
  await expect
    .poll(() => page.evaluate(() => window.FieldMarkdown.getMarkdown()))
    .toContain('notes_assets/image-2.png');
  await expect(page.locator('#rich-editor img')).toHaveCount(2);
  expect(await page.evaluate(() => window.imageState.count)).toBe(2);
});

test('the image button inserts multiple selected files and read mode rejects dropped files', async ({
  page,
}) => {
  await boot(page);
  await page.locator('[data-mode="source"]').click();
  await page.locator('.cm-content').focus();
  await page.evaluate((data) => {
    window.imageState.imageBase64 = data;
    window.imageState.selection = {
      files: [
        { token: 'one', name: '甲.png', mime: 'image/png' },
        { token: 'two', name: '乙.png', mime: 'image/png' },
      ],
    };
  }, png);
  await page.locator('[data-action="image"]').click();
  await expect
    .poll(() => page.evaluate(() => window.FieldMarkdown.getMarkdown()))
    .toContain('notes_assets/image-2.png');
  await page.locator('[data-mode="read"]').click();
  await transfer(page, '#preview', 'drop', [{ name: '只读.png', type: 'image/png', data: png }]);
  await expect(page.locator('#toast')).toContainText('请将图片拖入正文编辑区');
  expect(await page.evaluate(() => window.imageState.count)).toBe(2);
});

test('cancelled save leaves the document unchanged, and a delayed import cannot switch tabs or documents', async ({
  page,
}) => {
  await boot(page, false);
  await page.locator('[data-mode="source"]').click();
  await page.locator('.cm-content').fill('未保存内容');
  await page.evaluate(() => {
    window.imageState.cancelled = true;
  });
  await transfer(page, '.cm-content', 'paste', [
    { name: '截图.png', type: 'image/png', data: png },
  ]);
  await expect(page.locator('#toast')).toHaveText('已取消插入图片。');
  expect(await page.evaluate(() => window.FieldMarkdown.getMarkdown())).toBe('未保存内容');
  expect(await page.evaluate(() => window.imageState.count)).toBe(0);
  await page.evaluate(() => {
    window.imageState.cancelled = false;
    window.imageState.delay = true;
  });
  await transfer(page, '.cm-content', 'paste', [
    { name: '截图.png', type: 'image/png', data: png },
  ]);
  await expect(page.locator('#image-progress')).toBeVisible();
  await expect.poll(() => page.evaluate(() => typeof window.imageState.resume)).toBe('function');
  await page.keyboard.press('Control+n');
  expect(
    await page.evaluate(() => window.FieldMarkdown.setDocument({ name: '其他.md', text: '其他' })),
  ).toBe(false);
  await page.evaluate(() => window.FieldMarkdown.setMode('write'));
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'source');
  await page.evaluate(() => window.imageState.resume());
  await expect(page.locator('#image-progress')).not.toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(1);
  await expect
    .poll(() => page.evaluate(() => window.FieldMarkdown.getMarkdown()))
    .toContain('notes_assets/image-1.png');
  await expect(page.locator('#save-state')).toHaveText('未保存');
  expect(
    await page.evaluate(() => window.imageState.calls.filter((call) => call.command === 'save')),
  ).toHaveLength(2);
});

test('reports unsupported images and inserts completed files if a later import fails', async ({
  page,
}) => {
  await boot(page);
  await page.locator('[data-mode="source"]').click();
  await page.locator('.cm-content').focus();
  await transfer(page, '.cm-content', 'paste', [
    { name: 'bad.svg', type: 'image/svg+xml', data: 'PHN2Zz48L3N2Zz4=' },
  ]);
  await expect(page.locator('#toast')).toContainText('请选择 PNG');
  expect(await page.evaluate(() => window.imageState.count)).toBe(0);
  await page.evaluate(() => {
    window.imageState.failAt = 2;
  });
  await transfer(page, '.cm-content', 'drop', [
    { name: '一.png', type: 'image/png', data: png },
    { name: '二.png', type: 'image/png', data: png },
  ]);
  await expect(page.locator('#toast')).toContainText('已插入 1 张，其余图片未完成：图片目录不可写');
  await expect
    .poll(() => page.evaluate(() => window.FieldMarkdown.getMarkdown()))
    .toContain('notes_assets/image-1.png');
  expect(await page.evaluate(() => window.FieldMarkdown.getMarkdown())).not.toContain(
    'image-2.png',
  );
});
