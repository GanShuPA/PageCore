using System;
using System.IO;
using System.Linq;
using System.Windows.Forms;

namespace FieldNotes
{
    static class Program
    {
        public static readonly string Root = Path.GetFullPath(
            Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..")
        );
        public static readonly string Data = Path.Combine(Root, ".runtime");

        [STAThread]
        static void Main(string[] args)
        {
            Directory.CreateDirectory(Data);
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            if (args.Contains("--self-test"))
            {
                Environment.ExitCode = SessionTests.Run();
                return;
            }
            bool isNew;
            using (
                var mutex = new System.Threading.Mutex(
                    true,
                    "Local\\FieldNotesMarkdownStudio",
                    out isNew
                )
            )
            {
                if (!isNew)
                {
                    PagePrompt.Ask(
                        null,
                        "页核已经运行",
                        "请切换到已有的页核窗口继续使用。",
                        "知道了",
                        null,
                        false
                    );
                    return;
                }
                Application.Run(new StudioForm(args.FirstOrDefault(a => !a.StartsWith("--"))));
            }
        }
    }
}
