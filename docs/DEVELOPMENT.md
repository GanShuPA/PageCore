# 开发规范与结构

## 模块边界

文件夹工作区由 `src/folder-workspace.js`、`src/workspace.css` 管理侧栏、按需加载与命名对话框；`native/FolderWorkspace.cs` 负责目录边界、枚举、创建和文件重命名，`StudioForm.Folders.cs` 负责系统选择器、工作区路径持久化及标签元数据同步。工作区目录独立于 `DocumentWorkspace` 的标签集合，切换目录不会关闭文档。`FolderWorkspaceTests.cs` 覆盖文件操作和重命名后的未保存状态。

桌面文件选择和确认窗口由 `native/PageFileDialog.cs`、`native/DialogStyle.cs` 实现，主题由前端通过宿主桥同步。新窗口保留扩展名验证、覆盖确认、保存前冲突检查及取消语义；原生自检覆盖路径选择和确认按钮的结果。浏览器模式的确认使用 HTML 对话框。

图片导入在 `src/app.js` 捕获编辑器的粘贴、拖放及选择文件，原生 `ImageStore.cs` 校验格式与大小并在文档旁唯一创建图片文件。导入期间锁定编辑交互；新文档先走现有保存流程，成功后再写图片和插入引用。`ImageStoreTests.cs` 与 `tests/browser/images.spec.mjs` 覆盖磁盘写入、取消、失败及多标签安全。

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
| `scripts/`                                          | 构建、打包、校验、许可收集与隔离的浏览器测试服务                              |
| `.config/`                                          | 代码格式、静态检查、浏览器测试与 PowerShell 配置                              |
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
dotnet csharpier format native --config-path .config/csharpier.json
dotnet csharpier check native --config-path .config/csharpier.json
Install-Module PSScriptAnalyzer -RequiredVersion 1.24.0 -Scope CurrentUser
./scripts/check-powershell.ps1
pnpm build
pnpm test:browser
./scripts/build-native.ps1
./scripts/package-release.ps1
./scripts/verify-release.ps1
```

PowerShell 修改后可用 `Invoke-Formatter -Settings ./.config/PSScriptAnalyzerSettings.psd1` 格式化；保存为 UTF-8 BOM 和 CRLF，保持 Windows PowerShell 5.1 对中文的兼容。

`pnpm check` 包含前端格式、ESLint 及 Node 测试；C# / PowerShell 与浏览器测试分别运行，CI 全部执行。原生编译将警告视为错误。打包验证从独立目录解压并运行原生自检，检查多种编码往返、CRLF、外部修改检测、保存及文件扩展名限制。

## 发布

同步修改 `package.json`、`native/AssemblyInfo.cs`、`native/app.manifest`、README、`docs/CHANGELOG.md`，并新增 `docs/releases/v版本.md`。版本一致性测试会检查这些发布文件中的关键版本引用。

全部检查通过后提交并推送 `main`，再创建匹配版本的 `v*` 标签。GitHub Actions 重新检查、构建、打包、校验，并发布预发布 Release 和 SHA-256 校验文件。历史版本保持可下载。

## 目录与生成文件

根目录保留主启动入口、README、LICENSE、包管理文件，以及需要向下发现的编辑器和忽略规则。HTML 入口在 `src/index.html`，构建和检查脚本在 `scripts/`，工具配置在 `.config/`；通过 package.json 中的命令使用显式配置路径。旧名称的启动脚本位于 `scripts/启动编辑器.cmd`，同样启动根目录下的 bin。

`bin/` 和 `dist/` 是应用运行所需的构建输出。第三方许可统一写入 `dist/licenses/`，安装包和校验文件统一写入 `release/packages/`，打包不再往根目录生成 ZIP 或校验文件。文档中的本地演示材料放在被忽略的 `docs/local/`，打包仅复制明确列出的文档，排除该目录。`.runtime/` 保留应用数据、草稿、备份和测试输出。

所有构建和发布脚本均按自身位置解析项目根目录，可从其他工作目录调用。浏览器测试如遇端口占用，可设置 `$env:PAGECORE_TEST_PORT = "48372"` 后运行 `pnpm test:browser`；测试仍使用独立服务，不复用其他进程。

### 搜索与会话

`WorkspaceSearch.cs` 在后台线程执行有界、可取消的本地文本搜索；`StudioForm.Session.cs` 管理搜索取消与会话桥接。`SessionStore.cs` 原子保存文件身份和视图状态，不保存已放弃的正文；正文恢复继续由 `recovery.json` 负责。`workspace-search.js` 用请求代次隔离过期结果，`session-state.js` 校验从磁盘恢复的编辑器位置。搜索和恢复边界由 `SearchSessionTests.cs` 与 `tests/browser/search-session.spec.mjs` 验证。

## 更新模块

`src/updates.js` 提供关于与更新交互；`native/UpdateService.cs` 从固定 GitHub 仓库检查正式 Release，限制下载体积，验证 SHA-256 与程序集版本。`native/UpdatePackage.cs` 验证压缩包路径和文件范围，仅允许程序资源文件，阻止 .runtime 和路径越界。

`updater/UpdateInstaller.cs` 编译为 `bin/PageCore.Updater.exe`。宿主完成所有文档关闭确认后启动更新助手，助手等待宿主退出，再次校验安装包，逐文件备份与替换，异常时回滚，并重新启动页核。升级缓存和备份不随发行包分发。断电等强制中断无法保证自动回滚，请保留备份并用完整发布包修复。

自动测试覆盖版本过滤、来源地址、完整性、路径穿越、保留用户数据、失败回滚，以及检查/下载/取消/安装界面状态。CI 同时检查 updater 目录的 C# 格式。
