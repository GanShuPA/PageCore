import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const root = 'E:\\项目笔记';
    let folder = { root, name: '项目笔记' };
    const entries = {
      '': [
        { name: '章节', path: '章节', directory: true },
        { name: '介绍.md', path: '介绍.md', directory: false },
      ],
      章节: [{ name: '第一章.md', path: '章节/第一章.md', directory: false }],
    };
    const docs = {
      welcome: { id: 'welcome', name: '欢迎.md', text: '欢迎', cleanText: '欢迎', path: null },
    };
    let active = 'welcome';
    let sequence = 0;
    window.folderCalls = [];
    window.folderOptions = {};
    window.fieldHost = {
      async request(command, payload) {
        window.folderCalls.push({ command, ...payload });
        if (command === 'ready') {
          return { document: docs.welcome, folder };
        }
        const origin = Object.values(docs).find((doc) => doc.id === payload.tabId);
        if (origin) {
          origin.text = payload.text;
        }
        const path = payload.path || '';
        if (command === 'workspace:list') {
          const snapshot = entries[path] || [];
          if (window.folderOptions.delay && path === '章节') {
            await new Promise((resolve) => {
              window.releaseFolderRead = resolve;
            });
          }
          if (window.folderOptions.failList) {
            throw new Error('目录暂时无法访问');
          }
          return { entries: snapshot };
        }
        if (command === 'workspace:choose') {
          if (window.folderOptions.cancel) {
            return null;
          }
          folder = { root: 'E:\\另一工作区', name: '另一工作区' };
          entries[''] = [{ name: '新的.md', path: '新的.md', directory: false }];
          return folder;
        }
        if (command === 'workspace:close') {
          folder = null;
          return { closed: true };
        }
        if (command === 'workspace:create-folder' || command === 'workspace:create-file') {
          if (payload.name === '介绍.md') {
            throw new Error('已有同名文件或文件夹，请换一个名称。');
          }
          const created = path ? path + '/' + payload.name : payload.name;
          const directory = command.endsWith('folder');
          entries[path] ||= [];
          entries[path].push({ path: created, name: payload.name, directory });
          if (directory) {
            entries[created] = [];
            return { created: true };
          }
          docs[created] = {
            id: 'doc-' + ++sequence,
            name: payload.name,
            path: root + '\\' + created.replaceAll('/', '\\'),
            text: '',
            cleanText: '',
          };
          active = created;
          return { document: { ...docs[active] } };
        }
        if (command === 'workspace:file') {
          if (!docs[path]) {
            docs[path] = {
              id: 'doc-' + ++sequence,
              name: path.split('/').at(-1),
              path: root + '\\' + path.replaceAll('/', '\\'),
              text: '# 正文\n',
              cleanText: '# 正文\n',
            };
          }
          active = path;
          return { document: { ...docs[active] } };
        }
        if (command === 'workspace:rename') {
          const doc = docs[path];
          const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
          const target = parent ? parent + '/' + payload.name : payload.name;
          const entry = entries[parent].find((entry) => entry.path === path);
          entry.path = target;
          entry.name = payload.name;
          doc.name = payload.name;
          doc.path = root + '\\' + target.replaceAll('/', '\\');
          docs[target] = doc;
          delete docs[path];
          if (active === path) {
            active = target;
          }
          return { renamed: true, documents: [{ id: doc.id, name: doc.name, path: doc.path }] };
        }
        if (command === 'select-tab') {
          active = Object.keys(docs).find((key) => docs[key].id === payload.targetId);
          return { ...docs[active] };
        }
        if (command === 'save') {
          docs[active].cleanText = docs[active].text;
          return { ...docs[active] };
        }
        return null;
      },
    };
  });
  await page.goto('/');
  await page.evaluate(() => window.FieldMarkdown.ready);
});

