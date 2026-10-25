import { Crepe } from '@milkdown/crepe';
import { replaceAll, callCommand, insert } from '@milkdown/kit/utils';
import { editorViewCtx } from '@milkdown/kit/core';
import { toggleStrongCommand,toggleEmphasisCommand,wrapInHeadingCommand,wrapInBulletListCommand,wrapInBlockquoteCommand,createCodeBlockCommand } from '@milkdown/kit/preset/commonmark';
import { toggleStrikethroughCommand, insertTableCommand } from '@milkdown/kit/preset/gfm';
import { basicSetup, EditorView } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { openSearchPanel, search } from '@codemirror/search';
import { createRenderer,headings,countWords,exportDocument,assetURL } from './render.js';
import { setupShortcuts } from './shortcuts.js';
import welcome from './welcome.md';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import 'katex/dist/katex.min.css';
import './style.css';
import './window-frame.css';
import './settings.css';

const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const icons={plus:'M12 4v16M4 12h16',folder:'M3 7V4h7l3 3h8v13H3zM3 10h18',file:'M5 2h9l5 5v15H5zM14 2v6h5M8 12h8M8 16h8',save:'M4 3h13l4 4v14H3V3zM7 3v7h10V3M7 21v-7h10v7',sun:'M12 2v2M12 20v2M2 12h2M20 12h2M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2M16 12a4 4 0 1 1-8 0 4 4 0 1 1 8 0',focus:'M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6',help:'M9 8a3 3 0 1 1 4 3c-1 1-1 2-1 3M12 17v1M22 12a10 10 0 1 1-20 0 10 10 0 1 1 20 0',list:'M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1',check:'M3 4h17v17H3zM7 12l4 4 7-8',quote:'M4 6h6v7H4zM10 13c0 4-2 5-5 5M14 6h6v7h-6zM20 13c0 4-2 5-5 5',code:'m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18',table:'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18',link:'m9 15 6-6M10 7l2-2a5 5 0 0 1 7 7l-2 2M14 17l-2 2a5 5 0 0 1-7-7l2-2',image:'M3 3h18v18H3zM3 17l6-6 4 4 3-3 5 6M15 7h2v2h-2z',search:'M15 15l6 6M17 10a7 7 0 1 1-14 0 7 7 0 1 1 14 0'};
icons.settings='M4 7h16M4 17h16M8 4v6M16 14v6';
$$('[data-icon]').forEach(el=>el.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[el.dataset.icon]}"/></svg>`);
const bridge=window.fieldHost||window.chrome?.webview;
const isNative=!!window.chrome?.webview;
document.body.classList.toggle('native-window',isNative);
function windowCommand(command,extra={}){if(isNative)window.chrome.webview.postMessage({command:'window:'+command,...extra});}
$$('[data-window]').forEach(button=>button.addEventListener('click',()=>windowCommand(button.dataset.window)));
$$('[data-resize]').forEach(edge=>edge.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();windowCommand('resize',{edge:edge.dataset.resize});}));
const requests=new Map();let seq=0,mdText=welcome,diskText=welcome,metadata={name:'欢迎使用.md',encoding:'UTF-8',eol:'LF',path:null,assetBase:''},mode='write',rich,richReference,richSnapshot='',source,syncing=false,toastTimer,paintTimer,recovery=null,ready=false,busy=false;
const subscribers=new Set();const render=createRenderer(window);
let prefs={dark:false,zoom:100,spacing:1.9};try{Object.assign(prefs,JSON.parse(localStorage.getItem('field-notes-prefs')||'{}'));}catch{}
prefs.dark=prefs.dark===true;prefs.zoom=Number.isFinite(prefs.zoom)?Math.max(80,Math.min(150,Math.round(prefs.zoom/10)*10)):100;
prefs.spacing=[1.6,1.9,2.2].includes(prefs.spacing)?prefs.spacing:1.9;
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,4200);}
function nativeRequest(command,extra={}){
 if(window.fieldHost)return window.fieldHost.request(command,{text:flush(),...extra});
 const id=String(++seq);return new Promise((resolve,reject)=>{requests.set(id,{resolve,reject});bridge.postMessage({id,command,text:flush(),...extra});});
}
if(isNative)bridge.addEventListener('message',event=>{
 const m=event.data;if(m.type==='window-state'){document.body.classList.toggle('window-maximized',m.maximized);$('#window-maximize').title=m.maximized?'还原':'最大化';$('#window-maximize').setAttribute('aria-label',m.maximized?'还原窗口':'最大化窗口');return;}if(m.type==='notice'){toast(m.message);return;}const req=requests.get(m.id);if(!req)return;requests.delete(m.id);m.ok?req.resolve(m.data):req.reject(Error(m.error||'操作失败'));
});
function richDoc(){return rich?.editor.action(ctx=>ctx.get(editorViewCtx).state.doc);}
function updateText(text){
 text=text.replace(/\r\n?/g,'\n');if(text===mdText)return;mdText=text;
 updateStatus();clearTimeout(paintTimer);paintTimer=setTimeout(paint,130);
 if(isNative)bridge.postMessage({command:'changed',text:mdText});
 else if(!window.fieldHost){try{localStorage.setItem('field-notes-draft',JSON.stringify({text:mdText,name:metadata.name}));}catch{}}
 for(const fn of subscribers)fn(mdText);
}
function flush(){
 if(syncing)return mdText;
 if(mode==='write'&&rich&&richDoc()!==richReference){richReference=richDoc();const serialized=rich.getMarkdown();if(serialized!==richSnapshot){richSnapshot=serialized;updateText(serialized);}}
 else if((mode==='source'||mode==='split')&&source)updateText(source.state.doc.toString());
 return mdText;
}
function updateStatus(){
 const dirty=mdText!==diskText;document.body.classList.toggle('dirty',dirty);$('#document-name').textContent=metadata.name;
 $('#save-state').textContent=dirty?'未保存':'已就绪';$('#document-path').textContent=metadata.path||'本地工作空间 / '+metadata.name;
 $('#encoding').textContent=(metadata.encoding||'UTF-8').toUpperCase()+' · '+(metadata.eol||'LF');
 $('#word-count').textContent=countWords(mdText).toLocaleString()+' 字 / 词';
 document.title=(dirty?'● ':'')+metadata.name+' — 页核 · PAGECORE';
 if(source&&(mode==='source'||mode==='split')){const p=source.state.selection.main.head,l=source.state.doc.lineAt(p);$('#cursor-position').textContent=`Ln ${l.number}, Col ${p-l.from+1}`;}else $('#cursor-position').textContent=mode==='write'?'即时排版':mode==='read'?'阅读视图':'';
}
function paint(){
 updateStatus();const list=headings(mdText);$('#outline').replaceChildren();
 list.forEach((h,i)=>{const b=document.createElement('button');b.className='level-'+h.level;b.style.paddingLeft=(Math.min(h.level-1,3)*12+6)+'px';const n=document.createElement('span');n.className='outline-number';n.textContent=String(i+1).padStart(2,'0');const label=document.createElement('span');label.textContent=h.text;b.append(n,label);b.onclick=()=>jumpTo(h,i,b);$('#outline').append(b);});
 if(!list.length)$('#outline').innerHTML='<p class="outline-empty">添加一个标题，<br>让文档有清晰的层次。</p>';
 if(mode==='split'||mode==='read')$('#preview').innerHTML=render(mdText,metadata.assetBase);
}
function jumpTo(h,i,button){
 $$('#outline button').forEach(b=>b.classList.toggle('active',b===button));
 if(mode==='write'){$$('#rich-editor h1,#rich-editor h2,#rich-editor h3,#rich-editor h4,#rich-editor h5,#rich-editor h6')[i]?.scrollIntoView({behavior:'smooth',block:'start'});}
 else if(mode==='read')$('#heading-'+i)?.scrollIntoView({behavior:'smooth',block:'start'});
 else{source.dispatch({selection:{anchor:Math.min(h.offset,source.state.doc.length)},effects:EditorView.scrollIntoView(Math.min(h.offset,source.state.doc.length),{y:'start'})});source.focus();if(mode==='split')$('#heading-'+i)?.scrollIntoView({behavior:'smooth',block:'start'});}
}
function applyPrefs(){
 document.body.classList.toggle('dark',prefs.dark);document.documentElement.style.setProperty('--font-size',16*prefs.zoom/100+'px');document.documentElement.style.setProperty('--reading-line-height',prefs.spacing);
 $('#zoom-label').textContent=prefs.zoom+'%';$('#setting-theme').value=prefs.dark?'dark':'light';$('#setting-zoom').value=prefs.zoom;$('#setting-zoom-value').value=prefs.zoom+'%';$('#setting-spacing').value=String(prefs.spacing);
 try{localStorage.setItem('field-notes-prefs',JSON.stringify(prefs));$('#settings-status').textContent='更改即时生效，自动保存在本机。';}catch{$('#settings-status').textContent='更改已生效，但本机偏好保存失败。';}
 source?.requestMeasure();
}
function sourceExtensions(){return [basicSetup,markdown(),EditorView.lineWrapping,search({top:true}),EditorState.phrases.of({'Find':'查找','Replace':'替换','next':'下一个','previous':'上一个','all':'全选匹配','match case':'区分大小写','regexp':'正则表达式','by word':'全词匹配','replace':'替换','replace all':'全部替换','close':'关闭','No matches':'无匹配结果','Go to line':'跳转到行'}),EditorView.contentAttributes.of({'aria-label':'Markdown 源码编辑区',spellcheck:'false'}),EditorView.updateListener.of(v=>{if(syncing)return;if(v.docChanged&&(mode==='source'||mode==='split'))updateText(v.state.doc.toString());if(v.selectionSet)updateStatus();})];}
function setSource(text,reset=false){syncing=true;try{if(reset)source.setState(EditorState.create({doc:text,extensions:sourceExtensions()}));else if(source.state.doc.toString()!==text)source.dispatch({changes:{from:0,to:source.state.doc.length,insert:text}});}finally{syncing=false;}}
function setRich(text){syncing=true;try{rich.editor.action(replaceAll(text,true));richReference=richDoc();richSnapshot=rich.getMarkdown();}finally{syncing=false;}}
async function setMode(next){
 if(!ready||!['write','source','split','read'].includes(next)||mode===next)return;
 flush();if(next==='write'){if(mdText.length>500000){toast('较长文档请使用源码或分栏模式。');return;}setRich(mdText);}else if(next==='source'||next==='split')setSource(mdText);
 mode=next;document.body.dataset.mode=mode;$$('.view-switch button').forEach(b=>b.classList.toggle('selected',b.dataset.mode===mode));paint();if(mode==='source'||mode==='split')source.requestMeasure();
}
async function loadDocument(data){
 syncing=true;
 try{metadata={...metadata,...data};mdText=(data.text||'').replace(/\r\n?/g,'\n');diskText=(data.cleanText??mdText).replace(/\r\n?/g,'\n');setSource(mdText,true);
  const complex=mdText.length>500000||/^---\n[\s\S]*?\n---/.test(mdText)||/<(?:script|style|iframe|div|table)\b/i.test(mdText);
  if(complex){mode='source';document.body.dataset.mode=mode;$$('.view-switch button').forEach(b=>b.classList.toggle('selected',b.dataset.mode===mode));toast('此文档已使用源码模式打开，保留原始内容。');}
  else setRich(mdText);
  renderRecent(data.recent||[]);$('#write-pane').scrollTop=0;$('#preview-pane').scrollTop=0;
 }finally{syncing=false;paint();}
}
function renderRecent(items){$('#recent').replaceChildren();if(!items.length){$('#recent').innerHTML='<p class="outline-empty">打开或保存文件后，<br>会在这里留下记录。</p>';return;}items.forEach(item=>{const b=document.createElement('button');b.textContent=item.name;const small=document.createElement('small');small.textContent=item.path;b.append(small);b.title=item.path;b.onclick=()=>action('recent',{path:item.path});$('#recent').append(b);});}
function textInsert(value,selectStart=0,selectEnd=value.length){
 if(mode==='read')return;
 if(mode==='write'){rich.editor.action(insert(value));rich.editor.action(ctx=>ctx.get(editorViewCtx).focus());flush();return;}
 const range=source.state.selection.main;source.dispatch({changes:{from:range.from,to:range.to,insert:value},selection:{anchor:range.from+selectStart,head:range.from+selectEnd},scrollIntoView:true});source.focus();
}
function format(kind){
 if(!ready||mode==='read')return;
 if(mode==='write'){
  const commands={h1:[wrapInHeadingCommand.key,1],h2:[wrapInHeadingCommand.key,2],bold:[toggleStrongCommand.key],italic:[toggleEmphasisCommand.key],strike:[toggleStrikethroughCommand.key],bullet:[wrapInBulletListCommand.key],quote:[wrapInBlockquoteCommand.key],code:[createCodeBlockCommand.key],table:[insertTableCommand.key,{row:3,col:3}]};
  if(commands[kind]){rich.editor.action(callCommand(...commands[kind]));rich.editor.action(ctx=>ctx.get(editorViewCtx).focus());flush();return;}
  textInsert(kind==='task'?'- [ ] 待办事项':kind==='link'?'[链接文字](https://example.com)':'');return;
 }
 const r=source.state.selection.main,selected=source.state.sliceDoc(r.from,r.to);
 const wrappers={bold:['**','**','粗体文字'],italic:['*','*','斜体文字'],strike:['~~','~~','删除线文字'],code:['```javascript\n','\n```','// 代码'],link:['[','](https://example.com)','链接文字']};
 if(wrappers[kind]){const [a,b,c]=wrappers[kind],t=selected||c;textInsert(a+t+b,a.length,a.length+t.length);return;}
 if(kind==='table'){textInsert('\n| 标题一 | 标题二 |\n| --- | --- |\n| 内容 | 内容 |\n');return;}
 const prefixes={h1:'# ',h2:'## ',bullet:'- ',task:'- [ ] ',quote:'> '};const first=source.state.doc.lineAt(r.from),last=source.state.doc.lineAt(r.to);const lines=source.state.sliceDoc(first.from,last.to).split('\n');const replacement=lines.map(l=>prefixes[kind]+l.replace(/^#{1,6} /,'')).join('\n');source.dispatch({changes:{from:first.from,to:last.to,insert:replacement}});source.focus();
}
async function uploadImage(file){if(!/^image\/(png|jpeg|gif|webp)$/.test(file.type))throw Error('请选择 PNG、JPEG、GIF 或 WebP 图片。');if(file.size>4*1024*1024)throw Error('单张图片请小于 4 MB。');return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('图片读取失败'));reader.readAsDataURL(file);});}
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function fallbackConfirm(){return mdText===diskText||confirm('当前文档有未保存的更改，是否放弃更改并继续？');}
async function action(name,extra={}){
 if(!ready)return;
 if(name==='theme'){prefs.dark=!prefs.dark;applyPrefs();return;}
 if(name==='focus'){document.body.classList.toggle('focus');return;}
 if(name==='help'){$('#help-dialog').showModal();return;}
 if(name==='settings'){$('#settings-dialog').showModal();return;}
 if(name==='find'){await setMode('source');openSearchPanel(source);return;}
 if(name==='image'){$('#image-input').click();return;}
 if(busy)return;flush();busy=true;
 try{
  if(name==='export'){const html=exportDocument(metadata.name,render(mdText,metadata.assetBase,true));if(bridge){const r=await nativeRequest('export',{html});if(r)toast('HTML 已导出');}else{download(metadata.name.replace(/\.[^.]+$/,'')+'.html',html,'text/html');toast('已导出 HTML');}return;}
  if(bridge){const result=await nativeRequest(name,extra);if(result){if(name==='save'||name==='save-as'){metadata={...metadata,...result};diskText=result.cleanText;renderRecent(result.recent||[]);updateStatus();toast('已保存 · '+metadata.name);}else{await loadDocument(result);$('#recovery-banner').hidden=true;}}}
  else if(name==='open'){if(fallbackConfirm())$('#open-input').click();}
  else if(name==='new'){if(fallbackConfirm())await loadDocument({name:'未命名.md',text:'',path:null});}
  else if(name==='save'||name==='save-as'){download(metadata.name,mdText,'text/markdown');diskText=mdText;updateStatus();toast('已下载 Markdown 副本');}
  else if(name==='restore'&&recovery){if(fallbackConfirm())await loadDocument({...recovery,path:null,cleanText:''});$('#recovery-banner').hidden=true;}
  else if(name==='dismiss-recovery'){$('#recovery-banner').hidden=true;localStorage.removeItem('field-notes-draft');}
 }catch(e){toast(e.message||String(e));}finally{busy=false;}
}
document.addEventListener('click',e=>{const a=e.target.closest('[data-action]');if(a)action(a.dataset.action);const b=e.target.closest('[data-format]');if(b)format(b.dataset.format);const m=e.target.closest('button[data-mode]');if(m)setMode(m.dataset.mode);const link=e.target.closest('#preview a');if(link){e.preventDefault();const url=link.getAttribute('href');if(url?.startsWith('#')){const label=decodeURIComponent(url.slice(1));const h=$$('#preview h1,#preview h2,#preview h3').find(el=>el.id===label||el.textContent.toLowerCase().replace(/\s+/g,'-')===label);h?.scrollIntoView({behavior:'smooth'});}else if(/^https?:\/\//i.test(url||'')){if(bridge)nativeRequest('external',{url}).catch(e=>toast(e.message));else window.open(url,'_blank','noopener,noreferrer');}}});
$$('[data-format]').forEach(b=>b.addEventListener('mousedown',e=>e.preventDefault()));
$$('[data-side]').forEach(b=>b.onclick=()=>{$$('[data-side]').forEach(x=>x.classList.toggle('selected',x===b));$('#outline').hidden=b.dataset.side!=='outline';$('#recent').hidden=b.dataset.side!=='recent';});
$('#close-help').onclick=()=>$('#help-dialog').close();$('#restore-draft').onclick=()=>action('restore');$('#dismiss-draft').onclick=()=>{action('dismiss-recovery');$('#recovery-banner').hidden=true;};
$('#zoom-in').onclick=()=>{prefs.zoom=Math.min(150,prefs.zoom+10);applyPrefs();};$('#zoom-out').onclick=()=>{prefs.zoom=Math.max(80,prefs.zoom-10);applyPrefs();};
$('#setting-theme').onchange=e=>{prefs.dark=e.target.value==='dark';applyPrefs();};
$('#setting-zoom').oninput=e=>{prefs.zoom=Number(e.target.value);applyPrefs();};
$('#setting-spacing').onchange=e=>{prefs.spacing=Number(e.target.value);applyPrefs();};
$('#close-settings').onclick=$('#done-settings').onclick=()=>$('#settings-dialog').close();
$('#reset-settings').onclick=()=>{prefs={dark:false,zoom:100,spacing:1.9};applyPrefs();};
$$('.shortcut-button').forEach(b=>{for(const event of ['mouseenter','focus'])b.addEventListener(event,()=>b.classList.remove('tooltip-dismissed'));});
const shortcuts=setupShortcuts({document,storage:localStorage,run:id=>['bold','italic'].includes(id)?format(id):action(id),canRun:id=>ready&&(!['bold','italic'].includes(id)||!!document.activeElement?.closest('.ProseMirror,.cm-content'))});
function selectSettingsTab(tab){
 shortcuts.cancel();
 $$('[data-settings-tab]').forEach(b=>{const selected=b===tab;b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;$('#'+b.dataset.settingsTab).hidden=!selected;});
}
$$('[data-settings-tab]').forEach(tab=>{
 tab.onclick=()=>selectSettingsTab(tab);
 tab.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const tabs=$$('[data-settings-tab]'),next=e.key==='Home'?tabs[0]:e.key==='End'?tabs.at(-1):tabs.find(b=>b!==tab);selectSettingsTab(next);next.focus();}};
});
document.addEventListener('keydown',e=>{
 if(e.key==='Escape')$$('.shortcut-button').forEach(b=>b.classList.add('tooltip-dismissed'));
 if(e.key==='Escape'&&!document.querySelector('dialog[open]'))document.body.classList.remove('focus');
},true);
$('#open-input').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>10*1024*1024)throw Error('文件超过 10 MB');await loadDocument({name:file.name,text:await file.text(),path:null,cleanText:undefined});}catch(err){toast(err.message);}e.target.value='';};
$('#image-input').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{textInsert(`![${file.name.replace(/[\[\]]/g,'')}](${await uploadImage(file)})`);}catch(err){toast(err.message);}e.target.value='';};
window.addEventListener('beforeunload',e=>{if(!isNative&&flush()!==diskText){e.preventDefault();e.returnValue='';}});

