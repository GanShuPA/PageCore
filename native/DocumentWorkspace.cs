using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace FieldNotes
{
    sealed class DocumentTab
    {
        public readonly string Id = Guid.NewGuid().ToString("N");
        public readonly DocumentSession Document = new DocumentSession();
        public TabView View;
    }

    // Owns file identity and document lifetime; editor histories live in the web UI.
    sealed class DocumentWorkspace
    {
        readonly List<DocumentTab> tabs = new List<DocumentTab>();
        int untitled;
        public DocumentTab Active { get; private set; }
        public IEnumerable<DocumentTab> Tabs
        {
            get { return tabs; }
        }

        public DocumentWorkspace()
        {
            New();
        }

        public DocumentTab Find(string id)
        {
            return tabs.FirstOrDefault(t => t.Id == id);
        }

        public DocumentTab FindPath(string path)
        {
            string fullPath = Path.GetFullPath(path);
            return tabs.FirstOrDefault(t =>
                String.Equals(t.Document.PathName, fullPath, StringComparison.OrdinalIgnoreCase)
            );
        }

        public DocumentTab New(string text = "", string name = null, bool dirty = false)
        {
            var tab = new DocumentTab();
            tab.Document.New(text, name ?? "未命名 " + (++untitled) + ".md", dirty);
            tabs.Add(tab);
            Active = tab;
            return tab;
        }

        public DocumentTab Open(string path)
        {
            var existing = FindPath(path);
            if (existing != null)
                return Active = existing;
            var tab = new DocumentTab();
            tab.Document.Open(path);
            tabs.Add(tab);
            return Active = tab;
        }

        public void Select(string id)
        {
            var tab = Find(id);
            if (tab == null)
                throw new IOException("标签页已关闭。");
            Active = tab;
        }

        // The caller must resolve unsaved changes before removing a tab.
        public void CloseActive()
        {
            int index = tabs.IndexOf(Active);
            tabs.RemoveAt(index);
            if (tabs.Count == 0)
                New();
            else
                Active = tabs[Math.Min(index, tabs.Count - 1)];
        }
    }
}
