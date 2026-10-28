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
                string target = ChoosePath(
                    "导出 PDF",
                    FilePickerMode.Save,
                    Path.GetFileNameWithoutExtension(doc.Name) + ".pdf",
                    new[] { ".pdf" }
                );
                if (target == null)
                    return null;
                if (
                    !String.Equals(
                        Path.GetExtension(target),
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
                DocumentSession.AtomicWrite(target, bytes, BackupPath);
                return new { path = target };
            }
            finally
            {
                exportingPdf = false;
            }
        }
    }
}
