using System;
using System.Collections.Generic;
using System.IO;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;

namespace FieldNotes
{
    sealed partial class StudioForm
    {
        void OnWebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            if (!OwnDocument(e.Source))
                return;
            Dictionary<string, object> m = null;
            string id = null;
            try
            {
                m = json.Deserialize<Dictionary<string, object>>(e.WebMessageAsJson);
                id = Get(m, "id");
                var command = Get(m, "command");
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
                if (command == "changed")
                {
                    Sync(m);
                    return;
                }
                if (command == "ready")
                {
                    ready = true;
                    if (initialPath != null)
                    {
                        try
                        {
                            doc.Open(initialPath);
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
                            pendingRecovery = json.Deserialize<Dictionary<string, object>>(
                                recovered
                            );
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
                            data = new { document = Payload(), recovery = pendingRecovery },
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
                object result = null;
                switch (command)
                {
                    case "save":
                        if (Save(false))
                            result = Payload();
                        break;
                    case "save-as":
                        if (Save(true))
                            result = Payload();
                        break;
                    case "new":
                        if (ConfirmChanges())
                        {
                            doc.New("", "未命名.md");
                            result = ChangedDocument();
                        }
                        break;
                    case "open":
                        if (ConfirmChanges())
                        {
                            using (
                                var dialog = new OpenFileDialog
                                {
                                    Filter = "Markdown 文件|*.md;*.markdown;*.txt|所有文件|*.*",
                                    Title = "打开 Markdown 文档",
                                }
                            )
                            {
                                if (dialog.ShowDialog(this) == DialogResult.OK)
                                {
                                    doc.Open(dialog.FileName);
                                    result = ChangedDocument();
                                }
                            }
                        }
                        break;
                    case "recent":
                        var p = Get(m, "path");
                        if (!recent.Contains(p))
                            throw new IOException("此文件不在最近记录中。");
                        if (ConfirmChanges())
                        {
                            doc.Open(p);
                            result = ChangedDocument();
                        }
                        break;
                    case "restore":
                        if (pendingRecovery == null)
                            throw new IOException("没有可恢复的草稿。");
                        if (ConfirmChanges())
                        {
                            var draft = pendingRecovery;
                            doc.New(
                                Get(draft, "text") ?? "",
                                Path.GetFileName(Get(draft, "name") ?? "恢复草稿.md"),
                                true
                            );
                            pendingRecovery = null;
                            ConfigureAssets();
                            UpdateTitle();
                            PersistDraft();
                            result = Payload();
                        }
                        break;
                    case "dismiss-recovery":
                        pendingRecovery = null;
                        PersistDraft();
                        break;
                    case "export":
                        result = Export(Get(m, "html"));
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
