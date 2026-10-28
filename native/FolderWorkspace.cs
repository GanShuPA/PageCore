using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;

namespace FieldNotes
{
    sealed class FolderEntry
    {
        public string name { get; set; }
        public string path { get; set; }
        public bool directory { get; set; }
    }

    // All browser paths are relative to the folder explicitly selected by the user.
    sealed class FolderWorkspace
    {
        public string Root { get; private set; }

        public void Open(string path)
        {
            string root = Path.GetFullPath(path);
            if (root.Length > Path.GetPathRoot(root).Length)
                root = root.TrimEnd('\\');
            if (!Directory.Exists(root))
                throw new IOException("工作区文件夹不存在或无法访问。");
            CheckDirectory(root);
            Root = root;
        }

        public void Close()
        {
            Root = null;
        }

        static void CheckDirectory(string path)
        {
            var attributes = File.GetAttributes(path);
            if ((attributes & FileAttributes.ReparsePoint) != 0)
                throw new IOException("工作区不展开符号链接或目录联接，请选择实际文件夹。");
            if ((attributes & FileAttributes.Directory) == 0)
                throw new IOException("请选择文件夹。");
        }

        public string Resolve(string relative)
        {
            if (Root == null)
                throw new IOException("请先打开工作区文件夹。");
            if (relative == null || Path.IsPathRooted(relative) || relative.Contains(":"))
                throw new IOException("工作区路径无效。");
            foreach (string component in relative.Replace('/', '\\').Split('\\'))
                if (
                    component.Length > 0
                    && (
                        component == "."
                        || component == ".."
                        || component.EndsWith(" ")
                        || component.EndsWith(".")
                        || component.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0
                    )
                )
                    throw new IOException("工作区路径无效。");
            string full = Path.GetFullPath(Path.Combine(Root, relative.Replace('/', '\\')));
            string prefix = Root.TrimEnd('\\') + "\\";
            if (
                !String.Equals(full, Root, StringComparison.OrdinalIgnoreCase)
                && !full.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)
            )
                throw new IOException("路径位于工作区之外。");
            CheckDirectory(Root);
            string current = Root;
            foreach (string part in full.Substring(Root.Length).TrimStart('\\').Split('\\'))
            {
                if (part.Length == 0)
                    continue;
                current = Path.Combine(current, part);
                if (File.Exists(current) || Directory.Exists(current))
                {
                    if ((File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
                        throw new IOException("工作区不访问符号链接或目录联接。");
                }
            }
            return full;
        }

        public FolderEntry[] List(string relative)
        {
            string directory = Resolve(relative);
            var entries = new List<FolderEntry>();
            foreach (string file in Directory.EnumerateFileSystemEntries(directory))
            {
                FileAttributes attributes;
                try
                {
                    attributes = File.GetAttributes(file);
                }
                catch (IOException)
                {
                    continue;
                }
                catch (UnauthorizedAccessException)
                {
                    continue;
                }
                if (
                    (
                        attributes
                        & (
                            FileAttributes.Hidden
                            | FileAttributes.System
                            | FileAttributes.ReparsePoint
                        )
                    ) != 0
                )
                    continue;
                bool isDirectory = (attributes & FileAttributes.Directory) != 0;
                string name = Path.GetFileName(file);
                if (isDirectory && (name == "node_modules" || name == ".git" || name == ".runtime"))
                    continue;
                if (!isDirectory && !DocumentSession.Allowed(file))
                    continue;
                entries.Add(
                    new FolderEntry
                    {
                        name = name,
                        path = file.Substring(Root.TrimEnd('\\').Length + 1).Replace('\\', '/'),
                        directory = isDirectory,
                    }
                );
                if (entries.Count > 5000)
                    throw new IOException("此目录超过 5000 项，请选择更小的文件夹。");
            }
            return entries
                .OrderByDescending(e => e.directory)
                .ThenBy(e => e.name, StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }

        static void ValidateName(string name)
        {
            if (
                String.IsNullOrWhiteSpace(name)
                || name.Length > 200
                || name.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0
                || name.EndsWith(".")
                || name.EndsWith(" ")
                || Regex.IsMatch(
                    name,
                    @"^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)",
                    RegexOptions.IgnoreCase
                )
            )
                throw new IOException("名称无效，请避免保留名称、特殊字符以及末尾的空格或句点。");
        }

        public string Target(string parent, string name, bool directory)
        {
            ValidateName(name);
            if (!directory && !DocumentSession.Allowed(name))
                throw new IOException("文档扩展名必须为 .md、.markdown 或 .txt。");
            string folder = Resolve(parent);
            if (!Directory.Exists(folder))
                throw new IOException("目标文件夹已不存在，请刷新工作区。");
            string target = Path.Combine(folder, name);
            if (File.Exists(target) || Directory.Exists(target))
                throw new IOException("已有同名文件或文件夹，请换一个名称。");
            return target;
        }

        public string Create(string parent, string name, bool directory)
        {
            string target = Target(parent, name, directory);
            if (directory)
                Directory.CreateDirectory(target);
            else
                using (new FileStream(target, FileMode.CreateNew, FileAccess.Write)) { }
            return target;
        }

        public string FilePath(string relative)
        {
            string path = Resolve(relative);
            if (!DocumentSession.Allowed(path) || !File.Exists(path))
                throw new IOException("文档已不存在或格式不受支持，请刷新工作区。");
            return path;
        }

        public string Rename(string relative, string name, DocumentWorkspace documents)
        {
            string oldPath = FilePath(relative);
            string parent = Path.GetDirectoryName(relative.Replace('/', '\\')) ?? "";
            if (String.Equals(Path.GetFileName(oldPath), name, StringComparison.Ordinal))
                return oldPath;
            string target = Target(parent, name, false);
            if (documents.FindPath(target) != null)
                throw new IOException("目标名称属于一个已打开的标签页，请先关闭该标签页。");
            File.Move(oldPath, target);
            foreach (
                var tab in documents.Tabs.Where(t =>
                    String.Equals(t.Document.PathName, oldPath, StringComparison.OrdinalIgnoreCase)
                )
            )
                tab.Document.Relocate(target);
            return target;
        }
    }
}
