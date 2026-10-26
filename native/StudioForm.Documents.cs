using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Windows.Forms;

namespace FieldNotes
{
    sealed partial class StudioForm
    {
        object ChangedDocument()
        {
            ConfigureAssets();
            Remember();
            UpdateTitle();
            PersistDraft();
            return Payload();
        }

        bool ConfirmChanges()
        {
            if (!doc.Dirty)
                return true;
            var choice = MessageBox.Show(
                this,
                "“" + doc.Name + "”有未保存的更改。是否先保存？\n选择“否”将放弃这些更改。",
                "保存更改",
                MessageBoxButtons.YesNoCancel,
                MessageBoxIcon.Question
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
                using (
                    var dialog = new SaveFileDialog
                    {
                        Filter = "Markdown 文档|*.md|Markdown 文档|*.markdown|文本文件|*.txt",
                        FileName = doc.Name,
                        DefaultExt = "md",
                        AddExtension = true,
                        OverwritePrompt = true,
                        Title = "保存 Markdown 文档",
                    }
                )
                {
                    if (dialog.ShowDialog(this) != DialogResult.OK)
                        return false;
                    target = dialog.FileName;
                }
            }
            bool conflict =
                String.Equals(target, doc.PathName, StringComparison.OrdinalIgnoreCase)
                && doc.HasExternalChanges();
            if (
                conflict
                && MessageBox.Show(
                    this,
                    "磁盘上的文件已被其他程序修改或删除。是否用当前编辑内容覆盖？\n选择“否”可以返回编辑器，再另存为新文件。",
                    "检测到外部修改",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Warning
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
            using (
                var dialog = new SaveFileDialog
                {
                    Filter = "HTML 文档|*.html",
                    FileName = Path.GetFileNameWithoutExtension(doc.Name) + ".html",
                    DefaultExt = "html",
                    AddExtension = true,
                    OverwritePrompt = true,
                    Title = "导出 HTML",
                }
            )
            {
                if (dialog.ShowDialog(this) != DialogResult.OK)
                    return null;
                if (
                    !String.Equals(
                        Path.GetExtension(dialog.FileName),
                        ".html",
                        StringComparison.OrdinalIgnoreCase
                    )
                )
                    throw new IOException("导出文件扩展名必须为 .html。");
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
                                var path = Path.GetFullPath(
                                    Path.Combine(
                                        assetFolder,
                                        Uri.UnescapeDataString(u.AbsolutePath)
                                            .TrimStart('/')
                                            .Replace('/', Path.DirectorySeparatorChar)
                                    )
                                );
                                if (
                                    !path.StartsWith(
                                        assetFolder.TrimEnd('\\') + "\\",
                                        StringComparison.OrdinalIgnoreCase
                                    )
                                )
                                    return "";
                                var ext = Path.GetExtension(path).ToLowerInvariant();
                                var mime =
                                    ext == ".png" ? "image/png"
                                    : ext == ".jpg" || ext == ".jpeg" ? "image/jpeg"
                                    : ext == ".gif" ? "image/gif"
                                    : ext == ".webp" ? "image/webp"
                                    : null;
                                if (mime == null || new FileInfo(path).Length > 20 * 1024 * 1024)
                                    return "";
                                return "data:"
                                    + mime
                                    + ";base64,"
                                    + Convert.ToBase64String(File.ReadAllBytes(path));
                            }
                            catch
                            {
                                return "";
                            }
                        }
                    );
                DocumentSession.AtomicWrite(
                    dialog.FileName,
                    new UTF8Encoding(false).GetBytes(html),
                    BackupPath
                );
                return new { path = dialog.FileName };
            }
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
            if (allowClose || !ready)
                return;
            e.Cancel = true;
            if (closing)
                return;
            closing = true;
            try
            {
                string raw = await web.CoreWebView2.ExecuteScriptAsync(
                    "window.FieldMarkdown.flush()"
                );
                string text = json.Deserialize<string>(raw);
                if (text != null)
                    doc.Update(text);
                if (!ConfirmChanges())
                    return;
                draftTimer.Stop();
                if (File.Exists(DraftPath))
                    File.Delete(DraftPath);
                allowClose = true;
                BeginInvoke(new Action(Close));
            }
            catch (Exception ex)
            {
                PersistDraft();
                MessageBox.Show(
                    this,
                    "关闭前检查失败，已保留当前窗口：" + ex.Message,
                    "页核 · PAGECORE"
                );
            }
            finally
            {
                closing = false;
            }
        }
    }
}
