import { test, expect } from '@playwright/test';

test('PDF export sends the latest text, preserves dirty state and recovers after cancel or failure', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.pdfResult = 'cancel';
    window.pdfCalls = [];
    window.fieldHost = {
      async request(command, payload) {
        if (command === 'ready') {
          return { document: { name: 'PDF测试.md', text: '# 原文\n', path: null }, recovery: null };
        }
        if (command === 'export-pdf') {
          window.pdfCalls.push(payload);
          if (window.pdfResult === 'cancel') {
            return null;
          }
          if (window.pdfResult === 'error') {
            throw new Error('PDF 生成失败');
          }
          return { path: '测试.pdf' };
        }
        return null;
      },
    };
  });
  await page.goto('/');
  await page.evaluate(() => window.FieldMarkdown.ready);
  await page.locator('[data-mode="source"]').click();
  await page.locator('.cm-content').fill('# 最新中文内容\n\n导出不会保存 Markdown。');
  const button = page.locator('[data-action="export-pdf"]');
  for (const outcome of ['cancel', 'error', 'success']) {
    await page.evaluate((value) => {
      window.pdfResult = value;
    }, outcome);
    await page.locator('#export-toggle').click();
    await button.click();
    await page.locator('#pdf-submit').click();
    await expect(button).toBeEnabled();
    await expect(button).toHaveText('导出 PDF');
    await expect(page.locator('#save-state')).toHaveText('未保存');
    if (outcome === 'error') {
      await expect(page.locator('#toast')).toHaveText('PDF 生成失败');
    }
    if (outcome === 'success') {
      await expect(page.locator('#toast')).toContainText('PDF 已导出');
    }
  }
  const calls = await page.evaluate(() => window.pdfCalls);
  expect(calls).toHaveLength(3);
  expect(calls[0].text).toContain('最新中文内容');
  expect(calls[0].html).toContain('<h1 id="heading-0">最新中文内容</h1>');
});

test('PDF options validate margins, persist only after success and cancel without exporting', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.pdfCalls = [];
    window.fieldHost = {
      async request(command, payload) {
        if (command === 'ready') {
          return { document: { name: '设置.md', text: '# 设置测试', path: null } };
        }
        if (command === 'export-pdf') {
          window.pdfCalls.push(payload);
          return { path: '设置.pdf' };
        }
        return null;
      },
    };
  });
  await page.goto('/');
  await page.evaluate(() => window.FieldMarkdown.ready);
  const button = page.locator('[data-action="export-pdf"]');
  await page.locator('#export-toggle').click();
  await button.click();
  const form = page.locator('#pdf-form');
  await form.locator('[name="paper"]').selectOption('A5');
  await form.locator('[name="orientation"]').selectOption('landscape');
  await form.locator('[name="font"]').selectOption('serif');
  await form.locator('[name="fontSize"]').fill('14');
  await form.locator('[name="header"]').fill('中文页眉');
  await form.locator('[name="footer"]').fill('页核文档');
  await form.locator('[name="pageNumbers"]').check();
  await form.locator('[name="marginTop"]').fill('5');
  await page.locator('#pdf-submit').click();
  await expect(page.locator('#pdf-error')).toContainText('至少需要 12');
  expect(await page.evaluate(() => window.pdfCalls.length)).toBe(0);
  await form.locator('[name="marginTop"]').fill('20');
  await page.locator('#pdf-submit').click();
  await expect(page.locator('#toast')).toContainText('PDF 已导出');
  const payload = await page.evaluate(() => window.pdfCalls[0]);
  expect(payload.options).toMatchObject({
    paper: 'A5',
    orientation: 'landscape',
    font: 'serif',
    fontSize: 14,
    marginTop: 20,
    pageNumbers: true,
  });
  expect(payload.html).toContain('size: A5 landscape');
  await page.reload();
  await page.evaluate(() => window.FieldMarkdown.ready);
  await page.locator('#export-toggle').click();
  await button.click();
  await expect(form.locator('[name="paper"]')).toHaveValue('A5');
  await expect(form.locator('[name="header"]')).toHaveValue('中文页眉');
  await page.locator('#pdf-reset').click();
  await expect(form.locator('[name="fontSize"]')).toHaveValue('11');
  await page.keyboard.press('Escape');
  await page.locator('#export-toggle').click();
  await button.click();
  await expect(form.locator('[name="paper"]')).toHaveValue('A5');
  await page.locator('#pdf-cancel').click();
  expect(await page.evaluate(() => window.pdfCalls.length)).toBe(0);
});

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => window.FieldMarkdown.ready);
  await expect(page.locator('#loading')).toBeHidden();
});

test('Word export uses current content and keeps dirty state after cancellation, failure and success', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.wordResult = 'cancel';
    window.wordCalls = [];
    window.fieldHost = {
      async request(command, payload) {
        if (command === 'ready') {
          return { document: { name: '导出.md', text: '# 原文', path: null } };
        }
        if (command === 'prepare-word') {
          window.preparedText = payload.text;
          return { html: payload.html };
        }
        if (command === 'export-word') {
          window.wordCalls.push(payload);
          if (window.wordResult === 'error') {
            throw new Error('保存 Word 失败');
          }
          return window.wordResult === 'cancel' ? null : { path: '导出.docx' };
        }
        return null;
      },
    };
  });
  await page.goto('/');
  await page.evaluate(() => window.FieldMarkdown.ready);
  await page.locator('[data-mode="source"]').click();
  await page.locator('.cm-content').fill('# 最新的 Word 内容\n\n**中文** $x^2$');
  const button = page.locator('[data-action="export-word"]');
  for (const result of ['cancel', 'error', 'success']) {
    await page.evaluate((value) => {
      window.wordResult = value;
    }, result);
    await page.locator('#export-toggle').click();
    await button.click();
    await expect(button).toHaveText('导出 Word');
    await expect(button).toBeEnabled();
    await expect(page.locator('#save-state')).toHaveText('未保存');
    if (result === 'error') {
      await expect(page.locator('#toast')).toHaveText('保存 Word 失败');
    }
    if (result === 'success') {
      await expect(page.locator('#toast')).toContainText('Word 已导出');
    }
  }
  expect(await page.evaluate(() => window.preparedText)).toContain('最新的 Word 内容');
  const calls = await page.evaluate(() => window.wordCalls);
  expect(calls).toHaveLength(3);
  expect(calls[0].base64).toMatch(/^UEsDB/);
  await page.setViewportSize({ width: 700, height: 450 });
  const right = await button.evaluate((el) => el.getBoundingClientRect().right);
  expect(right).toBeLessThanOrEqual(700);
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
