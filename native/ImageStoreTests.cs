using System;
using System.IO;
using System.Linq;
using System.Text;

namespace FieldNotes
{
    static class ImageStoreTests
    {
        static void Assert(bool value, string message)
        {
            if (!value)
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

        public static void Run(string root)
        {
            var document = new DocumentSession();
            Reject(
                () => ImageStore.Save(document, "image/png", ""),
                "unsaved document must not create assets"
            );
            string path = Path.Combine(root, "我的笔记.md");
            File.WriteAllText(path, "# test", new UTF8Encoding(false));
            document.Open(path);
            byte[] png = Convert.FromBase64String(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2ioAAAAASUVORK5CYII="
            );
            string pngData = Convert.ToBase64String(png);
            string first = ImageStore.Save(document, "image/png", pngData);
            string second = ImageStore.Save(document, "image/png", pngData);
            Assert(
                first != second && first.StartsWith(Uri.EscapeDataString("我的笔记_assets") + "/"),
                "relative encoded image paths and unique names"
            );
            string folder = Path.Combine(root, "我的笔记_assets");
            string image = Path.Combine(folder, Path.GetFileName(first));
            Assert(
                File.ReadAllBytes(image).SequenceEqual(png),
                "stored bytes must match clipboard bytes"
            );
            Assert(
                File.Exists(Path.Combine(folder, Path.GetFileName(second))),
                "duplicate images must not overwrite"
            );
            Assert(
                !document.Dirty && File.ReadAllText(path) == "# test",
                "image copy must not modify document"
            );
            Reject(
                () => ImageStore.Save(document, "image/svg+xml", pngData),
                "unsupported type must fail"
            );
            Reject(
                () => ImageStore.Save(document, "image/jpeg", pngData),
                "mismatched image bytes must fail"
            );
            Reject(
                () => ImageStore.Save(document, "image/png", "not base64!"),
                "invalid base64 must fail"
            );
            Reject(() => ImageStore.Save(document, "image/png", ""), "empty image must fail");
            Reject(
                () =>
                    ImageStore.Save(
                        document,
                        "image/png",
                        new string('A', ((ImageStore.MaxBytes + 2) / 3) * 4 + 4)
                    ),
                "oversized image must fail"
            );
            Assert(
                Directory.GetFiles(folder).Length == 2,
                "failed imports must not leave image files"
            );
            var formats = new[]
            {
                new
                {
                    mime = "image/jpeg",
                    bytes = new byte[] { 255, 216, 255, 0 },
                    ext = ".jpg",
                },
                new
                {
                    mime = "image/gif",
                    bytes = Encoding.ASCII.GetBytes("GIF89a"),
                    ext = ".gif",
                },
                new
                {
                    mime = "image/webp",
                    bytes = Encoding.ASCII.GetBytes("RIFF0000WEBP"),
                    ext = ".webp",
                },
            };
            foreach (var format in formats)
                Assert(
                    ImageStore
                        .Save(document, format.mime, Convert.ToBase64String(format.bytes))
                        .EndsWith(format.ext),
                    "image type extension"
                );
        }
    }
}
