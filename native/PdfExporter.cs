using System;
using System.Drawing;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace FieldNotes
{
    static class PdfExporter
    {
        public static async Task<byte[]> RenderAsync(
            Control owner,
            CoreWebView2Environment environment,
            string html,
            string runtimeDirectory,
            PdfOptions options
        )
        {
            // A file avoids NavigateToString's 2 MB limit for embedded images.
            string folder = Path.Combine(runtimeDirectory, "pdf-" + Guid.NewGuid().ToString("N"));
            string file = Path.Combine(folder, "document.html");
            Directory.CreateDirectory(folder);
            try
            {
                int major;
                if (
                    options.HasRunningText
                    && (
                        !Int32.TryParse(environment.BrowserVersionString.Split('.')[0], out major)
                        || major < 131
                    )
                )
                    throw new IOException(
                        "页眉、页脚和页码需要 WebView2 131 或更新版本，请更新运行时后重试。"
                    );
                File.WriteAllText(file, html, new UTF8Encoding(false));
                using (var renderer = new WebView2())
                {
                    renderer.Size = new Size(794, 1123);
                    renderer.Location = new Point(-10000, -10000);
                    renderer.TabStop = false;
                    owner.Controls.Add(renderer);
                    try
                    {
                        await WithTimeout(renderer.EnsureCoreWebView2Async(environment), 30000);
                        var core = renderer.CoreWebView2;
                        core.Settings.AreDevToolsEnabled = false;
                        core.Settings.AreDefaultContextMenusEnabled = false;
                        core.Settings.AreDefaultScriptDialogsEnabled = false;
                        core.PermissionRequested += (sender, args) =>
                            args.State = CoreWebView2PermissionState.Deny;
                        core.DownloadStarting += (sender, args) => args.Cancel = true;
                        core.NewWindowRequested += (sender, args) => args.Handled = true;
                        core.FrameNavigationStarting += (sender, args) => args.Cancel = true;
                        core.SetVirtualHostNameToFolderMapping(
                            "pdf.field.local",
                            folder,
                            CoreWebView2HostResourceAccessKind.DenyCors
                        );
                        const string documentUrl = "https://pdf.field.local/document.html";
                        core.NavigationStarting += (sender, args) =>
                        {
                            if (args.Uri != documentUrl)
                                args.Cancel = true;
                        };

                        var loaded = new TaskCompletionSource<bool>();
                        core.NavigationCompleted += (sender, args) =>
                        {
                            if (args.IsSuccess)
                                loaded.TrySetResult(true);
                            else
                                loaded.TrySetException(
                                    new IOException("PDF 排版页面加载失败：" + args.WebErrorStatus)
                                );
                        };
                        core.Navigate(documentUrl);
                        await WithTimeout(loaded.Task, 30000);

                        var prepared = new TaskCompletionSource<bool>();
                        core.WebMessageReceived += (sender, args) =>
                        {
                            if (args.Source != documentUrl)
                                return;
                            string message = args.TryGetWebMessageAsString();
                            if (message == "pdf-ready")
                                prepared.TrySetResult(true);
                            else if (message == "pdf-image-error")
                                prepared.TrySetException(
                                    new IOException(
                                        "部分图片未能加载，请检查图片路径或网络后重试。"
                                    )
                                );
                        };
                        await core.ExecuteScriptAsync(
                            @"
                            Promise.all([
                                document.fonts.ready,
                                ...Array.from(document.images, image => {
                                    image.loading = 'eager';
                                    if (image.complete) return image.naturalWidth ? Promise.resolve() : Promise.reject();
                                    return new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
                                })
                            ]).then(() => chrome.webview.postMessage('pdf-ready'),
                                () => chrome.webview.postMessage('pdf-image-error'));
                        "
                        );
                        await WithTimeout(prepared.Task, 30000);

                        var settings = environment.CreatePrintSettings();
                        options.Apply(settings);
                        settings.ShouldPrintBackgrounds = true;
                        settings.ShouldPrintHeaderAndFooter = false;
                        settings.ScaleFactor = 1;
                        using (var stream = await core.PrintToPdfStreamAsync(settings))
                        using (var output = new MemoryStream())
                        {
                            await stream.CopyToAsync(output);
                            byte[] bytes = output.ToArray();
                            if (
                                bytes.Length < 5
                                || Encoding.ASCII.GetString(bytes, 0, 5) != "%PDF-"
                            )
                                throw new IOException("PDF 生成失败，请重试。");
                            return bytes;
                        }
                    }
                    finally
                    {
                        owner.Controls.Remove(renderer);
                    }
                }
            }
            finally
            {
                // Delete only this export's known temporary file and empty directory.
                try
                {
                    File.Delete(file);
                    Directory.Delete(folder);
                }
                catch (IOException) { }
                catch (UnauthorizedAccessException) { }
            }
        }

        static async Task WithTimeout(Task task, int milliseconds)
        {
            if (await Task.WhenAny(task, Task.Delay(milliseconds)) != task)
                throw new IOException("PDF 生成等待超时，请检查图片资源后重试。");
            await task;
        }
    }
}
