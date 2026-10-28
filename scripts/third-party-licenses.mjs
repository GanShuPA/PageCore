import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

async function packageDirectories(base) {
  const directories = [];
  for (const name of (await readdir(base)).sort()) {
    if (name.startsWith('@')) {
      for (const child of (await readdir(path.join(base, name))).sort()) {
        directories.push(path.join(base, name, child));
      }
    } else {
      directories.push(path.join(base, name));
    }
  }
  return directories;
}

/** Collect installed package notices in deterministic order, including build dependencies. */
export async function writeThirdPartyNotices(
  store = 'node_modules/.pnpm',
  output = 'dist/licenses',
) {
  const packages = new Map();
  for (const item of (await readdir(store, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name, 'en'),
  )) {
    const entry = item.name;
    if (!item.isDirectory() || entry === 'node_modules' || entry.startsWith('.')) {
      continue;
    }
    for (const directory of await packageDirectories(path.join(store, entry, 'node_modules'))) {
      let metadata;
      try {
        metadata = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
      } catch (error) {
        // pnpm can leave dangling optional platform dependencies in its virtual store.
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
          continue;
        }
        throw error;
      }
      const key = `${metadata.name}@${metadata.version}`;
      if (packages.has(key)) {
        continue;
      }
      const notices = [];
      for (const file of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
        a.name.localeCompare(b.name, 'en'),
      )) {
        if (!file.isFile() || !/^(license|licence|notice|copyright)(\.|$)/i.test(file.name)) {
          continue;
        }
        const content = await readFile(path.join(directory, file.name), 'utf8');
        notices.push(
          `\n===== ${metadata.name} ${metadata.version} / ${file.name} =====\n${content}`,
        );
      }
      packages.set(key, {
        metadata: {
          name: metadata.name,
          version: metadata.version,
          license: metadata.license || 'See package license',
        },
        notices,
      });
    }
  }
  const sorted = [...packages.entries()].sort(([a], [b]) => a.localeCompare(b, 'en'));
  await mkdir(output, { recursive: true });
  await writeFile(
    path.join(output, 'THIRD-PARTY.json'),
    JSON.stringify(
      sorted.map(([, entry]) => entry.metadata),
      null,
      2,
    ) + '\n',
  );
  await writeFile(
    path.join(output, 'THIRD-PARTY-LICENSES.txt'),
    sorted.flatMap(([, entry]) => entry.notices).join('\n'),
  );
}
