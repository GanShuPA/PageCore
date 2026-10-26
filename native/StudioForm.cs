using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.WinForms;

namespace FieldNotes
{
    sealed partial class StudioForm : BorderlessForm
    {
        readonly WebView2 web = new WebView2();
        readonly JavaScriptSerializer json = new JavaScriptSerializer
        {
            MaxJsonLength = DocumentSession.MaxBytes * 3,
        };
        readonly DocumentSession doc = new DocumentSession();
        readonly List<string> recent = new List<string>();
        readonly Timer draftTimer = new Timer { Interval = 800 };
        readonly string initialPath;
        string assetFolder;
        bool ready,
            closing,
            allowClose;
        Dictionary<string, object> pendingRecovery;
        string DraftPath
        {
            get { return Path.Combine(Program.Data, "recovery.json"); }
        }
        string BackupPath
        {
            get { return Path.Combine(Program.Data, "backups"); }
        }

        static bool OwnDocument(string uri)
        {
            Uri u;
            return Uri.TryCreate(uri, UriKind.Absolute, out u)
                && u.Scheme == "https"
                && u.Host == "notes.field.local"
                && u.IsDefaultPort
                && u.AbsolutePath == "/index.html";
        }

        public StudioForm(string path)
        {
            initialPath = path;
            Text = "页核 · PAGECORE · Markdown 编辑器";
            ClientSize = new Size(1400, 900);
            MinimumSize = new Size(900, 650);
            WindowState = FormWindowState.Maximized;
            StartPosition = FormStartPosition.CenterScreen;
            BackColor = Color.FromArgb(233, 235, 229);
            web.Dock = DockStyle.Fill;
            Controls.Add(web);
            Icon = System.Drawing.Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            SizeChanged += (s, e) => SendWindowState();
            doc.New(
                File.ReadAllText(Path.Combine(Program.Root, "dist", "welcome.md")),
                "欢迎使用.md"
            );
            try
            {
                var list = json.Deserialize<string[]>(
                    File.ReadAllText(Path.Combine(Program.Data, "recent.json"))
                );
                recent.AddRange(list.Where(DocumentSession.Allowed).Take(12));
            }
            catch { }
            draftTimer.Tick += (s, e) =>
            {
                draftTimer.Stop();
                PersistDraft();
            };
            Load += async (s, e) => await InitializeWebViewAsync();
            FormClosing += OnClosing;
        }

        object Payload()
        {
            return new
            {
                name = doc.Name,
                path = doc.PathName,
                text = doc.Text,
                cleanText = doc.CleanText,
                encoding = doc.Encoding.WebName + (doc.Bom ? " BOM" : ""),
                eol = doc.Eol == "\r\n" ? "CRLF" : "LF",
                dirty = doc.Dirty,
                assetBase = doc.PathName == null ? "" : "https://media.field.local/",
                recent = recent.Select(p => new { name = Path.GetFileName(p), path = p }).ToArray(),
            };
        }

        void Send(object value)
        {
            if (!IsDisposed && web.CoreWebView2 != null)
                web.CoreWebView2.PostWebMessageAsJson(json.Serialize(value));
        }

        void SendWindowState()
        {
            Send(
                new { type = "window-state", maximized = WindowState == FormWindowState.Maximized }
            );
        }

        string Get(Dictionary<string, object> d, string key)
        {
            object v;
            return d.TryGetValue(key, out v) ? v as string : null;
        }

        void Sync(Dictionary<string, object> message)
        {
            string text = Get(message, "text");
            if (text != null)
            {
                doc.Update(text);
                UpdateTitle();
                draftTimer.Stop();
                draftTimer.Start();
            }
        }

        void UpdateTitle()
        {
            Text = (doc.Dirty ? "● " : "") + doc.Name + " — 页核 · PAGECORE";
        }

        void PersistDraft()
        {
            try
            {
                if (doc.Dirty)
                    DocumentSession.AtomicWrite(
                        DraftPath,
                        Encoding.UTF8.GetBytes(
                            json.Serialize(
                                new
                                {
                                    name = doc.Name,
                                    text = doc.Text,
                                    path = doc.PathName,
                                }
                            )
                        ),
                        null
                    );
                else if (File.Exists(DraftPath))
                    File.Delete(DraftPath);
            }
            catch (Exception ex)
            {
                Send(new { type = "notice", message = "恢复草稿保存失败：" + ex.Message });
            }
        }

        void Remember()
        {
            if (doc.PathName == null)
                return;
            recent.RemoveAll(p =>
                String.Equals(p, doc.PathName, StringComparison.OrdinalIgnoreCase)
            );
            recent.Insert(0, doc.PathName);
            if (recent.Count > 12)
                recent.RemoveRange(12, recent.Count - 12);
            try
            {
                File.WriteAllText(
                    Path.Combine(Program.Data, "recent.json"),
                    json.Serialize(recent)
                );
            }
            catch { }
        }

        void ConfigureAssets()
        {
            assetFolder = doc.PathName == null ? null : Path.GetDirectoryName(doc.PathName);
        }
    }
}
