using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Windows.Forms;

namespace FieldNotes
{
    sealed partial class StudioForm
    {
        void RestoreDrafts(Dictionary<string, object> recovery, List<object> restored)
        {
            if (recovery == null)
                return;
            object items;
            if (recovery.TryGetValue("documents", out items) && items is IEnumerable)
            {
                foreach (var item in (IEnumerable)items)
                    RestoreDrafts(item as Dictionary<string, object>, restored);
            }
            else if (Get(recovery, "text") != null)
            {
                workspace.New(
                    Get(recovery, "text"),
                    Path.GetFileName(Get(recovery, "name") ?? "恢复草稿.md"),
                    true
                );
                restored.Add(Payload());
            }
            object pending;
            if (recovery.TryGetValue("pending", out pending))
                RestoreDrafts(pending as Dictionary<string, object>, restored);
        }

        object ChangedDocument()
        {
            ConfigureAssets();
            Remember();
            UpdateTitle();
            PersistDraft();
            PersistSession();
            return Payload();
        }

        bool ConfirmChanges()
        {
            if (!doc.Dirty)
                return true;
            var choice = PagePrompt.Ask(
                this,
                "保存更改",
                "“" + doc.Name + "”有未保存的更改。关闭前保存这些内容吗？",
                "保存",
                "不保存",
                darkTheme
            );
            if (choice == DialogResult.Cancel)
                return false;
            if (choice == DialogResult.Yes)
                return Save(false);
            return true;
        }

        bool Save(bool saveAs)
        {
            string target = doc.PathName;
            if (saveAs || target == null)
            {
                target = ChoosePath(
                    "保存 Markdown 文档",
                    FilePickerMode.Save,
                    doc.Name,
                    new[] { ".md", ".markdown", ".txt" }
                );
                if (target == null)
                    return false;
            }
            bool conflict =
                String.Equals(target, doc.PathName, StringComparison.OrdinalIgnoreCase)
                && doc.HasExternalChanges();
            var existing = workspace.FindPath(target);
            if (existing != null && existing != workspace.Active)
                throw new IOException(
                    "此文件已在另一个标签页中打开。请切换到该标签，或选择其他保存路径。"
                );
            if (
                conflict
                && PagePrompt.Ask(
                    this,
                    "检测到外部修改",
                    "磁盘上的文件已被其他程序修改或删除。继续将用当前内容覆盖；也可以取消后另存为新文件。",
                    "覆盖",
                    null,
                    darkTheme
                ) != DialogResult.Yes
            )
                return false;
            doc.Save(target, BackupPath, conflict);
            ChangedDocument();
            return true;
        }

        object Export(string html)
        {
            if (html == null || html.Length > DocumentSession.MaxBytes * 2)
                throw new IOException("无法导出此文档。");
            string target = ChoosePath(
                "导出 HTML",
                FilePickerMode.Save,
                Path.GetFileNameWithoutExtension(doc.Name) + ".html",
                new[] { ".html" }
            );
            if (target == null)
                return null;
            if (
                !String.Equals(
                    Path.GetExtension(target),
                    ".html",
                    StringComparison.OrdinalIgnoreCase
                )
            )
                throw new IOException("导出文件扩展名必须为 .html。");
            html = EmbedLocalImages(html, false);
            DocumentSession.AtomicWrite(target, new UTF8Encoding(false).GetBytes(html), BackupPath);
            return new { path = target };
        }

        string EmbedLocalImages(string html, bool strict)
        {
            // Embed local raster images so exported documents remain portable.
            if (assetFolder != null)
                html = System.Text.RegularExpressions.Regex.Replace(
                    html,
                    "https://media\\.field\\.local/[^\\\"<> ]+",
                    match =>
                    {
                        try
                        {
                            var u = new Uri(match.Value);
                            string relative;
                            var folder = ResolveAssetFolder(u, out relative);
                            var path = Path.GetFullPath(Path.Combine(folder, relative));
                            if (
                                !path.StartsWith(
                                    folder.TrimEnd('\\') + "\\",
                                    StringComparison.OrdinalIgnoreCase
                                )
                            )
                                throw new IOException("图片位于文档目录之外。");
                            var ext = Path.GetExtension(path).ToLowerInvariant();
                            var mime =
                                ext == ".png" ? "image/png"
                                : ext == ".jpg" || ext == ".jpeg" ? "image/jpeg"
                                : ext == ".gif" ? "image/gif"
                                : ext == ".webp" ? "image/webp"
                                : null;
                            if (mime == null || new FileInfo(path).Length > 20 * 1024 * 1024)
                                throw new IOException("图片格式不受支持或超过 20 MB。");
                            return "data:"
                                + mime
                                + ";base64,"
                                + Convert.ToBase64String(File.ReadAllBytes(path));
                        }
                        catch (Exception error)
                        {
                            if (strict)
                                throw new IOException("本地图片无法导出：" + error.Message, error);
                            return "";
                        }
                    }
                );
            return html;
        }

        void OpenExternal(string url)
        {
            Uri u;
            if (
                Uri.TryCreate(url, UriKind.Absolute, out u)
                && (u.Scheme == "https" || u.Scheme == "http")
            )
                Process.Start(
                    new ProcessStartInfo { FileName = u.AbsoluteUri, UseShellExecute = true }
                );
        }

        async void OnClosing(object sender, FormClosingEventArgs e)
        {
            if (updateCancellation != null)
            {
                e.Cancel = true;
                Send(new { type = "notice", message = "请先取消或等待更新下载完成。" });
                return;
            }
            if (exportingPdf)
            {
                updateInstall = false;
                e.Cancel = true;
                Send(new { type = "notice", message = "PDF 正在导出，请稍候再关闭。" });
                return;
            }
            if (allowClose || !ready)
                return;
            e.Cancel = true;
            if (closing)
                return;
            closing = true;
            var previous = workspace.Active.Id;
            try
            {
                string raw = await web.CoreWebView2.ExecuteScriptAsync(
                    "window.FieldMarkdown.flushAll(true)"
                );
                var snapshots = new System.Web.Script.Serialization.JavaScriptSerializer
                {
                    MaxJsonLength = int.MaxValue,
                }.Deserialize<Dictionary<string, object>[]>(raw);
                foreach (var snapshot in snapshots)
                    Sync(snapshot);
                foreach (var tab in workspace.Tabs.ToArray())
                {
                    workspace.Select(tab.Id);
                    ConfigureAssets();
                    if (!ConfirmChanges())
                        return;
                    await web.CoreWebView2.ExecuteScriptAsync(
                        "window.FieldMarkdown.markSaved(" + json.Serialize(Payload()) + ")"
                    );
                }
                SessionStore.Save(SessionPath, workspace, previous);
                draftTimer.Stop();
                if (pendingRecovery != null)
                    DocumentSession.AtomicWrite(
                        DraftPath,
                        Encoding.UTF8.GetBytes(json.Serialize(new { pending = pendingRecovery })),
                        null
                    );
                else if (File.Exists(DraftPath))
                    File.Delete(DraftPath);
                if (updateInstall)
                    UpdateService.Launch(updateStage);
                allowClose = true;
                BeginInvoke(new Action(Close));
            }
            catch (Exception ex)
            {
                PersistDraft();
                PagePrompt.Ask(
                    this,
                    "关闭前检查失败",
                    "已保留当前窗口：" + ex.Message,
                    "知道了",
                    null,
                    darkTheme
                );
            }
            finally
            {
                workspace.Select(previous);
                ConfigureAssets();
                UpdateTitle();
                updateInstall = false;
                closing = false;
            }
        }
    }
}
