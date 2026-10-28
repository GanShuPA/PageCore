using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Windows.Forms;

namespace FieldNotes
{
    sealed partial class StudioForm
    {
        string ChoosePath(string title, FilePickerMode mode, string name, string[] extensions)
        {
            string initial =
                mode == FilePickerMode.Folder ? folders.Root
                : doc.PathName == null ? folders.Root
                : Path.GetDirectoryName(doc.PathName);
            if (String.IsNullOrEmpty(initial) || !Directory.Exists(initial))
                initial = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
            if (String.IsNullOrEmpty(initial) || !Directory.Exists(initial))
                initial = Program.Root;
            var selected = PageFileDialog.Pick(
                this,
                title,
                mode,
                initial,
                name,
                extensions,
                darkTheme
            );
            return selected == null ? null : selected[0];
        }

        readonly FolderWorkspace folders = new FolderWorkspace();
        string FolderStatePath
        {
            get { return Path.Combine(Program.Data, "workspace.json"); }
        }

        void RestoreFolder()
        {
            if (!File.Exists(FolderStatePath))
                return;
            try
            {
                string path = json.Deserialize<string>(File.ReadAllText(FolderStatePath));
                if (path != null)
                    folders.Open(path);
            }
            catch (Exception ex)
            {
                Send(new { type = "notice", message = "上次的工作区无法恢复：" + ex.Message });
            }
        }

        void RememberFolder()
        {
            try
            {
                DocumentSession.AtomicWrite(
                    FolderStatePath,
                    System.Text.Encoding.UTF8.GetBytes(json.Serialize(folders.Root)),
                    null
                );
            }
            catch (Exception ex)
            {
                Send(new { type = "notice", message = "工作区路径未能记住：" + ex.Message });
            }
        }

        object FolderPayload()
        {
            return folders.Root == null
                ? null
                : new { root = folders.Root, name = new DirectoryInfo(folders.Root).Name };
        }

        object FolderCommand(string command, Dictionary<string, object> message)
        {
            string path = Get(message, "path") ?? "";
            switch (command)
            {
                case "workspace:choose":
                    string selected = ChoosePath(
                        "选择工作区文件夹",
                        FilePickerMode.Folder,
                        null,
                        null
                    );
                    if (selected == null)
                        return null;
                    if (searchCancellation != null)
                        searchCancellation.Cancel();
                    folders.Open(selected);
                    RememberFolder();
                    return FolderPayload();
                case "workspace:close":
                    if (searchCancellation != null)
                        searchCancellation.Cancel();
                    folders.Close();
                    RememberFolder();
                    return new { closed = true };
                case "workspace:list":
                    return new { entries = folders.List(path) };
                case "workspace:file":
                    workspace.Open(folders.FilePath(path));
                    return new { document = ChangedDocument() };
                case "workspace:create-file":
                case "workspace:create-folder":
                    bool directory = command == "workspace:create-folder";
                    if (
                        !directory
                        && workspace.FindPath(folders.Target(path, Get(message, "name"), false))
                            != null
                    )
                        throw new IOException("该路径属于一个已打开的标签页，请先保存或关闭它。");
                    string created = folders.Create(path, Get(message, "name"), directory);
                    if (directory)
                        return new { created = true };
                    workspace.Open(created);
                    return new { document = ChangedDocument() };
                case "workspace:rename":
                    string oldPath = folders.FilePath(path);
                    var changed = workspace
                        .Tabs.Where(t =>
                            String.Equals(
                                t.Document.PathName,
                                oldPath,
                                StringComparison.OrdinalIgnoreCase
                            )
                        )
                        .ToArray();
                    string target = folders.Rename(path, Get(message, "name"), workspace);
                    for (int i = 0; i < recent.Count; i++)
                        if (String.Equals(recent[i], oldPath, StringComparison.OrdinalIgnoreCase))
                            recent[i] = target;
                    ChangedDocument();
                    return new
                    {
                        renamed = true,
                        documents = changed
                            .Select(t => new
                            {
                                id = t.Id,
                                name = t.Document.Name,
                                path = t.Document.PathName,
                            })
                            .ToArray(),
                        recent = recent
                            .Select(p => new { name = Path.GetFileName(p), path = p })
                            .ToArray(),
                    };
                default:
                    throw new IOException("不支持的工作区操作。");
            }
        }
    }
}
