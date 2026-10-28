using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Web.Script.Serialization;

namespace FieldNotes
{
    sealed class TabView
    {
        public string mode { get; set; }
        public int anchor { get; set; }
        public int head { get; set; }
        public double sourceTop { get; set; }
        public double writeTop { get; set; }
        public double previewTop { get; set; }
    }

    sealed class SessionEntry
    {
        public string path { get; set; }
        public string name { get; set; }
        public string text { get; set; }
        public TabView view { get; set; }
    }

    sealed class SessionState
    {
        public int version { get; set; }
        public int active { get; set; }
        public SessionEntry[] documents { get; set; }
    }

    static class SessionStore
    {
        public static void Save(string path, DocumentWorkspace workspace, string activeId)
        {
            // Unsaved contents remain in the separate recovery store. Never revive discarded edits.
            var tabs = workspace
                .Tabs.Where(t => t.Document.PathName != null || !t.Document.Dirty)
                .ToArray();
            var state = new SessionState
            {
                version = 1,
                active = Math.Max(0, Array.FindIndex(tabs, t => t.Id == activeId)),
                documents = tabs.Select(t => new SessionEntry
                    {
                        path = t.Document.PathName,
                        name = t.Document.Name,
                        text = t.Document.PathName == null ? t.Document.Text : null,
                        view = t.View,
                    })
                    .ToArray(),
            };
            DocumentSession.AtomicWrite(
                path,
                Encoding.UTF8.GetBytes(
                    new JavaScriptSerializer
                    {
                        MaxJsonLength = DocumentSession.MaxBytes * 3,
                    }.Serialize(state)
                ),
                null
            );
        }

        public static string[] Restore(string path, DocumentWorkspace workspace)
        {
            var warnings = new List<string>();
            if (!File.Exists(path))
                return warnings.ToArray();
            if (new FileInfo(path).Length > DocumentSession.MaxBytes * 3)
                throw new IOException("会话记录过大。");
            var state = new JavaScriptSerializer
            {
                MaxJsonLength = DocumentSession.MaxBytes * 3,
            }.Deserialize<SessionState>(File.ReadAllText(path));
            if (state == null || state.version != 1 || state.documents == null)
                throw new IOException("会话记录格式无效。");
            var initial = workspace.Active;
            var restored = new List<DocumentTab>();
            string active = null;
            long totalSize = 0;
            for (int i = 0; i < state.documents.Length && i < 100; i++)
            {
                var entry = state.documents[i];
                if (entry == null)
                    continue;
                try
                {
                    long size = !String.IsNullOrEmpty(entry.path)
                        ? new FileInfo(entry.path).Length
                        : (entry.text ?? "").Length * 2L;
                    if (totalSize + size > DocumentSession.MaxBytes)
                    {
                        warnings.Add("会话文档总量超过 10 MB，部分文档需手动打开。");
                        continue;
                    }
                    totalSize += size;
                    DocumentTab tab;
                    if (!String.IsNullOrEmpty(entry.path))
                        tab = workspace.Open(entry.path);
                    else
                    {
                        if (entry.text == null || entry.text.Length > DocumentSession.MaxBytes)
                            continue;
                        tab = workspace.New(
                            entry.text,
                            Path.GetFileName(entry.name ?? "未命名.md")
                        );
                    }
                    tab.View = entry.view;
                    restored.Add(tab);
                    if (i == state.active)
                        active = tab.Id;
                }
                catch (Exception ex)
                {
                    if (
                        !(ex is IOException)
                        && !(ex is UnauthorizedAccessException)
                        && !(ex is ArgumentException)
                    )
                        throw;
                    warnings.Add(Path.GetFileName(entry.path) + "：" + ex.Message);
                }
            }
            if (restored.Count > 0)
            {
                workspace.Select(initial.Id);
                workspace.CloseActive();
                workspace.Select(active ?? restored[0].Id);
            }
            if (state.documents.Length > 100)
                warnings.Add("会话超过 100 个标签页，仅恢复前 100 个。");
            return warnings.ToArray();
        }
    }
}
