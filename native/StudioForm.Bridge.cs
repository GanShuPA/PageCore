using System;
using System.Collections.Generic;
using System.IO;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;

namespace FieldNotes
{
    sealed partial class StudioForm
    {
        async void OnWebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            if (!OwnDocument(e.Source))
                return;
            Dictionary<string, object> m = null;
            string id = null;
            try
            {
                m = json.Deserialize<Dictionary<string, object>>(e.WebMessageAsJson);
                object darkValue;
                if (m.TryGetValue("dark", out darkValue) && darkValue is bool)
                    darkTheme = (bool)darkValue;
                id = Get(m, "id");
                var command = Get(m, "command");
                if (command == "window:theme")
                    return;
                if (command == "window:drag")
                {
                    StartWindowInteraction(null);
                    return;
                }
                if (command == "window:resize")
                {
                    StartWindowInteraction(Get(m, "edge"));
                    return;
                }
                if (command == "window:minimize")
                {
                    WindowState = FormWindowState.Minimized;
                    return;
                }
                if (command == "window:maximize")
                {
                    ToggleWindowMaximize();
                    SendWindowState();
                    return;
                }
                if (command == "window:close")
                {
                    Close();
                    return;
                }
                if (command == "session-state")
                {
                    object entries;
                    if (
                        sessionReady
                        && m.TryGetValue("views", out entries)
                        && entries is System.Collections.IEnumerable
                    )
                        foreach (var entry in (System.Collections.IEnumerable)entries)
                            if (entry is Dictionary<string, object>)
                                SyncView((Dictionary<string, object>)entry);
                    PersistSession();
                    return;
                }
                if (command == "changed")
                {
                    Sync(m);
                    return;
                }
                if (closing)
                    throw new IOException("正在检查未保存的文档，请稍候。");
                if (command == "ready")
                {
                    ready = true;
                    RestoreFolder();
                    try
                    {
                        var warnings = SessionStore.Restore(SessionPath, workspace);
                        if (warnings.Length > 0)
                            Send(
                                new
                                {
                                    type = "notice",
                                    message = "部分文档未能恢复：" + String.Join("；", warnings),
                                }
                            );
                    }
                    catch (Exception ex)
                    {
                        Send(new { type = "notice", message = "会话恢复失败：" + ex.Message });
                    }
                    sessionReady = true;
                    if (initialPath != null)
                    {
                        try
                        {
                            workspace.Open(initialPath);
                            Remember();
                        }
                        catch (Exception ex)
                        {
                            Send(new { type = "notice", message = ex.Message });
                        }
                    }
                    ConfigureAssets();
                    UpdateTitle();
                    try
                    {
                        if (pendingRecovery == null && File.Exists(DraftPath))
                        {
                            string recovered = File.ReadAllText(DraftPath);
                            pendingRecovery =
                                new System.Web.Script.Serialization.JavaScriptSerializer
                                {
                                    MaxJsonLength = int.MaxValue,
                                }.Deserialize<Dictionary<string, object>>(recovered);
                            Directory.CreateDirectory(BackupPath);
                            File.WriteAllText(
                                Path.Combine(
                                    BackupPath,
                                    "recovery-" + Guid.NewGuid().ToString("N") + ".json"
                                ),
                                recovered
                            );
                        }
                    }
                    catch { }
                    Send(
                        new
                        {
                            id = id,
                            ok = true,
                            data = new
                            {
                                document = Payload(),
                                documents = SessionDocuments(),
                                activeId = workspace.Active.Id,
                                sessionSupported = true,
                                recovery = pendingRecovery,
                                folder = FolderPayload(),
                            },
                        }
                    );
                    SendWindowState();
                    File.WriteAllText(
                        Path.Combine(Program.Data, "ui-ready.txt"),
                        DateTime.UtcNow.ToString("o")
                    );
                    return;
                }
                Sync(m);
                if (command == "workspace:search-cancel")
                {
                    if (searchCancellation != null)
                        searchCancellation.Cancel();
                    Send(
                        new
                        {
                            id = id,
                            ok = true,
                            data = new { cancelled = true },
                        }
                    );
                    return;
                }
                if (command == "workspace:search")
                {
                    var found = await SearchWorkspace(m);
                    Send(
                        new
                        {
                            id = id,
                            ok = true,
                            data = found,
                        }
                    );
                    return;
                }
                if (command != null && command.StartsWith("workspace:", StringComparison.Ordinal))
                {
                    Send(
                        new
                        {
                            id = id,
                            ok = true,
                            data = FolderCommand(command, m),
                        }
                    );
                    return;
                }
                object result = null;
                switch (command)
                {
                    case "choose-images":
                        object multiple;
                        result = ChooseImages(
                            m.TryGetValue("multiple", out multiple)
                                && multiple is bool
                                && (bool)multiple
                        );
                        break;
                    case "read-chosen-image":
                        result = ReadChosenImage(Get(m, "token"));
                        break;
                    case "import-image":
                        string ownerId = Get(m, "tabId");
                        var owner = workspace.Find(ownerId);
                        if (owner == null || owner != workspace.Active)
                            throw new IOException("图片所属的标签页已切换或关闭，请重试。");
                        result = new
                        {
                            path = ImageStore.Save(
                                owner.Document,
                                Get(m, "mime"),
                                Get(m, "base64")
                            ),
                        };
                        break;
                    case "save":
                        if (Save(false))
                            result = Payload();
                        break;
                    case "save-as":
                        if (Save(true))
                            result = Payload();
                        break;
                    case "new":
                        workspace.New();
                        result = ChangedDocument();
                        break;
                    case "open":
                        {
                            string selected = ChoosePath(
                                "打开 Markdown 文档",
                                FilePickerMode.Open,
                                null,
                                new[] { ".md", ".markdown", ".txt" }
                            );
                            if (selected != null)
                            {
                                workspace.Open(selected);
                                result = ChangedDocument();
                            }
                        }
                        break;
                    case "recent":
                        var p = Get(m, "path");
                        if (!recent.Contains(p))
                            throw new IOException("此文件不在最近记录中。");
                        workspace.Open(p);
                        result = ChangedDocument();
                        break;
                    case "select-tab":
                        workspace.Select(Get(m, "targetId"));
                        result = ChangedDocument();
                        break;
                    case "close-tab":
                        if (ConfirmChanges())
                        {
                            workspace.CloseActive();
                            result = ChangedDocument();
                        }
                        break;
                    case "restore":
                        if (pendingRecovery == null)
                            throw new IOException("没有可恢复的草稿。");
                        var restored = new List<object>();
                        RestoreDrafts(pendingRecovery, restored);
                        pendingRecovery = null;
                        ChangedDocument();
                        result = new { documents = restored.ToArray() };
                        break;
                    case "dismiss-recovery":
                        pendingRecovery = null;
                        PersistDraft();
                        break;
                    case "export":
                        result = Export(Get(m, "html"));
                        break;
                    case "export-pdf":
                        object pdfOptions;
                        m.TryGetValue("options", out pdfOptions);
                        result = await ExportPdfAsync(
                            Get(m, "html"),
                            PdfOptions.Parse(pdfOptions as Dictionary<string, object>)
                        );
                        break;
                    case "prepare-word":
                        result = PrepareWord(Get(m, "html"));
                        break;
                    case "export-word":
                        result = ExportWord(Get(m, "base64"));
                        break;
                    case "external":
                        OpenExternal(Get(m, "url"));
                        break;
                    default:
                        throw new IOException("不支持的操作。");
                }
                Send(
                    new
                    {
                        id = id,
                        ok = true,
                        data = result,
                    }
                );
            }
            catch (Exception ex)
            {
                Send(
                    new
                    {
                        id = id,
                        ok = false,
                        error = ex.Message,
                    }
                );
            }
        }
    }
}
