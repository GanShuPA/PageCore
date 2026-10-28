import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { writeThirdPartyNotices } from './third-party-licenses.mjs';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
await mkdir('dist', { recursive: true });
await build({
  absWorkingDir: process.cwd(),
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
await copyFile('src/index.html', 'dist/index.html');
await copyFile('src/welcome.md', 'dist/welcome.md');
await copyFile('assets/field-notes.svg', 'dist/field-notes.svg');
await mkdir('dist/licenses', { recursive: true });
await copyFile('vendor/webview2/LICENSE.txt', 'dist/licenses/LICENSE-WebView2.txt');
await writeThirdPartyNotices();
console.log('Offline UI ready in dist/');
