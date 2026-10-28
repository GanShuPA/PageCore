using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Windows.Forms;
using FieldNotes;

static class UpdateInstaller
{
    [STAThread]
    static void Main(string[] args)
    {
        string root = null;
        try
        {
            if (args.Length != 3)
                throw new IOException("更新参数无效。");
            root = Path.GetFullPath(Encoding.UTF8.GetString(Convert.FromBase64String(args[0])));
            var stage = Path.GetFullPath(
                Encoding.UTF8.GetString(Convert.FromBase64String(args[1]))
            );
            if (
                !stage.StartsWith(
                    Path.Combine(root, ".runtime", "updates") + "\\",
                    StringComparison.OrdinalIgnoreCase
                )
            )
                throw new IOException("更新目录无效。");
            var pid = Int32.Parse(args[2]);
            try
            {
                using (var process = Process.GetProcessById(pid))
                {
                    if (!process.WaitForExit(60000))
                        throw new IOException("页核未退出，升级已取消。");
                }
            }
            catch (ArgumentException) { }
            var source = Path.Combine(stage, "install");
            UpdatePackage.Extract(
                Path.Combine(stage, "package.zip"),
                source,
                File.ReadAllText(Path.Combine(stage, "sha256.txt")).Trim()
            );
            UpdatePackage.Apply(source, root, Path.Combine(stage, "backup"));
            File.WriteAllText(
                Path.Combine(root, ".runtime", "update-result.txt"),
                "升级完成。程序文件已更新，文档与设置已保留。"
            );
            Process.Start(Path.Combine(root, "bin", "PageCore.exe"));
        }
        catch (Exception ex)
        {
            if (root != null)
            {
                try
                {
                    File.WriteAllText(
                        Path.Combine(root, ".runtime", "update-result.txt"),
                        ex.Message
                    );
                }
                catch { }
            }
            MessageBox.Show(
                ex.Message + "\n请重新打开页核，或从 GitHub 下载完整包。",
                "页核升级",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
        }
    }
}
