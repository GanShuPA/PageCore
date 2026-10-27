# 开发规范与结构

## 模块边界

| 模块                                                | 职责                                                                          |
| --------------------------------------------------- | ----------------------------------------------------------------------------- |
| `src/app.js`                                        | 应用初始化、活动文档状态、编辑模式切换及命令编排                              |
| `src/host-bridge.js`                                | WebView2 / 嵌入宿主请求、应答和通知                                           |
| `src/source-editor.js`                              | CodeMirror 扩展及中文界面配置                                                 |
| `src/render.js`                                     | Markdown 渲染、内容过滤、大纲、统计和 HTML 导出                               |
| `src/preferences.js`、`src/settings.js`             | 偏好验证、外观控制和设置页签                                                  |
| `src/shortcuts.js`                                  | 快捷键验证、记录、持久化和分发                                                |
| `src/dom.js`、`src/icons.js`、`src/window-frame.js` | DOM 查询、图标和原生窗口控件                                                  |
| `native/Program.cs`、`native/AssemblyInfo.cs`       | 进程入口与版本元数据                                                          |
| `native/StudioForm*.cs`                             | 窗体生命周期、WebView2、桥接消息及文件操作界面；通过 partial 共享单个窗体实例 |
| `native/DocumentSession.cs`                         | 编码、换行、修改状态、外部冲突和原子保存                                      |
| `native/BorderlessForm.cs`                          | Windows 无边框移动、缩放和最大化                                              |
| `scripts/`                                          | 第三方许可收集、隔离的浏览器测试服务                                          |
| `tests/`、`native/SessionTests.cs`                  | 单元测试、浏览器交互测试与原生文件会话自检                                    |

前端不直接访问磁盘；宿主决定文件对话框、确认及保存结果。渲染模块不得执行文档中的脚本。保存成功后才能更新 cleanText。保留 `FieldMarkdown` 嵌入 API、旧存储键及虚拟域名，避免破坏已有设置和宿主集成。

导出模块：`src/pdf-options.js` 验证 PDF 设置，`src/pdf-settings.js` 管理导出面板，`src/pdf-export.js` 生成打印排版，原生 `PdfOptions.cs` 与 `PdfExporter.cs` 同步打印参数并生成 PDF。`src/word-export.js` 将净化后的正文转换为可编辑 OOXML，通过 docx/math 生成原生公式；`StudioForm.Word.cs` 内嵌本地图片并原子保存 DOCX。PDF 偏好单独存于 `pagecore-pdf-options-v1`，不影响编辑器外观。新增依赖须同步锁文件，并通过构建生成第三方许可清单。

## 格式与命名

- `.editorconfig` 定义编码、缩进、换行。前端使用两空格，C# / PowerShell 使用四空格。
- JavaScript 使用 ES modules、单引号、分号、明确的控制流花括号；每次声明一个变量。函数和变量使用 camelCase，模块按职责命名。
- C# 兼容 .NET Framework 自带的 C# 5 编译器；类型和方法使用 PascalCase。异步 Task 方法以 Async 结尾。成员跨 partial 文件共享，避免复制状态。
- Prettier 和 CSharpier 版本固定；不要手动维护另一套排版。PowerShell 使用固定版本 PSScriptAnalyzer。
- 构建代码不能静默吞掉非预期错误。可恢复的偏好读取允许回退默认值；文件保存失败应保持未保存状态并报告用户。
- 第三方 DLL、自动生成的产物、用户示例 Markdown 不作批量格式化。

## 本地检查

前端和宿主构建要求见 README。C# 格式检查另需 .NET SDK 8 或更新版本；它只用于开发，不改变应用运行要求。浏览器交互测试使用本机 Microsoft Edge 的独立无头实例，不使用个人浏览器配置。

```powershell
pnpm install --frozen-lockfile
pnpm format
pnpm check
dotnet tool restore
dotnet csharpier format native
dotnet csharpier check native
Install-Module PSScriptAnalyzer -RequiredVersion 1.24.0 -Scope CurrentUser
./check-powershell.ps1
pnpm build
pnpm test:browser
./build-native.ps1
./package-release.ps1
./verify-release.ps1
```

PowerShell 修改后可用 `Invoke-Formatter -Settings ./PSScriptAnalyzerSettings.psd1` 格式化；保存为 UTF-8 BOM 和 CRLF，保持 Windows PowerShell 5.1 对中文的兼容。

`pnpm check` 包含前端格式、ESLint 及 Node 测试；C# / PowerShell 与浏览器测试分别运行，CI 全部执行。原生编译将警告视为错误。打包验证从独立目录解压并运行原生自检，检查多种编码往返、CRLF、外部修改检测、保存及文件扩展名限制。

## 发布

同步修改 `package.json`、`native/AssemblyInfo.cs`、`native/app.manifest`、README、CHANGELOG，并新增 `docs/RELEASE-v版本.md`。版本一致性测试会检查这些发布文件中的关键版本引用。

全部检查通过后提交并推送 `main`，再创建匹配版本的 `v*` 标签。GitHub Actions 重新检查、构建、打包、校验，并发布预发布 Release 和 SHA-256 校验文件。历史版本保持可下载。
