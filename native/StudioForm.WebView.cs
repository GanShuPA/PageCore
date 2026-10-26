using System;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;

namespace FieldNotes
{
    sealed partial class StudioForm
    {
        async Task InitializeWebViewAsync()
        {
            try
            {
                var env = await CoreWebView2Environment.CreateAsync(
                    null,
                    Path.Combine(Program.Data, "WebView2")
                );
                await web.EnsureCoreWebView2Async(env);
                var core = web.CoreWebView2;
                core.Settings.AreDevToolsEnabled = false;
                core.Settings.IsStatusBarEnabled = false;
                core.Settings.AreDefaultContextMenusEnabled = false;
                core.Settings.IsZoomControlEnabled = false;
                core.Settings.IsNonClientRegionSupportEnabled = true;
                core.PermissionRequested += (s, e) => e.State = CoreWebView2PermissionState.Deny;
                core.DownloadStarting += (s, e) => e.Cancel = true;
                core.NavigationStarting += (s, e) =>
                {
                    if (!OwnDocument(e.Uri))
                        e.Cancel = true;
                };
                core.FrameNavigationStarting += (s, e) => e.Cancel = true;
                core.NewWindowRequested += (s, e) =>
                {
                    e.Handled = true;
                    OpenExternal(e.Uri);
                };
                core.SetVirtualHostNameToFolderMapping(
                    "notes.field.local",
                    Path.Combine(Program.Root, "dist"),
                    CoreWebView2HostResourceAccessKind.DenyCors
                );
                core.AddWebResourceRequestedFilter(
                    "https://media.field.local/*",
                    CoreWebView2WebResourceContext.Image
                );
                core.WebResourceRequested += OnResourceRequested;
                core.WebMessageReceived += OnWebMessageReceived;
                core.Navigate("https://notes.field.local/index.html");
            }
            catch (Exception ex)
            {
                File.WriteAllText(Path.Combine(Program.Data, "error.log"), ex.ToString());
                MessageBox.Show(this, "编辑器加载失败：" + ex.Message, "页核 · PAGECORE");
                allowClose = true;
                Close();
            }
        }

        void OnResourceRequested(object sender, CoreWebView2WebResourceRequestedEventArgs e)
        {
            var core = web.CoreWebView2;
            try
            {
                var uri = new Uri(e.Request.Uri);
                string rel = Uri.UnescapeDataString(uri.AbsolutePath)
                    .TrimStart('/')
                    .Replace('/', Path.DirectorySeparatorChar);
                if (assetFolder == null || Path.IsPathRooted(rel))
                    throw new IOException();
                string path = Path.GetFullPath(Path.Combine(assetFolder, rel));
                if (
                    !path.StartsWith(
                        assetFolder.TrimEnd('\\') + "\\",
                        StringComparison.OrdinalIgnoreCase
                    )
                )
                    throw new IOException();
                string ext = Path.GetExtension(path).ToLowerInvariant();
                string mime =
                    ext == ".png" ? "image/png"
                    : ext == ".jpg" || ext == ".jpeg" ? "image/jpeg"
                    : ext == ".gif" ? "image/gif"
                    : ext == ".webp" ? "image/webp"
                    : null;
                if (mime == null || new FileInfo(path).Length > 20 * 1024 * 1024)
                    throw new IOException();
                e.Response = core.Environment.CreateWebResourceResponse(
                    new MemoryStream(File.ReadAllBytes(path)),
                    200,
                    "OK",
                    "Content-Type: "
                        + mime
                        + "\r\nCache-Control: no-store\r\nAccess-Control-Allow-Origin: https://notes.field.local"
                );
            }
            catch
            {
                e.Response = core.Environment.CreateWebResourceResponse(
                    null,
                    404,
                    "Not Found",
                    "Cache-Control: no-store"
                );
            }
        }
    }
}
