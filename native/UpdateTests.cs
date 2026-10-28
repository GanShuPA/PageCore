using System;
using System.IO;
using System.IO.Compression;
using System.Web.Script.Serialization;

namespace FieldNotes
{
    static class UpdateTests
    {
        static void Assert(bool condition, string message)
        {
            if (!condition)
                throw new Exception(message);
        }

        static void Reject(Action action, string message)
        {
            bool failed = false;
            try
            {
                action();
            }
            catch (IOException)
            {
                failed = true;
            }
            Assert(failed, message);
        }

        public static void Run(string root)
        {
            var prefix = "https://github.com/GanShuPA/PageCore-Markdown/releases/download/v1.2.0/";
            var release = new
            {
                tag_name = "v1.2.0",
                draft = false,
                prerelease = false,
                body = "release notes",
                assets = new[]
                {
                    new
                    {
                        name = "PageCore-v1.2.0-windows-x64.zip",
                        browser_download_url = prefix + "PageCore-v1.2.0-windows-x64.zip",
                    },
                    new
                    {
                        name = "SHA256SUMS.txt",
                        browser_download_url = prefix + "SHA256SUMS.txt",
                    },
                },
            };
            var json = new JavaScriptSerializer().Serialize(release);
            Assert(UpdateService.Parse(json, "1.0.0").version == "1.2.0", "version upgrade");
            Assert(
                UpdateService.Parse(json, "1.2.0") == null
                    && UpdateService.Parse(json, "2.0.0") == null,
                "no downgrade"
            );
            Assert(
                UpdateService.Parse(
                    json.Replace("\"prerelease\":false", "\"prerelease\":true"),
                    "1.0.0"
                ) == null,
                "exclude preview"
            );
            Reject(
                () => UpdateService.Parse(json.Replace("github.com/", "example.com/"), "1.0.0"),
                "reject wrong repository"
            );
            foreach (
                var path in new[]
                {
                    "../outside",
                    "bin/../../outside",
                    ".runtime/settings.json",
                    "docs/local/private.md",
                    "bin/file:stream",
                    "bin/../a",
                    "bin/a./file",
                }
            )
                Assert(!UpdatePackage.Allowed(path), "reject unsafe update path: " + path);
            var work = Path.Combine(root, "updates");
            Directory.CreateDirectory(work);
            var zip = Path.Combine(work, "bad.zip");
            using (var archive = ZipFile.Open(zip, ZipArchiveMode.Create))
            using (
                var writer = new StreamWriter(archive.CreateEntry("PageCore/../escape.txt").Open())
            )
                writer.Write("bad");
            Reject(
                () =>
                    UpdatePackage.Extract(
                        zip,
                        Path.Combine(work, "extract"),
                        UpdatePackage.Hash(zip)
                    ),
                "reject zip traversal"
            );
            Reject(
                () =>
                    UpdatePackage.Extract(zip, Path.Combine(work, "extract"), new string('0', 64)),
                "reject bad checksum"
            );
            var source = Path.Combine(work, "source");
            var target = Path.Combine(work, "target");
            Directory.CreateDirectory(Path.Combine(source, "bin"));
            Directory.CreateDirectory(Path.Combine(target, "bin"));
            Directory.CreateDirectory(Path.Combine(target, ".runtime"));
            File.WriteAllText(Path.Combine(target, ".runtime", "session.json"), "private session");
            File.WriteAllText(Path.Combine(target, "note.md"), "user document");
            File.WriteAllText(Path.Combine(source, "bin", "a.txt"), "new");
            File.WriteAllText(Path.Combine(target, "bin", "a.txt"), "old");
            UpdatePackage.Apply(source, target, Path.Combine(work, "backup"));
            Assert(
                File.ReadAllText(Path.Combine(target, "bin", "a.txt")) == "new",
                "install program file"
            );
            Assert(
                File.ReadAllText(Path.Combine(target, ".runtime", "session.json"))
                    == "private session"
                    && File.ReadAllText(Path.Combine(target, "note.md")) == "user document",
                "preserve personal data"
            );
            File.WriteAllText(Path.Combine(source, "bin", "a.txt"), "broken update");
            File.WriteAllText(Path.Combine(source, "bin", "z.txt"), "collision");
            Directory.CreateDirectory(Path.Combine(target, "bin", "z.txt"));
            Reject(
                () => UpdatePackage.Apply(source, target, Path.Combine(work, "rollback")),
                "failed copy must fail installation"
            );
            Assert(
                File.ReadAllText(Path.Combine(target, "bin", "a.txt")) == "new",
                "restore old files after failed installation"
            );
        }
    }
}
