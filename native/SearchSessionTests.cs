using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading;

namespace FieldNotes
{
    static class SearchSessionTests
    {
        static void Assert(bool value, string message)
        {
            if (!value)
                throw new Exception(message);
        }

        public static void Run(string testRoot)
        {
            string root = Path.Combine(testRoot, "search-session");
            Directory.CreateDirectory(root);
            string first = Path.Combine(root, "中文.md"),
                second = Path.Combine(root, "second.txt");
            File.WriteAllText(first, "Heading\r\nAlpha 中文 alpha\r\n", new UTF8Encoding(true));
            File.WriteAllText(second, "中文", Encoding.Unicode);
            Directory.CreateDirectory(Path.Combine(root, "node_modules"));
            File.WriteAllText(Path.Combine(root, "node_modules", "ignored.md"), "Alpha");
            File.WriteAllText(Path.Combine(root, "ignore.png"), "Alpha");
            var empty = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            var found = WorkspaceSearch.Run(root, "alpha", false, empty, CancellationToken.None);
            Assert(
                found.hits.Count == 2 && found.hits[0].line == 2 && found.hits[1].column == 9,
                "literal search must keep line/UTF-16 column and case rules"
            );
            Assert(
                WorkspaceSearch.Run(root, "alpha", true, empty, CancellationToken.None).hits.Count
                    == 1,
                "case-sensitive search"
            );
            Assert(
                WorkspaceSearch.Run(root, "中文", false, empty, CancellationToken.None).hits.Count
                    == 2,
                "search UTF-8 and UTF-16 documents"
            );
            var edits = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                { first, "latest draft" },
            };
            Assert(
                WorkspaceSearch
                    .Run(root, "draft", false, edits, CancellationToken.None)
                    .hits.Single()
                    .unsaved,
                "search latest unsaved contents"
            );
            using (var cancel = new CancellationTokenSource())
            {
                cancel.Cancel();
                bool stopped = false;
                try
                {
                    WorkspaceSearch.Run(root, "中文", false, empty, cancel.Token);
                }
                catch (OperationCanceledException)
                {
                    stopped = true;
                }
                Assert(stopped, "cancel must stop search");
            }
            File.WriteAllText(
                Path.Combine(root, "many.md"),
                String.Concat(Enumerable.Repeat("limit\n", 400))
            );
            var limited = WorkspaceSearch.Run(root, "limit", false, empty, CancellationToken.None);
            Assert(limited.limited && limited.hits.Count == 300, "bound search results");
            string session = Path.Combine(root, "session.json");
            var workspace = new DocumentWorkspace();
            workspace.Active.Document.New("welcome", "welcome.md");
            var a = workspace.Open(first);
            a.View = new TabView
            {
                mode = "source",
                anchor = 5,
                head = 8,
                sourceTop = 420,
            };
            workspace.Open(second);
            workspace.New("do not revive discarded text", "scratch.md", true);
            a.Document.Update("dirty content");
            workspace.Select(a.Id);
            SessionStore.Save(session, workspace, a.Id);
            File.WriteAllText(first, "external edit");
            var restored = new DocumentWorkspace();
            Assert(SessionStore.Restore(session, restored).Length == 0, "valid session restore");
            Assert(
                restored.Tabs.Count() == 3 && restored.Active.Document.PathName == first,
                "restore order, active file, no duplicate welcome or discarded scratch"
            );
            Assert(
                restored.Active.Document.Text == "external edit" && !restored.Active.Document.Dirty,
                "session restores disk truth without overwriting external changes"
            );
            Assert(
                restored.Active.View.sourceTop == 420 && restored.Active.View.anchor == 5,
                "view position survives serialization"
            );
            File.Delete(second);
            var missing = new DocumentWorkspace();
            Assert(
                SessionStore.Restore(session, missing).Length == 1 && missing.Tabs.Count() == 2,
                "missing file must not prevent restoring remaining tabs"
            );
            Assert(
                File.ReadAllText(first) == "external edit",
                "restoration never writes document files"
            );
        }
    }
}