test('restores a lazy folder tree, reuses tabs and preserves dirty text and undo across file rename', async ({
  page,
}) => {
  await expect(page.locator('#workspace-panel')).toBeVisible();
  await expect(page.locator('#workspace-root')).toHaveText('项目笔记');
  expect(
    await page.evaluate(() =>
      window.folderCalls
        .filter((call) => call.command === 'workspace:list')
        .map((call) => call.path),
    ),
  ).toEqual(['']);
  await page.getByRole('treeitem', { name: '章节', exact: true }).click();
  await page.getByRole('treeitem', { name: '第一章.md', exact: true }).click();
  await expect(page.getByRole('tab')).toHaveCount(2);
  await page.locator('[data-mode="source"]').click();
  await page.locator('.cm-content').fill('尚未保存的章节');
  await page.getByRole('treeitem', { name: '第一章.md', exact: true }).click();
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(page.locator('.cm-content')).toHaveText('尚未保存的章节');
  await page.keyboard.press('F2');
  await expect(page.locator('#workspace-dialog')).toBeVisible();
  await page.locator('#workspace-name').fill('修改后的章节.md');
  await page.locator('#workspace-submit').click();
  await expect(page.locator('#workspace-dialog')).not.toBeVisible();
  await expect(page.getByRole('tab', { selected: true })).toContainText('修改后的章节.md');
  await expect(page.locator('#save-state')).toHaveText('未保存');
  await expect(page.locator('.cm-content')).toHaveText('尚未保存的章节');
  await expect(page.getByRole('treeitem', { name: '修改后的章节.md' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await page.locator('.cm-content').focus();
  await page.keyboard.press('Control+z');
  await expect(page.locator('.cm-content')).toContainText('# 正文');
  await page.keyboard.press('Control+y');
  await expect(page.locator('.cm-content')).toHaveText('尚未保存的章节');
  await page.screenshot({ path: '.runtime/workspace-preview.png' });
  await page.getByRole('button', { name: '关闭工作区', exact: true }).click();
  await expect(page.locator('.workspace-empty')).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(page.locator('#save-state')).toHaveText('未保存');
});

test('creates documents and folders in the selected location, handles collisions and cancelled folder selection', async ({
  page,
}) => {
  await page.evaluate(() => {
    window.folderOptions.cancel = true;
  });
  await page.locator('.open-workspace').click();
  await expect(page.locator('#workspace-root')).toHaveText('项目笔记');
  await page.getByRole('button', { name: '工作区新建文档', exact: true }).click();
  await page.locator('#workspace-name').fill('介绍.md');
  await page.locator('#workspace-submit').click();
  await expect(page.locator('#workspace-dialog')).toBeVisible();
  await expect(page.locator('#toast')).toContainText('已有同名');
  await expect(page.getByRole('tab')).toHaveCount(1);
  await page.locator('#workspace-name').fill('新笔记');
  await page.locator('#workspace-submit').click();
  await expect(page.locator('#workspace-dialog')).not.toBeVisible();
  await expect(page.getByRole('treeitem', { name: '新笔记.md' })).toBeVisible();
  await expect(page.getByRole('tab', { selected: true })).toContainText('新笔记.md');
  await page.getByRole('treeitem', { name: '章节', exact: true }).click();
  await page.getByRole('button', { name: '工作区新建文件夹', exact: true }).click();
  await expect(page.locator('#workspace-location')).toContainText('章节');
  await page.locator('#workspace-name').fill('子文件夹');
  await page.locator('#workspace-submit').click();
  await expect(page.getByRole('treeitem', { name: '子文件夹' })).toBeVisible();
  await page.getByRole('treeitem', { name: '章节', exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('treeitem', { name: '章节', exact: true })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('treeitem', { name: '子文件夹' })).toBeVisible();
});

test('ignores directory responses from a previous workspace and recovers after refresh failure', async ({
  page,
}) => {
  await page.evaluate(() => {
    window.folderOptions.delay = true;
  });
  await page.getByRole('treeitem', { name: '章节', exact: true }).click();
  await expect.poll(() => page.evaluate(() => typeof window.releaseFolderRead)).toBe('function');
  await page.locator('.open-workspace').click();
  await expect(page.locator('#workspace-root')).toHaveText('另一工作区');
  await expect(page.getByRole('treeitem', { name: '新的.md' })).toBeVisible();
  await page.evaluate(() => window.releaseFolderRead());
  await expect(page.getByRole('treeitem')).toHaveCount(1);
  await page.evaluate(() => {
    window.folderOptions.failList = true;
  });
  await page.getByRole('button', { name: '刷新工作区', exact: true }).click();
  await expect(page.locator('#workspace-status')).toContainText('目录暂时无法访问');
  await expect(page.getByRole('treeitem', { name: '新的.md' })).toBeVisible();
  await page.evaluate(() => {
    window.folderOptions.failList = false;
  });
  await page.getByRole('button', { name: '刷新工作区', exact: true }).click();
  await expect(page.locator('#workspace-status')).toContainText('已刷新');
  await expect(page.getByRole('button', { name: '刷新工作区', exact: true })).toBeEnabled();
});
