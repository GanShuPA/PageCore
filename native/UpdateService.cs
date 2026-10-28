using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

namespace FieldNotes
{
    sealed class UpdateRelease
    {
        public string version { get; set; }
        public string notes { get; set; }
        public string url { get; set; }
        public string checksum { get; set; }
        public string digest { get; set; }
    }

    static class UpdateService
    {
        const string Repo = "https://github.com/GanShuPA/PageCore-Markdown";
        public static string Current
        {
            get { return typeof(Program).Assembly.GetName().Version.ToString(3); }
        }

        public static UpdateRelease Parse(string text, string current)
        {
            var data = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(text);
            var tag = Convert.ToString(data["tag_name"]);
            if (
                (bool)data["draft"]
                || (bool)data["prerelease"]
                || !Regex.IsMatch(tag, @"^v\d+\.\d+\.\d+$")
            )
                return null;
            var version = tag.Substring(1);
            if (new Version(version) <= new Version(current))
                return null;
            string name = "PageCore-v" + version + "-windows-x64.zip";
            var assets = ((System.Collections.IEnumerable)data["assets"])
                .Cast<Dictionary<string, object>>()
                .ToArray();
            var zip = assets.SingleOrDefault(a => Convert.ToString(a["name"]) == name);
            var sum = assets.SingleOrDefault(a => Convert.ToString(a["name"]) == "SHA256SUMS.txt");
            if (zip == null || sum == null)
                throw new IOException("新版本尚未提供完整的安装包，请稍后重试。");
            var baseUrl = Repo + "/releases/download/" + tag + "/";
            if (
                Convert.ToString(zip["browser_download_url"]) != baseUrl + name
                || Convert.ToString(sum["browser_download_url"]) != baseUrl + "SHA256SUMS.txt"
            )
                throw new IOException("发布附件地址无效。");
            object digest;
            zip.TryGetValue("digest", out digest);
            return new UpdateRelease
            {
                version = version,
                notes = Convert.ToString(data["body"]),
                url = baseUrl + name,
                checksum = baseUrl + "SHA256SUMS.txt",
                digest = Convert.ToString(digest),
            };
        }

        public static byte[] Download(string url, int limit, CancellationToken cancel)
        {
            ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12;
            var request = (HttpWebRequest)WebRequest.Create(url);
            request.UserAgent = "PageCore/" + Current;
            request.Accept = "application/vnd.github+json";
            request.Timeout = 30000;
            request.ReadWriteTimeout = 30000;
            using (cancel.Register(request.Abort))
            using (var response = request.GetResponse())
            using (var input = response.GetResponseStream())
            using (var output = new MemoryStream())
            {
                if (response.ResponseUri.Scheme != "https")
                    throw new IOException("更新连接必须使用 HTTPS。");
                var buffer = new byte[32768];
                int count;
                while ((count = input.Read(buffer, 0, buffer.Length)) > 0)
                {
                    cancel.ThrowIfCancellationRequested();
                    if (output.Length + count > limit)
                        throw new IOException("更新下载超过大小限制。");
                    output.Write(buffer, 0, count);
                }
                return output.ToArray();
            }
        }

        public static UpdateRelease Check(CancellationToken cancel)
        {
            try
            {
                return Parse(
                    Encoding.UTF8.GetString(
                        Download(
                            "https://api.github.com/repos/GanShuPA/PageCore-Markdown/releases/latest",
                            2 * 1024 * 1024,
                            cancel
                        )
                    ),
                    Current
                );
            }
            catch (WebException ex)
            {
                if (
                    ex.Response is HttpWebResponse
                    && ((HttpWebResponse)ex.Response).StatusCode == HttpStatusCode.NotFound
                )
                    return null;
                throw;
            }
        }

        public static string Prepare(UpdateRelease release, CancellationToken cancel)
        {
            var sum = Encoding.UTF8.GetString(Download(release.checksum, 8192, cancel));
            var fileName = "PageCore-v" + release.version + "-windows-x64.zip";
            var match = Regex.Match(
                sum,
                @"(?m)^([a-fA-F0-9]{64})  " + Regex.Escape(fileName) + @"\r?$",
                RegexOptions.CultureInvariant
            );
            if (!match.Success)
                throw new IOException("校验文件格式无效。");
            var hash = match.Groups[1].Value.ToLowerInvariant();
            if (!String.IsNullOrEmpty(release.digest) && release.digest != "sha256:" + hash)
                throw new IOException("发布附件摘要不一致。");
            var stage = Path.Combine(Program.Data, "updates", Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(stage);
            File.WriteAllBytes(
                Path.Combine(stage, "package.zip"),
                Download(release.url, 64 * 1024 * 1024, cancel)
            );
            cancel.ThrowIfCancellationRequested();
            UpdatePackage.Extract(
                Path.Combine(stage, "package.zip"),
                Path.Combine(stage, "verified"),
                hash
            );
            cancel.ThrowIfCancellationRequested();
            var assembly = System.Reflection.AssemblyName.GetAssemblyName(
                Path.Combine(stage, "verified", "bin", "PageCore.exe")
            );
            if (assembly.Version.ToString(3) != release.version)
                throw new IOException("安装包版本与发布版本不一致。");
            File.WriteAllText(Path.Combine(stage, "sha256.txt"), hash);
            return stage;
        }

        public static void Launch(string stage)
        {
            var helper = Path.Combine(stage, "PageCore.Updater.exe");
            File.Copy(Path.Combine(Program.Root, "bin", "PageCore.Updater.exe"), helper, true);
            var encode = new Func<string, string>(s =>
                Convert.ToBase64String(Encoding.UTF8.GetBytes(s))
            );
            Process.Start(
                new ProcessStartInfo
                {
                    FileName = helper,
                    Arguments =
                        encode(Program.Root)
                        + " "
                        + encode(stage)
                        + " "
                        + Process.GetCurrentProcess().Id,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                }
            );
        }
    }

    sealed partial class StudioForm
    {
        UpdateRelease updateRelease;
        string updateStage;
        bool updateInstall;
        CancellationTokenSource updateCancellation;

        async Task<object> UpdateCommand(string command)
        {
            if (command == "update:info")
                return new { version = UpdateService.Current };
            if (command == "update:cancel")
            {
                if (updateCancellation != null)
                    updateCancellation.Cancel();
                return null;
            }
            if (updateCancellation != null)
                throw new IOException("正在处理更新，请稍候。");
            if (command == "update:install")
            {
                if (updateStage == null)
                    throw new IOException("请先下载更新。");
                updateInstall = true;
                BeginInvoke(new Action(Close));
                return null;
            }
            if (command != "update:check" && command != "update:download")
                throw new IOException("未知更新操作。");
            using (var cancel = new CancellationTokenSource(TimeSpan.FromMinutes(5)))
            {
                updateCancellation = cancel;
                try
                {
                    if (command == "update:check")
                    {
                        updateStage = null;
                        updateRelease = await Task.Run(() => UpdateService.Check(cancel.Token));
                        return updateRelease;
                    }
                    if (updateRelease == null)
                        throw new IOException("请先检查新版本。");
                    updateStage = await Task.Run(() =>
                        UpdateService.Prepare(updateRelease, cancel.Token)
                    );
                    return new { downloaded = true };
                }
                finally
                {
                    updateCancellation = null;
                }
            }
        }
    }
}
