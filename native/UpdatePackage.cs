using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Security.Cryptography;

namespace FieldNotes
{
    static class UpdatePackage
    {
        public static string Hash(string path)
        {
            using (var sha = SHA256.Create())
            using (var stream = File.OpenRead(path))
                return BitConverter
                    .ToString(sha.ComputeHash(stream))
                    .Replace("-", "")
                    .ToLowerInvariant();
        }

        public static bool Allowed(string path)
        {
            if (String.IsNullOrEmpty(path) || path.Contains("\\") || path.Contains(":"))
                return false;
            if (
                path.Split('/')
                    .Any(p =>
                        p == ".." || p == "." || p.Length == 0 || p.EndsWith(".") || p.EndsWith(" ")
                    )
            )
                return false;
            return path.StartsWith("bin/", StringComparison.Ordinal)
                || path.StartsWith("dist/", StringComparison.Ordinal)
                || path.StartsWith("assets/", StringComparison.Ordinal)
                || (
                    path.StartsWith("docs/", StringComparison.Ordinal)
                    && !path.StartsWith("docs/local/", StringComparison.OrdinalIgnoreCase)
                )
                || path == "README.md"
                || path == "LICENSE"
                || path == "启动页核.cmd";
        }

        public static string SafePath(string root, string relative)
        {
            if (!Allowed(relative))
                throw new IOException("更新包包含不允许的文件。");
            root = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar);
            var path = Path.GetFullPath(
                Path.Combine(root, relative.Replace('/', Path.DirectorySeparatorChar))
            );
            if (
                !path.StartsWith(
                    root + Path.DirectorySeparatorChar,
                    StringComparison.OrdinalIgnoreCase
                )
            )
                throw new IOException("更新路径越界。");
            for (var parent = path; parent != null; parent = Path.GetDirectoryName(parent))
            {
                if (
                    (File.Exists(parent) || Directory.Exists(parent))
                    && (File.GetAttributes(parent) & FileAttributes.ReparsePoint) != 0
                )
                    throw new IOException("更新目录不能包含符号链接或目录联接。");
            }
            return path;
        }

        public static void Extract(string zipPath, string destination, string expectedHash)
        {
            if (!String.Equals(Hash(zipPath), expectedHash, StringComparison.OrdinalIgnoreCase))
                throw new IOException("安装包校验失败，请重新下载。");
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            long total = 0;
            using (var archive = ZipFile.OpenRead(zipPath))
            {
                if (archive.Entries.Count > 4000)
                    throw new IOException("安装包文件过多。");
                foreach (var entry in archive.Entries)
                {
                    var name = entry.FullName.Replace('\\', '/');
                    if (!name.StartsWith("PageCore/", StringComparison.Ordinal))
                        throw new IOException("安装包目录无效。");
                    if (name.EndsWith("/"))
                        continue;
                    var relative = name.Substring(9);
                    if (
                        !seen.Add(relative)
                        || entry.Length > 64 * 1024 * 1024
                        || (total += entry.Length) > 200 * 1024 * 1024
                    )
                        throw new IOException("安装包大小或重复文件无效。");
                    var target = SafePath(destination, relative);
                    Directory.CreateDirectory(Path.GetDirectoryName(target));
                    entry.ExtractToFile(target, false);
                }
            }
            foreach (
                var required in new[]
                {
                    "bin/PageCore.exe",
                    "bin/PageCore.Updater.exe",
                    "bin/PageCore.exe.config",
                    "bin/Microsoft.Web.WebView2.Core.dll",
                    "bin/Microsoft.Web.WebView2.WinForms.dll",
                    "bin/WebView2Loader.dll",
                    "dist/index.html",
                    "dist/app.js",
                    "dist/app.css",
                    "dist/welcome.md",
                }
            )
                if (!seen.Contains(required))
                    throw new IOException("安装包缺少必要文件：" + required);
        }

        public static void Apply(string source, string root, string backup)
        {
            var changed = new List<string>();
            var existing = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var files = Directory
                .GetFiles(source, "*", SearchOption.AllDirectories)
                .Select(p => p.Substring(source.TrimEnd('\\').Length + 1).Replace('\\', '/'))
                .ToArray();
            foreach (var relative in files)
            {
                SafePath(source, relative);
                SafePath(root, relative);
                SafePath(backup, relative);
            }
            try
            {
                foreach (var relative in files)
                {
                    var target = SafePath(root, relative);
                    if (File.Exists(target))
                    {
                        var saved = SafePath(backup, relative);
                        Directory.CreateDirectory(Path.GetDirectoryName(saved));
                        File.Copy(target, saved, false);
                        existing.Add(relative);
                    }
                    changed.Add(relative);
                    Directory.CreateDirectory(Path.GetDirectoryName(target));
                    File.Copy(SafePath(source, relative), target, true);
                }
            }
            catch (Exception installError)
            {
                var errors = new List<string>();
                foreach (var relative in changed.AsEnumerable().Reverse())
                {
                    try
                    {
                        var target = SafePath(root, relative);
                        if (existing.Contains(relative))
                            File.Copy(SafePath(backup, relative), target, true);
                        else if (File.Exists(target))
                            File.Delete(target);
                    }
                    catch (Exception ex)
                    {
                        errors.Add(ex.Message);
                    }
                }
                throw new IOException(
                    errors.Count == 0
                        ? "升级失败，已恢复原版本：" + installError.Message
                        : "升级失败，部分文件未能回滚。备份目录："
                            + backup
                            + "。"
                            + String.Join("；", errors),
                    installError
                );
            }
        }
    }
}
