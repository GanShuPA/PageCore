import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.FieldMarkdown.ready);
});

test('shell fits native and browser windows, keeps every format available and restores focus mode', async ({
  page,
}) => {
  for (const width of [1440, 1100, 960, 800, 700]) {
    await page.setViewportSize({ width, height: 650 });
    await page.evaluate(() => document.body.classList.add('native-window'));
    for (const mode of ['write', 'split', 'source', 'read']) {
      await page.locator(`button[data-mode="${mode}"]`).click();
      const bounds = await page.evaluate(() => {
        const rect = (selector) => {
          const r = document.querySelector(selector).getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height };
        };
        return {
          width: innerWidth,
          overflow: document.body.scrollWidth,
          header: rect('.header-actions'),
          controls: rect('.window-controls'),
          tools: rect('.toolbar'),
          modes: rect('.view-switch'),
          editor: rect('#editors'),
        };
      });
      expect(bounds.overflow).toBeLessThanOrEqual(width);
      expect(bounds.header.right).toBeLessThanOrEqual(bounds.controls.left);
      expect(bounds.tools.right).toBeLessThanOrEqual(width);
      expect(
        bounds.tools.right <= bounds.modes.left || bounds.tools.bottom <= bounds.modes.top,
      ).toBeTruthy();
      expect(bounds.editor.height).toBeGreaterThan(350);
    }
    for (const format of ['strike', 'quote', 'table', 'link']) {
      await expect(page.locator(`[data-format="${format}"]`)).toBeVisible();
    }
  }
  await page.keyboard.press('F8');
  await expect(page.locator('.editor-tools')).toBeHidden();
  await expect(page.locator('#sidebar')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('.editor-tools')).toBeVisible();
});

test('sidebar collapse survives reload and search remains reachable in a narrow window', async ({
  page,
}) => {
  await page.locator('#sidebar-toggle').click();
  await expect(page.locator('#sidebar')).toBeHidden();
  await page.reload();
  await page.evaluate(() => window.FieldMarkdown.ready);
  await expect(page.locator('#sidebar')).toBeHidden();
  await page.keyboard.press('Control+Shift+F');
  await expect(page.locator('#workspace-query')).toBeFocused();
  await page.setViewportSize({ width: 800, height: 600 });
  await expect(page.locator('#sidebar')).toBeHidden();
  await page.locator('#sidebar-toggle').click();
  await expect(page.locator('#sidebar')).toBeVisible();
  await page.locator('[data-side="outline"]').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#sidebar')).toBeHidden();
  await expect(page.locator('#sidebar-toggle')).toBeFocused();
  await page.locator('#sidebar-toggle').click();
  await page.locator('#sidebar-dismiss').click();
  await expect(page.locator('#sidebar')).toBeHidden();
});

test('export menu supports keyboard dismissal, HTML download and leaves dirty text unchanged', async ({
  page,
}) => {
  await page.locator('[data-mode="source"]').click();
  await page.locator('.cm-content').fill('# 布局调整后的文档');
  await page.locator('#export-toggle').focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[data-action="export-pdf"]')).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.locator('[data-action="save-as"]')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#export-toggle')).toBeFocused();
  await expect(page.locator('#export-menu')).toBeHidden();
  await page.locator('#export-toggle').click();
  const download = page.waitForEvent('download');
  await page.locator('[data-action="export"]').click();
  expect((await download).suggestedFilename()).toMatch(/\.html$/);
  await expect(page.locator('#export-menu')).toBeHidden();
  await expect(page.locator('#save-state')).toHaveText('未保存');
  await expect(page.locator('.cm-content')).toContainText('布局调整后的文档');
  await page.locator('#export-toggle').click();
  await page.locator('[data-action="theme"]').click();
  await expect(page.locator('#export-menu')).toBeHidden();
  await expect(page.locator('body')).toHaveClass(/dark/);
});
