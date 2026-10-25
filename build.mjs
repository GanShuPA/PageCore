import { build } from 'esbuild';
import { mkdir, copyFile, readFile, writeFile, readdir } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await build({entryPoints:['src/app.js'], bundle:true, minify:true, sourcemap:false, target:['chrome120'], format:'iife', outfile:'dist/app.js', loader:{'.md':'text','.woff2':'file','.woff':'file','.ttf':'file'}, assetNames:'fonts/[name]-[hash]', logLevel:'info', legalComments:'external'});
await copyFile('index.html','dist/index.html');
await copyFile('src/welcome.md','dist/welcome.md');
await copyFile('assets/field-notes.svg','dist/field-notes.svg');
const packages=[],licenses=[];
for(const dir of await readdir('node_modules/.pnpm')) {
  if(dir==='node_modules'||dir.startsWith('.'))continue;
  const base='node_modules/.pnpm/'+dir+'/node_modules';
  try { for(const name of await readdir(base)){
    const names=name.startsWith('@')?(await readdir(base+'/'+name)).map(n=>name+'/'+n):[name];
    for(const n of names) {try {const p=JSON.parse(await readFile(base+'/'+n+'/package.json','utf8'));if(!packages.some(x=>x.name===p.name&&x.version===p.version)){packages.push({name:p.name,version:p.version,license:p.license||'See package license'});const licenseFiles=(await readdir(base+'/'+n)).filter(f=>/^(license|licence|notice|copyright)(\.|$)/i.test(f));for(const file of licenseFiles){try{licenses.push(`\n===== ${p.name} ${p.version} / ${file} =====\n`+await readFile(base+'/'+n+'/'+file,'utf8'));}catch{}}}}catch{}}
  }}catch{}
}
await writeFile('THIRD-PARTY.json',JSON.stringify(packages,null,2));
await writeFile('THIRD-PARTY-LICENSES.txt',licenses.join('\n'));
console.log('Offline UI ready in dist/');
