# 将 页核 · PAGECORE 内嵌到工业桌面

界面与文件访问已分离：复用 dist 前端，在桌面宿主内接入 native 文件会话即可。当前发布版保持独立运行。

## 页面与公开 API

构建入口位于 `src/index.html`，内嵌时加载生成的 `dist/index.html?embedded=1`，不依赖网络服务。需要同源资源加载；Windows 推荐继续采用 WebView2 虚拟域名映射，勿将用户文档目录映射为可执行脚本来源。

页面暴露 `window.FieldMarkdown`：

```js
await window.FieldMarkdown.ready;
window.FieldMarkdown.getMarkdown(); // 刷新编辑器并返回最新文本
window.FieldMarkdown.flush(); // 同上；保存或关闭前务必调用
await window.FieldMarkdown.setDocument({
  name: '笔记.md',
  text: '# 新文档\n',
  cleanText: '# 新文档\n',
  path: null,
  encoding: 'UTF-8',
  eol: 'LF',
  assetBase: '',
  recent: [],
}); // 有未保存内容时先确认；返回 false 表示取消
await window.FieldMarkdown.setMode('write'); // write / source / split / read
window.FieldMarkdown.setTheme(true); // 深色
const unsubscribe = window.FieldMarkdown.onChange((markdown) => {});
window.FieldMarkdown.focus();
```

## 文件桥接

默认使用 `window.chrome.webview`。宿主需要在页面脚本运行前注册消息监听，并限制消息来源为自身文档入口。

请求：`{ id: string, command: string, tabId: string, text: string, ...payload }`。`tabId` 是当前标签的稳定标识，首次 ready 请求可省略。
回复：`{ id, ok: true, data }` 或 `{ id, ok: false, error }`。
即时变更：`{ command: 'changed', tabId, text }`，无回复；按 tabId 更新对应会话，不依赖消息到达时的活动标签。
通知：`{ type: 'notice', message }`。

| command          | 附加字段                               | 返回 data                                 |
| ---------------- | -------------------------------------- | ----------------------------------------- |
| ready            | 无                                     | `{document, recovery}`                    |
| new / open       | 无                                     | 文档对象；取消返回 null                   |
| recent           | path（仅可选最近列表内的记录）         | 文档对象或 null                           |
| select-tab       | targetId（目标标签标识）               | 选中后的文档对象                          |
| close-tab        | 无（关闭当前标签，宿主负责未保存确认） | 邻近或新建空白标签的文档对象；取消为 null |
| save / save-as   | 无                                     | 文档对象或 null                           |
| restore          | 无                                     | `{documents: 文档对象数组}`               |
| dismiss-recovery | 无                                     | null                                      |
| export           | html                                   | `{path}` 或 null                          |
| export-pdf       | html（已净化的打印排版页面）、options  | `{path}` 或 null                          |
| prepare-word     | html（已净化的正文）                   | `{html}`（本地图片已内嵌）                |
| export-word      | base64（DOCX 文件）                    | `{path}` 或 null                          |
| external         | url（http/https）                      | null                                      |

文档对象包含 `id, name, path, text, cleanText, encoding, eol, dirty, assetBase, recent`。id 在标签生命周期内保持不变；重复打开同一路径必须返回已有 id。保存后更新 cleanText，取消或失败时不得将文档标为已保存。new/open 不替换旧会话。多标签宿主需实现 select-tab 和 close-tab。

桌面 WebView2 宿主支持 `import-image`：接收 `{tabId, mime, base64}`，将经过校验的 PNG、JPEG、GIF 或 WebP 写入对应文档旁的资源目录，并返回 `{path}` 相对路径；文档未保存时前端先请求 `save`。导入不修改文档保存状态，插入引用后文档变为未保存。其他嵌入宿主和普通浏览器目前沿用内嵌 data URL，不调用该命令。

桌面宿主的 `choose-images` 显示页核风格的图片选择器，返回文件名、类型和一次性令牌；前端通过 `read-chosen-image` 逐个读取用户选中的文件。普通浏览器和其他嵌入宿主继续使用各自的文件选择能力。

`export-pdf` 由桌面宿主选择保存位置，等待图片和字体加载后生成 PDF；取消返回 null，失败返回错误，成功也不改变 Markdown 的保存状态。`options` 包含 `paper`（A4/A5/Letter）、`orientation`（portrait/landscape）、`marginTop/Bottom/Left/Right`（mm）、`font`（sans/serif/mono）、`fontSize`（pt）、`lineHeight`、`header`、`footer` 和 `pageNumbers`。省略 options 兼容原 A4 默认值。前端使用相同选项生成打印 CSS，宿主校验尺寸并同步设置打印参数。参考 `PdfOptions.cs`、`StudioForm.Pdf.cs` 和 `PdfExporter.cs`。

