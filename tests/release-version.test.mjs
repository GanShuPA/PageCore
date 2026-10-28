import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('package, Windows executable, manifest and release documentation use the same version', () => {
  const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const { version } = JSON.parse(read('package.json'));
  assert.match(version, /^\d+\.\d+\.\d+$/);
  const assembly = read('native/AssemblyInfo.cs');
  assert.ok(assembly.includes(`AssemblyVersion("${version}.0")`));
  assert.ok(assembly.includes(`AssemblyFileVersion("${version}.0")`));
  assert.ok(read('native/app.manifest').includes(`version="${version}.0"`));
  assert.ok(read('README.md').includes(`PageCore-v${version}-windows-x64.zip`));
  assert.ok(read(`docs/releases/v${version}.md`).includes(`v${version}`));
});
