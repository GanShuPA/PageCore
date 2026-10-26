import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { writeThirdPartyNotices } from '../scripts/third-party-licenses.mjs';

test('license collection skips store metadata, deduplicates packages and fails on malformed metadata', async () => {
  const root = path.resolve('.runtime', `licenses-${randomUUID()}`);
  const store = path.join(root, 'store');
  for (const slot of ['b', 'a']) {
    const directory = path.join(store, slot, 'node_modules', 'example');
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, 'package.json'),
      JSON.stringify({ name: 'example', version: '1.0.0', license: 'MIT' }),
    );
    await writeFile(path.join(directory, 'LICENSE'), 'Example license');
  }
  await writeFile(path.join(store, 'lock.yaml'), 'lockfileVersion: 9');
  await writeThirdPartyNotices(store, root);
  assert.deepEqual(JSON.parse(await readFile(path.join(root, 'THIRD-PARTY.json'), 'utf8')), [
    { name: 'example', version: '1.0.0', license: 'MIT' },
  ]);
  const notices = await readFile(path.join(root, 'THIRD-PARTY-LICENSES.txt'), 'utf8');
  assert.equal(notices.match(/Example license/g).length, 1);
  await writeThirdPartyNotices(store, root);
  assert.equal(await readFile(path.join(root, 'THIRD-PARTY-LICENSES.txt'), 'utf8'), notices);
  await writeFile(path.join(store, 'a', 'node_modules', 'example', 'package.json'), '{');
  await assert.rejects(writeThirdPartyNotices(store, root), SyntaxError);
});
