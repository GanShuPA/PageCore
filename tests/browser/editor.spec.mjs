import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.FieldMarkdown.ready);
  await expect(page.locator('#loading')).toBeHidden();
});

test('built editor preserves edits across all modes and exports a Markdown copy', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluate(() =>
    window.FieldMarkdown.setDocument({ name: '回归测试.md', text: '# 标题\n\n正文\n', path: null }),
  );
  await page.locator('[data-mode="source"]').click();
  await page.locator('.cm-content').fill('# 标题\n\n修改后的中文正文\n');
  await page.locator('[data-mode="split"]').click();
  await expect(page.locator('#preview')).toContainText('修改后的中文正文');
  await page.locator('[data-mode="read"]').click();
  await expect(page.locator('#preview h1')).toHaveText('标题');
  await page.locator('[data-mode="write"]').click();
  await expect(page.locator('.ProseMirror')).toContainText('修改后的中文正文');
  const download = page.waitForEvent('download');
  await page.locator('[data-action="save"]').click();
  expect((await download).suggestedFilename()).toBe('回归测试.md');
  await expect(page.locator('#save-state')).toHaveText('已就绪');
  expect(errors).toEqual([]);
});

test('appearance and remapped shortcuts survive reload and update toolbar hints', async ({
  page,
}) => {
  await page.locator('[data-action="settings"]').click();
  await page.locator('#setting-theme').selectOption('dark');
  await page.locator('#setting-spacing').selectOption('2.2');
  await page.locator('[data-settings-tab="shortcuts-panel"]').click();
  await page.locator('[data-shortcut="bold"]').click();
  await page.keyboard.press('Control+Shift+B');
  await expect(page.locator('#bold-tooltip kbd')).toHaveText('Ctrl+Shift+B');
  await page.reload();
  await page.evaluate(() => window.FieldMarkdown.ready);
  await expect(page.locator('body')).toHaveClass(/dark/);
  await expect(page.locator('#setting-spacing')).toHaveValue('2.2');
  await expect(page.locator('#bold-tooltip kbd')).toHaveText('Ctrl+Shift+B');
  await page.locator('[data-mode="source"]').click();
  await page.locator('.cm-content').fill('测试加粗');
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Control+Shift+B');
  expect(await page.evaluate(() => window.FieldMarkdown.getMarkdown())).toBe('**测试加粗**');
});

test('embedded host receives current text and a successful save clears dirty state', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.hostCalls = [];
    window.fieldHost = {
      async request(command, payload) {
        window.hostCalls.push({ command, ...payload });
        if (command === 'ready') {
          return { document: { name: '宿主.md', text: '# 宿主\n', path: null }, recovery: null };
        }
        if (command === 'save') {
          return { name: '宿主.md', cleanText: payload.text, recent: [] };
        }
        return null;
      },
    };
  });
  await page.goto('/?embedded=1');
  await page.evaluate(() => window.FieldMarkdown.ready);
  await expect(page.locator('#document-name')).toHaveText('宿主.md');
  await page.locator('[data-mode="source"]').click();
  await page.locator('.cm-content').fill('嵌入后的修改');
  await page.keyboard.press('Control+S');
  await expect(page.locator('#save-state')).toHaveText('已就绪');
  expect(await page.evaluate(() => window.hostCalls.at(-1))).toMatchObject({
    command: 'save',
    text: '嵌入后的修改',
  });
});