async function initialize(){
 applyPrefs();if(new URLSearchParams(location.search).has('embedded'))document.body.classList.add('embedded');
 source=new EditorView({state:EditorState.create({doc:mdText,extensions:sourceExtensions()}),parent:$('#source-editor')});
 rich=new Crepe({root:$('#rich-editor'),defaultValue:welcome,featureConfigs:{[Crepe.Feature.Placeholder]:{text:'从一行文字开始。输入 / 插入内容。'},[Crepe.Feature.ImageBlock]:{onUpload:uploadImage,proxyDomURL:url=>assetURL(url,metadata.assetBase),inlineUploadButton:'选择图片',blockUploadButton:'选择图片',blockUploadPlaceholderText:'图片地址，或选择本地图片',blockCaptionPlaceholderText:'添加图片说明'},[Crepe.Feature.Latex]:{katexOptions:{trust:false,throwOnError:false}}}});
 rich.on(listener=>listener.markdownUpdated(()=>{if(!syncing&&ready&&mode==='write')flush();}));
 await rich.create();richReference=richDoc();richSnapshot=rich.getMarkdown();const pm=$('#rich-editor .ProseMirror');pm.setAttribute('aria-label','Markdown 正文编辑区');pm.setAttribute('role','textbox');pm.setAttribute('aria-multiline','true');
 ready=true;
 if(bridge){const data=await nativeRequest('ready');await loadDocument(data.document);recovery=data.recovery;$('#connection').textContent='本地文件已连接';}
 else {try{recovery=JSON.parse(localStorage.getItem('field-notes-draft')||'null');}catch{}paint();$('#connection').textContent='浏览器模式 · 保存副本';}
 if(recovery&&recovery.text!==mdText)$('#recovery-banner').hidden=false;
 $('#loading').hidden=true;paint();
}
window.FieldMarkdown={flush,getMarkdown:()=>flush(),setDocument:async data=>{await window.FieldMarkdown.ready;if(flush()!==diskText&&!confirm('替换当前未保存的文档？'))return false;await loadDocument(data);return true;},setMode,setTheme:dark=>{prefs.dark=!!dark;applyPrefs();},onChange:fn=>{subscribers.add(fn);return()=>subscribers.delete(fn);},focus:()=>mode==='write'?rich?.editor.action(ctx=>ctx.get(editorViewCtx).focus()):source?.focus()};
window.FieldMarkdown.ready=initialize().catch(error=>{$('#loading').textContent='加载失败：'+error.message;console.error(error);throw error;});