Word 导出先调用 `prepare-word` 在既有图片目录边界内内嵌本地图片，然后前端生成 DOCX，再通过 `export-word` 选择位置并原子保存。取消和失败不改变 Markdown 保存状态。其他嵌入宿主需实现以上命令。

其他容器可在 app.js 执行前注入 `window.fieldHost = { request(command, payload): Promise<data> }`。该适配器优先于 WebView2 桥接；用 `FieldMarkdown.onChange` 订阅变更。尚未提供跨源 iframe postMessage 协议。

## 文件夹工作区命令

`ready` 可附带 `folder: {root, name}`，恢复工作区侧栏；不使用文件夹工作区的宿主可以省略该字段。以下 `path` 均相对于用户选择的工作区根目录，使用 `/` 分隔。

| 命令                    | 附加参数               | 返回                                                     |
| ----------------------- | ---------------------- | -------------------------------------------------------- |
| workspace:choose        | 无，宿主显示目录选择器 | `{root, name}`，取消返回 null                            |
| workspace:list          | path，根目录为空字符串 | `{entries: [{name, path, directory}]}`                   |
| workspace:file          | path                   | `{document}`，必须复用已打开的文档 id                    |
| workspace:create-file   | path（父目录）、name   | `{document}`                                             |
| workspace:create-folder | path（父目录）、name   | `{created: true}`                                        |
| workspace:rename        | path（文档）、name     | `{renamed: true, documents: [{id, name, path}], recent}` |
| workspace:close         | 无                     | `{closed: true}`，不关闭标签页                           |

宿主负责限制工作区路径、校验名称和禁止覆盖，枚举时跳过符号链接、目录联接及隐藏项。重命名结果中的 documents 仅更新元数据，不替换正文、撤销栈或 cleanText。工作区选择独立于标签生命周期；路径记入 `.runtime/workspace.json`，该文件不随发布包分发。前端忽略已切换工作区的过期目录读取结果。

## 迁移到现有桌面时

独立宿主另外支持 `window:drag`、`window:resize`（edge 为 n/s/e/w/ne/nw/se/sw）、`window:minimize`、`window:maximize`、`window:close`，均为无需回复的窗口操作；宿主通过 `{type:'window-state', maximized:boolean}` 通知窗口状态。嵌入模式隐藏这些独立窗口按钮，由桌面外层管理窗口。

1. 新增编辑器窗口，加载 dist 入口；不需要改写编辑器核心。
2. 每个标签绑定自己的 DocumentSession；DocumentWorkspace 管理标签身份和活动会话，宿主负责系统文件对话框、最近记录、草稿、保存与关闭确认。
3. 保留原子写入和外部修改检查。StudioForm 是完整参考实现。
4. 图片 URL 包含标签 id，按该标签的文档目录读取；禁止借图片路径读取目录外文件。
5. 桌面切换主题时调用 setTheme。关闭整个窗口前调用 `FieldMarkdown.flushAll()`，获取 `[{tabId, text}]` 并逐一执行未保存检查；保存成功后可调用 `FieldMarkdown.markSaved(document)` 同步相应标签的保存状态。

页核支持多标签。前端为各标签保留 CodeMirror 与 ProseMirror 的完整编辑状态（包括撤销栈），切换时恢复选区、滚动位置和视图。`setDocument` 仍替换当前标签，`getMarkdown`、`flush`、`onChange` 仍作用于当前标签；文档生命周期由宿主命令管理。

### 可选会话与搜索接口

宿主的 `ready` 可额外返回 `documents` 数组、`activeId` 和 `sessionSupported: true`。每个文档可携带 `view`，含 `mode`、`anchor`、`head`、`sourceTop`、`writeTop`、`previewTop`；启用后前端发送 `session-state`（`views: [{ tabId, view }]`）。旧宿主仍可仅返回 `document`。`FieldMarkdown.flushAll()` 保持原有正文快照格式，传入 `true` 可额外包含视图状态。

工作区搜索通过 `workspace:search`（`query`、`matchCase`）和 `workspace:search-cancel` 实现。结果包含 `hits`、`scanned`、`skipped`、`limited`；每个命中包含相对 `path`、从 1 开始的 `line`、从 0 开始的 UTF-16 `column`、`length`、`match`、`preview`、`previewColumn`、`unsaved`。文件访问仍由宿主验证，前端不获得任意路径的读写权限。
