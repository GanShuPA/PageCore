import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.FieldMarkdown.ready);
});

test('recover multiple drafts as separate tabs and remove a discarded draft', async ({ page }) => {
  await page.evaluate(() =>
    localStorage.setItem(
      'field-notes-draft',
      JSON.stringify({
        documents: [
          { name: '草稿甲.md', text: '# 草稿甲\n' },
          { name: '草稿乙.md', text: '# 草稿乙\n' },
        ],
      }),
    ),
  );
  await page.reload();
  await page.evaluate(() => window.FieldMarkdown.ready);
  await page.locator('#restore-draft').click();
  await expect(page.getByRole('tab')).toHaveCount(3);
  await expect(page.locator('.document-tab.unsaved')).toHaveCount(2);
  await page.getByRole('tab', { name: '草稿甲.md，未保存', exact: true }).click();
  await expect(page.locator('.ProseMirror')).toContainText('草稿甲');
  page.once('dialog', (dialog) => dialog.accept());
  await page.keyboard.press('Control+W');
  await expect(page.getByRole('tab')).toHaveCount(2);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem('field-notes-draft')).documents.map((d) => d.name),
    ),
  ).toEqual(['草稿乙.md']);
});

test('source scroll position survives switching away and back', async ({ page }) => {
  await page.evaluate(() =>
    window.FieldMarkdown.setDocument({
      name: '长文.md',
      text: Array.from({ length: 180 }, (_, i) => `段落 ${i}：滚动测试\n`).join('\n'),
    }),
  );
  await page.locator('[data-mode="source"]').click();
  await page.locator('.cm-scroller').evaluate((el) => {
    el.scrollTop = 1800;
  });
  await expect
    .poll(() => page.locator('.cm-scroller').evaluate((el) => el.scrollTop))
    .toBeGreaterThan(1500);
  const before = await page.locator('.cm-scroller').evaluate((el) => el.scrollTop);
  await page.keyboard.press('Control+N');
  await page.getByRole('tab', { name: '长文.md', exact: true }).click();
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'source');
  await expect
    .poll(() => page.locator('.cm-scroller').evaluate((el) => el.scrollTop))
    .toBeCloseTo(before, 0);
});

test('source tabs retain separate undo, selection, mode and dirty state', async ({ page }) => {
  await page.evaluate(() => window.FieldMarkdown.setDocument({ name: '甲.md', text: '甲原文' }));
  await page.locator('[data-mode="source"]').click();
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' first');
  await page.keyboard.press('Control+N');
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'write');
  await page.locator('[data-mode="source"]').click();
  await page.locator('.cm-content').fill('乙修改');
  await page.keyboard.press('Control+Shift+Tab');
  await expect(page.locator('.cm-content')).toHaveText('甲原文 first');
  await expect(page.locator('#cursor-position')).toHaveText('Ln 1, Col 10');
  await page.locator('.cm-content').focus();
  await page.keyboard.press('Control+Z');
  await expect(page.locator('.cm-content')).toHaveText('甲原文');
  await expect(page.locator('#save-state')).toHaveText('已就绪');
  await page.keyboard.press('Control+Tab');
  await expect(page.locator('.cm-content')).toHaveText('乙修改');
  await expect(page.locator('#save-state')).toHaveText('未保存');
  await expect(page.locator('.document-tab.unsaved')).toHaveCount(1);
  await page.locator('.cm-content').focus();
  await page.keyboard.press('Control+Z');
  await expect(page.locator('.cm-content')).toHaveText('');
});

test('rich text history stays isolated; cancelling a close preserves both documents', async ({
  page,
}) => {
  await page.evaluate(() => window.FieldMarkdown.setDocument({ name: '写作甲.md', text: '原文' }));
  await page.locator('.ProseMirror').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' edit');
  await page.keyboard.press('Control+N');
  await page.locator('.ProseMirror').click();
  await page.keyboard.type('second');
  await page.getByRole('tab', { name: '写作甲.md，未保存', exact: true }).click();
  await expect(page.locator('.ProseMirror')).toHaveText('原文 edit');
  await page.locator('.ProseMirror').focus();
  await page.keyboard.press('Control+Z');
  await expect(page.locator('.ProseMirror')).toHaveText('原文');
  await page.keyboard.press('Control+Tab');
  await expect(page.locator('.ProseMirror')).toHaveText('second');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.keyboard.press('Control+W');
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(page.locator('.ProseMirror')).toHaveText('second');
  page.once('dialog', (dialog) => dialog.accept());
  await page.keyboard.press('Control+W');
  await expect(page.getByRole('tab')).toHaveCount(1);
  await expect(page.locator('.ProseMirror')).toHaveText('原文');
  // Rich serialization adds a final newline, so undo may still differ from the original input.
  page.once('dialog', (dialog) => dialog.accept());
  await page.keyboard.press('Control+W');
  await expect(page.getByRole('tab')).toHaveCount(1);
  await expect(page.locator('.ProseMirror')).toHaveText('');
});

