using System;
using System.IO;

namespace FieldNotes
{
    // Create a new file beside the owning document, without accepting a path from the web UI.
    sealed class ImageStore
    {
        public const int MaxBytes = 10 * 1024 * 1024;

        public static string Save(DocumentSession document, string mime, string encoded)
        {
            if (document == null || document.PathName == null)
                throw new IOException("请先保存文档，再插入图片。");
            string extension = Extension(mime);
            if (encoded == null || encoded.Length > ((MaxBytes + 2) / 3) * 4)
                throw new IOException("单张图片不能超过 10 MB。");
            byte[] bytes;
            try
            {
                bytes = Convert.FromBase64String(encoded);
            }
            catch (FormatException)
            {
                throw new IOException("图片数据无法读取。");
            }
            if (bytes.Length == 0 || bytes.Length > MaxBytes || !Matches(bytes, mime))
                throw new IOException("图片格式无效或文件超过 10 MB。");

            string documentDirectory = Path.GetDirectoryName(document.PathName);
            string assetName = Path.GetFileNameWithoutExtension(document.PathName) + "_assets";
            string folder = Path.Combine(documentDirectory, assetName);
            if (
                Directory.Exists(folder)
                && (File.GetAttributes(folder) & FileAttributes.ReparsePoint) != 0
            )
                throw new IOException("图片目录是符号链接或目录联接，请选择普通文件夹。");
            Directory.CreateDirectory(folder);
            if ((File.GetAttributes(folder) & FileAttributes.ReparsePoint) != 0)
                throw new IOException("图片目录是符号链接或目录联接，请选择普通文件夹。");
            string name =
                "image-"
                + DateTime.UtcNow.ToString("yyyyMMdd-HHmmss")
                + "-"
                + Guid.NewGuid().ToString("N")
                + extension;
            string path = Path.Combine(folder, name);
            bool created = false;
            try
            {
                using (
                    var output = new FileStream(
                        path,
                        FileMode.CreateNew,
                        FileAccess.Write,
                        FileShare.None
                    )
                )
                {
                    created = true;
                    output.Write(bytes, 0, bytes.Length);
                    output.Flush(true);
                }
            }
            catch
            {
                if (created && File.Exists(path))
                    File.Delete(path);
                throw;
            }
            return Uri.EscapeDataString(assetName) + "/" + name;
        }

        static string Extension(string mime)
        {
            switch (mime)
            {
                case "image/png":
                    return ".png";
                case "image/jpeg":
                    return ".jpg";
                case "image/gif":
                    return ".gif";
                case "image/webp":
                    return ".webp";
                default:
                    throw new IOException("请选择 PNG、JPEG、GIF 或 WebP 图片。");
            }
        }

        static bool Matches(byte[] bytes, string mime)
        {
            if (mime == "image/png")
                return bytes.Length >= 8
                    && bytes[0] == 137
                    && bytes[1] == 80
                    && bytes[2] == 78
                    && bytes[3] == 71
                    && bytes[4] == 13
                    && bytes[5] == 10
                    && bytes[6] == 26
                    && bytes[7] == 10;
            if (mime == "image/jpeg")
                return bytes.Length >= 3 && bytes[0] == 255 && bytes[1] == 216 && bytes[2] == 255;
            if (mime == "image/gif")
                return bytes.Length >= 6
                    && bytes[0] == 71
                    && bytes[1] == 73
                    && bytes[2] == 70
                    && bytes[3] == 56
                    && (bytes[4] == 55 || bytes[4] == 57)
                    && bytes[5] == 97;
            if (mime == "image/webp")
                return bytes.Length >= 12
                    && bytes[0] == 82
                    && bytes[1] == 73
                    && bytes[2] == 70
                    && bytes[3] == 70
                    && bytes[8] == 87
                    && bytes[9] == 69
                    && bytes[10] == 66
                    && bytes[11] == 80;
            return false;
        }
    }
}
