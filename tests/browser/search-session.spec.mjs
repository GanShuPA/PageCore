import { test, expect } from '@playwright/test';

async function setup(page) {
  await page.addInitScript(() => {
    const root = 'E:\\notes';
    const body = Array.from({ length: 250 }, (_, i) => `第 ${i + 1} 行 needle 内容`).join('\n');
    const docs = [
      {
        id: 'a',
        path: root + '\\first.md',
        name: 'first.md',
        text: body,
        cleanText: body,
        view: { mode: 'read', previewTop: 300 },
      },
      {
        id: 'b',
        path: root + '\\second.md',
        name: 'second.md',
        text: body,
        cleanText: body,
        view: { mode: 'source', anchor: 12, head: 18, sourceTop: 500 },
      },
    ];
    let active = localStorage.getItem('test-active') || 'b';
    let folder = { root, name: 'notes' };
    window.featureCalls = [];
    window.fieldHost = {
      async request(command, payload) {
        window.featureCalls.push({ command, ...payload });
        if (command === 'ready') {
          const saved = JSON.parse(localStorage.getItem('test-views') || '[]');
          for (const entry of saved) {
            const doc = docs.find((d) => d.id === entry.tabId);
            if (doc) {
              doc.view = entry.view;
            }
          }
          return {
            documents: docs,
            document: docs[1],
            activeId: active,
            folder,
            sessionSupported: true,
          };
        }
        if (command === 'session-state') {
          localStorage.setItem('test-views', JSON.stringify(payload.views));
          return;
        }
        const origin = docs.find((d) => d.id === payload.tabId);
        if (origin && payload.text !== undefined) {
          origin.text = payload.text;
        }
        if (command === 'select-tab') {
          active = payload.targetId;
          localStorage.setItem('test-active', active);
          return docs.find((d) => d.id === active);
        }
        if (command === 'workspace:list') {
          return { entries: docs.map((d) => ({ name: d.name, path: d.name, directory: false })) };
        }
        if (command === 'workspace:search-cancel') {
          return { cancelled: true };
        }
        if (command === 'workspace:close') {
          folder = null;
          return { closed: true };
        }
        if (command === 'workspace:file') {
          active = docs.find((d) => d.name === payload.path).id;
          return { document: docs.find((d) => d.id === active) };
        }
        if (command === 'workspace:search') {
          if (payload.query === 'slow') {
            await new Promise((resolve) => {
              window.releaseSearch = resolve;
            });
          }
          const doc = docs.find((d) => d.id === active);
          const index = doc.text.indexOf('needle');
          return {
            scanned: 2,
            skipped: 0,
            limited: false,
            hits: [
              {
                path: doc.name,
                line: 1,
                column: index,
                length: 6,
                match: 'needle',
                preview: doc.text.split('\n')[0],
                previewColumn: index,
                unsaved: doc.text !== doc.cleanText,
              },
            ],
          };
        }
        return null;
      },
    };
  });
  await page.goto('/');
  await page.evaluate(() => window.FieldMarkdown.ready);
}

test('session restores tab order, active tab, selection, per-tab mode and scroll after reload', async ({
  page,
}) => {
  await setup(page);
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(page.getByRole('tab').nth(0)).toContainText('first.md');
  await expect(page.getByRole('tab').nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'source');
  await expect
    .poll(() => page.locator('.cm-scroller').evaluate((e) => e.scrollTop))
    .toBeGreaterThan(300);
  const views = await page.evaluate(() => window.FieldMarkdown.sessionSnapshot());
  expect(views[1].view.anchor).toBe(12);
  expect(views[1].view.head).toBe(18);
  await page.locator('.cm-scroller').evaluate((e) => {
    e.scrollTop = 700;
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem('test-views') || '[]').find((e) => e.tabId === 'b')?.view
            .sourceTop || 0,
      ),
    )
    .toBeGreaterThan(600);
  await page.reload();
  await page.evaluate(() => window.FieldMarkdown.ready);
  await expect
    .poll(() => page.locator('.cm-scroller').evaluate((e) => e.scrollTop))
    .toBeGreaterThan(600);
  await page.getByRole('tab').first().click();
  await expect(page.locator('body')).toHaveAttribute('data-mode', 'read');
  await expect
    .poll(() => page.locator('#preview-pane').evaluate((e) => e.scrollTop))
    .toBeGreaterThan(200);
});

test('workspace search uses latest unsaved content, jumps without duplicating a tab, and retains undo', async ({
  page,
}) => {
  await setup(page);
  await page.locator('.cm-content').fill('unsaved needle text');
  await page.keyboard.press('Control+Shift+F');
  await expect(page.locator('#workspace-query')).toBeFocused();
  await page.locator('#workspace-query').fill('needle');
  await expect(page.locator('.search-hit')).toHaveCount(1);
  await expect(page.locator('.search-hit mark')).toHaveText('needle');
  await page.locator('.search-hit').click();
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(page.locator('.cm-content')).toHaveText('unsaved needle text');
  await expect(page.locator('#save-state')).toHaveText('未保存');
  const views = await page.evaluate(() => window.FieldMarkdown.sessionSnapshot());
  expect(
    views.find((e) => e.tabId === 'b').view.head - views.find((e) => e.tabId === 'b').view.anchor,
  ).toBe(6);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.cm-content')).toContainText('第 250 行');
});

test('cancel and workspace changes discard late search replies', async ({ page }) => {
  await setup(page);
  await page.keyboard.press('Control+Shift+F');
  await page.locator('#workspace-query').fill('slow');
  await expect.poll(() => page.evaluate(() => typeof window.releaseSearch)).toBe('function');
  await page.locator('#workspace-search-stop').click();
  await page.evaluate(() => window.releaseSearch());
  await expect(page.locator('#workspace-search-status')).toHaveText('搜索已停止。');
  await expect(page.locator('.search-hit')).toHaveCount(0);
  await page.locator('#workspace-query').fill('needle');
  await expect(page.locator('.search-hit')).toHaveCount(1);
  await page.locator('[data-side="files"]').click();
  await page.locator('[data-workspace="close"]').click();
  await page.keyboard.press('Control+Shift+F');
  await expect(page.locator('.search-hit')).toHaveCount(0);
  await expect(page.locator('#workspace-search-status')).toContainText('请先打开');
});
