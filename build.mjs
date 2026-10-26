import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
import { writeThirdPartyNotices } from './scripts/third-party-licenses.mjs';
await mkdir('dist', { recursive: true });
await build({
  entryPoints: ['src/app.js'],
  bundle: true,
  minify: true,
  sourcemap: false,
  target: ['chrome120'],
  format: 'iife',
  outfile: 'dist/app.js',
  loader: { '.md': 'text', '.woff2': 'file', '.woff': 'file', '.ttf': 'file' },
  assetNames: 'fonts/[name]-[hash]',
  logLevel: 'info',
  legalComments: 'external',
});
await copyFile('index.html', 'dist/index.html');
await copyFile('src/welcome.md', 'dist/welcome.md');
await copyFile('assets/field-notes.svg', 'dist/field-notes.svg');
await writeThirdPartyNotices();
console.log('Offline UI ready in dist/');
