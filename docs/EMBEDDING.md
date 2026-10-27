# 将 页核 · PAGECORE 内嵌到工业桌面

界面与文件访问已分离：复用 dist 前端，在桌面宿主内接入 native 文件会话即可。当前发布版保持独立运行。

## 页面与公开 API

入口 `dist/index.html?embedded=1`，不依赖网络服务。需要同源资源加载；Windows 推荐继续采用 WebView2 虚拟域名映射，勿将用户文档目录映射为可执行脚本来源。

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

请求：`{ id: string, command: string, text: string, ...payload }`。
回复：`{ id, ok: true, data }` 或 `{ id, ok: false, error }`。
即时变更：`{ command: 'changed', text }`，无回复。
通知：`{ type: 'notice', message }`。

| command          | 附加字段                              | 返回 data                     |
| ---------------- | ------------------------------------- | ----------------------------- |
| ready            | 无                                    | `{document, recovery}`        |
| new / open       | 无                                    | 文档对象；取消返回 null       |
| recent           | path（仅可选最近列表内的记录）        | 文档对象或 null               |
| save / save-as   | 无                                    | 文档对象或 null               |
| restore          | 无                                    | 恢复为副本后的文档对象或 null |
| dismiss-recovery | 无                                    | null                          |
| export           | html                                  | `{path}` 或 null              |
| export-pdf       | html（已净化的打印排版页面）、options | `{path}` 或 null              |
| prepare-word     | html（已净化的正文）                  | `{html}`（本地图片已内嵌）    |
| export-word      | base64（DOCX 文件）                   | `{path}` 或 null              |
| external         | url（http/https）                     | null                          |

文档对象包含 `name, path, text, cleanText, encoding, eol, dirty, assetBase, recent`。保存后更新 cleanText，取消或失败时不得将文档标为已保存。

`export-pdf` 由桌面宿主选择保存位置，等待图片和字体加载后生成 PDF；取消返回 null，失败返回错误，成功也不改变 Markdown 的保存状态。`options` 包含 `paper`（A4/A5/Letter）、`orientation`（portrait/landscape）、`marginTop/Bottom/Left/Right`（mm）、`font`（sans/serif/mono）、`fontSize`（pt）、`lineHeight`、`header`、`footer` 和 `pageNumbers`。省略 options 兼容原 A4 默认值。前端使用相同选项生成打印 CSS，宿主校验尺寸并同步设置打印参数。参考 `PdfOptions.cs`、`StudioForm.Pdf.cs` 和 `PdfExporter.cs`。

Word 导出先调用 `prepare-word` 在既有图片目录边界内内嵌本地图片，然后前端生成 DOCX，再通过 `export-word` 选择位置并原子保存。取消和失败不改变 Markdown 保存状态。其他嵌入宿主需实现以上命令。

其他容器可在 app.js 执行前注入 `window.fieldHost = { request(command, payload): Promise<data> }`。该适配器优先于 WebView2 桥接；用 `FieldMarkdown.onChange` 订阅变更。尚未提供跨源 iframe postMessage 协议。

## 迁移到现有桌面时

独立宿主另外支持 `window:drag`、`window:resize`（edge 为 n/s/e/w/ne/nw/se/sw）、`window:minimize`、`window:maximize`、`window:close`，均为无需回复的窗口操作；宿主通过 `{type:'window-state', maximized:boolean}` 通知窗口状态。嵌入模式隐藏这些独立窗口按钮，由桌面外层管理窗口。

1. 新增编辑器窗口，加载 dist 入口；不需要改写编辑器核心。
2. 每个编辑器窗口绑定自己的 DocumentSession；宿主负责系统文件对话框、最近记录、草稿、保存与关闭确认。
3. 保留原子写入和外部修改检查。StudioForm 是完整参考实现。
4. 仅为当前文档目录内的图片提供读取；禁止借图片路径读取目录外文件。
5. 桌面切换主题时调用 setTheme。关闭编辑器窗口前调用 flush，再执行未保存检查。

当前独立应用只支持一个活动文档。多标签需要分别维护文本、路径、撤销栈和保存状态，不能共享一个 DocumentSession。
