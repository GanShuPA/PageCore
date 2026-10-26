using System;
using System.IO;
using System.Linq;
using System.Text;

namespace FieldNotes
{
    static class SessionTests
    {
        static void Assert(bool value, string name)
        {
            if (!value)
                throw new Exception(name);
        }

        public static int Run()
        {
            string folder = Path.Combine(Program.Data, "tests-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(folder);
            string backup = Path.Combine(folder, "backups");
            try
            {
                foreach (
                    Encoding enc in new Encoding[]
                    {
                        new UTF8Encoding(false, true),
                        new UTF8Encoding(true, true),
                        new UnicodeEncoding(false, true, true),
                        new UnicodeEncoding(true, true, true),
                        Encoding.GetEncoding(54936),
                    }
                )
                {
                    var file = Path.Combine(
                        folder,
                        enc.CodePage + "-" + enc.GetPreamble().Length + ".md"
                    );
                    File.WriteAllText(file, "# 中文测试\r\n\r\n第一行\r\n", enc);
                    var bytes = File.ReadAllBytes(file);
                    var session = new DocumentSession();
                    session.Open(file);
                    Assert(!session.Dirty, "newly opened dirty");
                    Assert(session.Text.Contains("中文测试"), "decode");
                    session.Save(file, backup);
                    Assert(bytes.SequenceEqual(File.ReadAllBytes(file)), "no-edit roundtrip");
                    session.Update(session.Text + "第二行\n");
                    Assert(session.Dirty, "change detection");
                    session.Save(file, backup);
                    var restored = new DocumentSession();
                    restored.Open(file);
                    Assert(restored.Text == session.Text, "edited roundtrip");
                    Assert(restored.Eol == "\r\n", "line endings");
                    Assert(!session.Dirty, "saved clean");
                    File.AppendAllText(file, "external", enc);
                    Assert(session.HasExternalChanges(), "external conflict detection");
                    bool rejected = false;
                    try
                    {
                        session.Update("replacement");
                        session.Save(file, backup);
                    }
                    catch (IOException)
                    {
                        rejected = true;
                    }
                    Assert(rejected, "must reject conflict");
                }
                var fresh = new DocumentSession();
                fresh.New("", "未命名.md");
                fresh.Update("# 新建\n");
                fresh.Save(Path.Combine(folder, "new.md"), backup);
                Assert(File.Exists(fresh.PathName), "save new");
                Assert(!DocumentSession.Allowed("bad.exe"), "extension guard");
                File.WriteAllText(
                    Path.Combine(Program.Data, "self-test.json"),
                    "{\"passed\":true,\"checks\":[\"five encodings\",\"exact no-edit roundtrip\",\"CRLF preservation\",\"external conflict\",\"atomic save\",\"new document\",\"extension guard\"]}"
                );
                return 0;
            }
            catch (Exception ex)
            {
                File.WriteAllText(Path.Combine(Program.Data, "self-test.json"), ex.ToString());
                return 1;
            }
        }
    }
}
