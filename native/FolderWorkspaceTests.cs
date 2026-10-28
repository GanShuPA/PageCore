using System;
using System.IO;
using System.Linq;
using System.Text;

namespace FieldNotes
{
    static class FolderWorkspaceTests
    {
        static void Assert(bool condition, string message)
        {
            if (!condition)
                throw new Exception(message);
        }

        static void Reject(Action action, string message)
        {
            bool rejected = false;
            try
            {
                action();
            }
            catch (IOException)
            {
                rejected = true;
            }
            Assert(rejected, message);
        }

        public static void Run(string testRoot)
        {
            string root = Path.Combine(testRoot, "folder-workspace");
            Directory.CreateDirectory(root);
            var files = new FolderWorkspace();
            files.Open(root + "\\");
            files.Create("", "笔记", true);
            string first = files.Create("", "甲.md", false);
            files.Create("笔记", "子文档.markdown", false);
            File.WriteAllText(Path.Combine(root, "ignored.exe"), "ignored");
            File.WriteAllText(Path.Combine(root, "hidden.md"), "hidden");
            File.SetAttributes(Path.Combine(root, "hidden.md"), FileAttributes.Hidden);
            Directory.CreateDirectory(Path.Combine(root, "node_modules"));
            var listed = files.List("");
            Assert(
                listed.Length == 2 && listed[0].directory && listed[1].name == "甲.md",
                "folder first, supported documents only, ignore private/dependency folders"
            );
            Assert(
                files.List("笔记").Single().path == "笔记/子文档.markdown",
                "lazy child listing"
            );
            Reject(() => files.Resolve("../outside.md"), "must confine parent traversal");
            Reject(
                () => files.Resolve(root + "-other\\outside.md"),
                "must reject absolute sibling paths"
            );
            Reject(() => files.Resolve("甲.md:stream"), "must reject alternate data streams");
            foreach (
                string name in new[] { "../bad.md", "CON.md", "bad.", "bad ", "bad?.md", "app.exe" }
            )
                Reject(() => files.Create("", name, false), "invalid filename accepted: " + name);
            Reject(() => files.Create("", "甲.md", false), "create must never overwrite");
            Reject(() => files.Create("", "笔记", true), "duplicate folder must be rejected");

            File.WriteAllText(first, "原始\r\n", new UnicodeEncoding(false, true));
            var documents = new DocumentWorkspace();
            var tab = documents.Open(first);
            tab.Document.Update("未保存修改\n");
            string fingerprint = tab.Document.Fingerprint;
            string renamed = files.Rename("甲.md", "重命名.md", documents);
            Assert(
                !File.Exists(first) && File.Exists(renamed) && documents.Active == tab,
                "rename must move disk file and retain tab identity"
            );
            Assert(
                tab.Document.Dirty
                    && tab.Document.Text == "未保存修改\n"
                    && tab.Document.CleanText == "原始\n"
                    && tab.Document.Fingerprint == fingerprint
                    && tab.Document.Encoding.CodePage == 1200
                    && tab.Document.Eol == "\r\n",
                "rename must preserve dirty text, saved baseline, fingerprint and encoding"
            );
            Assert(documents.Open(renamed) == tab, "renamed path must reuse existing tab");
            Assert(
                files.Rename("重命名.md", "重命名.md", documents) == renamed,
                "unchanged name is a no-op"
            );
            tab.Document.Save(renamed, null);
            Assert(!tab.Document.Dirty, "save after rename must succeed");
            Assert(
                File.ReadAllText(renamed) == "未保存修改\r\n",
                "save must use renamed location and original encoding"
            );
            files.Create("", "existing.md", false);
            Reject(
                () => files.Rename("重命名.md", "existing.md", documents),
                "rename must never overwrite"
            );
            Assert(File.Exists(renamed), "failed rename must preserve original file");
            File.AppendAllText(renamed, "external");
            files.Rename("重命名.md", "外部冲突.md", documents);
            Assert(
                tab.Document.HasExternalChanges(),
                "rename must not erase external conflict detection"
            );
            files.Close();
            Reject(() => files.List(""), "closed workspace must release filesystem access");
            Assert(
                documents.Active == tab && File.Exists(tab.Document.PathName),
                "closing folder must preserve open tabs and files"
            );
        }
    }
}
