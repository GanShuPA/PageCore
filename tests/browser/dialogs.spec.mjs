import { test, expect } from '@playwright/test';

test('the browser confirmation uses the application theme and cancellation preserves the document', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => window.FieldMarkdown.ready);
  await page.locator('[data-mode="source"]').click();
  await page.locator('.cm-content').fill('尚未保存的内容');
  await page.locator('[data-action="theme"]').click();
  await page.keyboard.press('Control+W');
  const dialog = page.locator('#confirm-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-labelledby', 'confirm-title');
  await expect(page.locator('#confirm-message')).toContainText('未保存');
  await expect(page.locator('body')).toHaveClass(/dark/);
  await dialog.getByRole('button', { name: '取消' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.cm-content')).toHaveText('尚未保存的内容');
  await expect(page.locator('#save-state')).toHaveText('未保存');
  await page.keyboard.press('Control+W');
  await dialog.getByRole('button', { name: '不保存并关闭' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(1);
});
