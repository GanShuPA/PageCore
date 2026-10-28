import { test, expect } from '@playwright/test';

async function boot(page) {
  await page.addInitScript(() => {
    localStorage.setItem('pagecore-auto-update', 'off');
    window.updateCalls = [];
    window.updateFail = false;
    window.chrome ||= {};
    window.chrome.webview = { addEventListener() {}, postMessage() {} };
    window.fieldHost = {
      async request(command) {
        window.updateCalls.push(command);
        if (command === 'ready') {
          return { document: { name: '测试.md', text: '# 保留我的内容' } };
        }
        if (command === 'update:check') {
          return { version: '1.2.0', notes: '<script>untrusted</script>\n更新说明' };
        }
        if (command === 'update:download') {
          if (window.updateFail) {
            throw Error('校验失败');
          }
          return { downloaded: true };
        }
        return null;
      },
    };
  });
  await page.goto('/');
  await page.evaluate(() => window.FieldMarkdown.ready);
  await page.locator('[data-action="settings"]').click();
  await page.locator('#updates-tab').click();
}

test('update workflow shows safe notes, rejects failed downloads, retries and requests installation', async ({
  page,
}) => {
  await boot(page);
  await expect(page.locator('#app-version')).toHaveText('v1.0.0');
  await page.locator('#update-check').click();
  await expect(page.locator('#update-notes')).toContainText('<script>untrusted</script>');
  expect(await page.locator('#update-notes script').count()).toBe(0);
  await page.evaluate(() => {
    window.updateFail = true;
  });
  await page.locator('#update-download').click();
  await expect(page.locator('#update-status')).toContainText('校验失败');
  await expect(page.locator('#update-install')).toBeHidden();
  await page.evaluate(() => {
    window.updateFail = false;
  });
  await page.locator('#update-download').click();
  await expect(page.locator('#update-install')).toBeVisible();
  await page.locator('#update-install').click();
  expect(await page.evaluate(() => window.updateCalls)).toContain('update:install');
  await page.locator('#done-settings').click();
  await expect(page.locator('#rich-editor')).toContainText('保留我的内容');
});

test('three settings tabs navigate in order and browser preview cannot install updates', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => window.FieldMarkdown.ready);
  await page.locator('[data-action="settings"]').click();
  await page.locator('#appearance-tab').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#shortcuts-tab')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#updates-tab')).toBeFocused();
  await expect(page.locator('#update-check')).toBeDisabled();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#appearance-tab')).toBeFocused();
});

test('cancelling a pending download leaves installation unavailable', async ({ page }) => {
  await boot(page);
  await page.locator('#update-check').click();
  await page.evaluate(() => {
    const request = window.fieldHost.request;
    window.fieldHost.request = (command, payload) => {
      if (command === 'update:download') {
        return new Promise((resolve) => {
          window.endDownload = resolve;
        });
      }
      if (command === 'update:cancel') {
        window.endDownload({ downloaded: true });
      }
      return request(command, payload);
    };
  });
  await page.locator('#update-download').click();
  await page.locator('#update-cancel').click();
  await expect(page.locator('#update-status')).toContainText('已取消');
  await expect(page.locator('#update-install')).toBeHidden();
});
