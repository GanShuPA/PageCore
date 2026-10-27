using System;
using System.IO;
using System.Windows.Forms;

namespace FieldNotes
{
    sealed partial class StudioForm
    {
        object PrepareWord(string html)
        {
            if (html == null || html.Length > DocumentSession.MaxBytes * 2)
                throw new IOException("文档过大，无法导出 Word。");
            html = EmbedLocalImages(html, true);
            if (html.Length > DocumentSession.MaxBytes * 2)
                throw new IOException("文档图片过大，请缩小图片后导出 Word。");
            return new { html = html };
        }

        object ExportWord(string base64)
        {
            if (String.IsNullOrEmpty(base64) || base64.Length > DocumentSession.MaxBytes * 2)
                throw new IOException("Word 文档过大，请减少图片大小后重试。");
            byte[] bytes;
            try
            {
                bytes = Convert.FromBase64String(base64);
            }
            catch (FormatException)
            {
                throw new IOException("Word 文档数据无效。");
            }
            if (
                bytes.Length < 4
                || bytes[0] != 0x50
                || bytes[1] != 0x4b
                || bytes[2] != 3
                || bytes[3] != 4
            )
                throw new IOException("Word 文档生成失败。");
            using (
                var dialog = new SaveFileDialog
                {
                    Filter = "Word 文档|*.docx",
                    FileName = Path.GetFileNameWithoutExtension(doc.Name) + ".docx",
                    DefaultExt = "docx",
                    AddExtension = true,
                    OverwritePrompt = true,
                    Title = "导出 Word",
                }
            )
            {
                if (dialog.ShowDialog(this) != DialogResult.OK)
                    return null;
                if (
                    !String.Equals(
                        Path.GetExtension(dialog.FileName),
                        ".docx",
                        StringComparison.OrdinalIgnoreCase
                    )
                )
                    throw new IOException("导出文件扩展名必须为 .docx。");
                DocumentSession.AtomicWrite(dialog.FileName, bytes, BackupPath);
                return new { path = dialog.FileName };
            }
        }
    }
}
