using System;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace FieldNotes
{
    sealed partial class StudioForm
    {
        bool exportingPdf;

        async Task<object> ExportPdfAsync(string html, PdfOptions options)
        {
            if (exportingPdf)
                throw new IOException("PDF 正在导出，请稍候。");
            if (html == null || html.Length > DocumentSession.MaxBytes * 2)
                throw new IOException("无法导出此文档。");
            exportingPdf = true;
            try
            {
                using (
                    var dialog = new SaveFileDialog
                    {
                        Filter = "PDF 文档|*.pdf",
                        FileName = Path.GetFileNameWithoutExtension(doc.Name) + ".pdf",
                        DefaultExt = "pdf",
                        AddExtension = true,
                        OverwritePrompt = true,
                        Title = "导出 PDF",
                    }
                )
                {
                    if (dialog.ShowDialog(this) != DialogResult.OK)
                        return null;
                    if (
                        !String.Equals(
                            Path.GetExtension(dialog.FileName),
                            ".pdf",
                            StringComparison.OrdinalIgnoreCase
                        )
                    )
                        throw new IOException("导出文件扩展名必须为 .pdf。");
                    html = EmbedLocalImages(html, true);
                    Send(new { type = "notice", message = "正在生成 PDF，请稍候…" });
                    byte[] bytes = await PdfExporter.RenderAsync(
                        this,
                        web.CoreWebView2.Environment,
                        html,
                        Program.Data,
                        options
                    );
                    // Preserve an existing PDF until rendering succeeds, then replace it atomically.
                    DocumentSession.AtomicWrite(dialog.FileName, bytes, BackupPath);
                    return new { path = dialog.FileName };
                }
            }
            finally
            {
                exportingPdf = false;
            }
        }
    }
}
