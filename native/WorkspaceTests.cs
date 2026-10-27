using System;
using System.IO;
using System.Linq;

namespace FieldNotes
{
    static class WorkspaceTests
    {
        static void Assert(bool condition, string message)
        {
            if (!condition)
                throw new Exception(message);
        }

        public static void Run(string folder)
        {
            string first = Path.Combine(folder, "tabs-first.md");
            string second = Path.Combine(folder, "tabs-second.md");
            File.WriteAllText(first, "first");
            File.WriteAllText(second, "second");
            var workspace = new DocumentWorkspace();
            workspace.Open(first);
            var a = workspace.Active;
            a.Document.Update("first edited");
            workspace.Open(second);
            var b = workspace.Active;
            b.Document.Update("second edited");
            workspace.Open(first.ToUpperInvariant());
            Assert(
                workspace.Active == a && workspace.Tabs.Count() == 3,
                "duplicate file should activate existing tab"
            );
            Assert(a.Document.Text == "first edited", "reopening must preserve unsaved text");
            workspace.Select(b.Id);
            workspace.Active.Document.Save(second, null);
            Assert(
                File.ReadAllText(first) == "first" && File.ReadAllText(second) == "second edited",
                "save must target active file only"
            );
            Assert(a.Document.Dirty && !b.Document.Dirty, "dirty states must remain independent");
            bool rejected = false;
            try
            {
                workspace.Open(Path.Combine(folder, "missing.md"));
            }
            catch (IOException)
            {
                rejected = true;
            }
            Assert(
                rejected && workspace.Active == b && workspace.Tabs.Count() == 3,
                "failed open must leave workspace intact"
            );
            workspace.CloseActive();
            Assert(
                workspace.Active == a && workspace.Find(b.Id) == null,
                "close should select neighbor and remove old identity"
            );
            workspace.CloseActive();
            workspace.CloseActive();
            Assert(
                workspace.Tabs.Count() == 1 && workspace.Active.Document.Text == "",
                "last close should create a blank tab"
            );
            Assert(workspace.FindPath(first) == null, "closed paths should be released");
        }
    }
}