test('host routing saves only the active document and reopening an existing file preserves edits', async ({
  page,
}) => {
  await page.addInitScript(() => {
    let active = 'a';
    const docs = {
      a: { id: 'a', name: '甲.md', path: 'C:\\甲.md', text: '甲', cleanText: '甲' },
      b: { id: 'b', name: '乙.md', path: 'C:\\乙.md', text: '乙', cleanText: '乙' },
    };
    window.tabCalls = [];
    window.fieldHost = {
      async request(command, payload) {
        window.tabCalls.push({ command, ...payload });
        if (command === 'ready') {
          return { document: docs.a };
        }
        if (payload.tabId) {
          docs[payload.tabId].text = payload.text;
        }
        if (command === 'open') {
          active = active === 'a' ? 'b' : 'a';
        }
        if (command === 'select-tab') {
          active = payload.targetId;
        }
        if (command === 'save') {
          docs[active].cleanText = docs[active].text;
        }
        if (command === 'close-tab') {
          return null;
        }
        if (command === 'prepare-word') {
          return { html: payload.html };
        }
        if (command === 'export-word') {
          return { path: 'export.docx' };
        }
        return { ...docs[active] };
      },
    };
  });
  await page.reload();
  await page.evaluate(() => window.FieldMarkdown.ready);
  await page.locator('[data-mode="source"]').click();
  await page.locator('.cm-content').fill('甲的未保存修改');
  await page.keyboard.press('Control+O');
  await page.locator('[data-mode="source"]').click();
  await page.locator('.cm-content').fill('乙的未保存修改');
  await page.keyboard.press('Control+S');
  await expect(page.locator('#save-state')).toHaveText('已就绪');
  expect(await page.evaluate(() => window.tabCalls.at(-1))).toMatchObject({
    command: 'save',
    tabId: 'b',
    text: '乙的未保存修改',
  });
  await page.keyboard.press('Control+O');
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(page.locator('.cm-content')).toHaveText('甲的未保存修改');
  await expect(page.locator('#save-state')).toHaveText('未保存');
  await page.locator('[data-action="export-word"]').click();
  await expect(page.locator('#toast')).toContainText('Word 已导出');
  expect(await page.evaluate(() => window.tabCalls.at(-1))).toMatchObject({
    command: 'export-word',
    tabId: 'a',
    text: '甲的未保存修改',
  });
  await page.keyboard.press('Control+W');
  await expect(page.getByRole('tab')).toHaveCount(2);
  const snapshots = await page.evaluate(() => window.FieldMarkdown.flushAll());
  expect(snapshots).toEqual([
    { tabId: 'a', text: '甲的未保存修改' },
    { tabId: 'b', text: '乙的未保存修改' },
  ]);
});

test('many tabs scroll within a narrow window and keyboard navigation reveals the active tab', async ({
  page,
}) => {
  await page.setViewportSize({ width: 700, height: 600 });
  for (let i = 0; i < 9; i++) {
    await page.keyboard.press('Control+N');
    await expect(page.getByRole('tab')).toHaveCount(i + 2);
  }
  await page.keyboard.press('Control+Tab');
  await expect(page.getByRole('tab').first()).toHaveAttribute('aria-selected', 'true');
  const geometry = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    viewport: innerWidth,
    left: document.querySelector('[role="tab"][aria-selected="true"]').getBoundingClientRect().left,
    stripLeft: document.querySelector('#document-tabs').getBoundingClientRect().left,
  }));
  expect(geometry.body).toBeLessThanOrEqual(geometry.viewport);
  expect(geometry.left).toBeGreaterThanOrEqual(geometry.stripLeft - 1);
});
