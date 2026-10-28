using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace FieldNotes
{
    sealed partial class StudioForm
    {
        readonly Dictionary<string, string> selectedImages = new Dictionary<string, string>();

        object ChooseImages(bool multiple)
        {
            string initial =
                doc.PathName == null ? folders.Root : Path.GetDirectoryName(doc.PathName);
            if (String.IsNullOrEmpty(initial) || !Directory.Exists(initial))
                initial = Environment.GetFolderPath(Environment.SpecialFolder.MyPictures);
            if (String.IsNullOrEmpty(initial) || !Directory.Exists(initial))
                initial = Program.Root;
            var paths = PageFileDialog.Pick(
                this,
                "选择图片",
                FilePickerMode.Open,
                initial,
                null,
                new[] { ".png", ".jpg", ".jpeg", ".gif", ".webp" },
                darkTheme,
                multiple
            );
            selectedImages.Clear();
            if (paths == null)
                return null;
            var items = new List<object>();
            foreach (string path in paths)
            {
                var info = new FileInfo(path);
                if (!info.Exists || info.Length == 0 || info.Length > ImageStore.MaxBytes)
                    throw new IOException("图片不存在、为空或超过 10 MB：" + info.Name);
                string ext = info.Extension.ToLowerInvariant();
                string mime =
                    ext == ".png" ? "image/png"
                    : ext == ".gif" ? "image/gif"
                    : ext == ".webp" ? "image/webp"
                    : "image/jpeg";
                string token = Guid.NewGuid().ToString("N");
                selectedImages.Add(token, path);
                items.Add(
                    new
                    {
                        token,
                        name = info.Name,
                        size = info.Length,
                        mime,
                    }
                );
            }
            return new { files = items.ToArray() };
        }

        object ReadChosenImage(string token)
        {
            string path;
            if (token == null || !selectedImages.TryGetValue(token, out path))
                throw new IOException("图片选择已过期，请重新选择。");
            selectedImages.Remove(token);
            var info = new FileInfo(path);
            if (!info.Exists || info.Length == 0 || info.Length > ImageStore.MaxBytes)
                throw new IOException("图片不存在、为空或超过 10 MB。");
            using (var input = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))
            {
                if (input.Length == 0 || input.Length > ImageStore.MaxBytes)
                    throw new IOException("图片为空或超过 10 MB。");
                var bytes = new byte[(int)input.Length];
                int offset = 0;
                while (offset < bytes.Length)
                {
                    int count = input.Read(bytes, offset, bytes.Length - offset);
                    if (count == 0)
                        throw new IOException("图片读取不完整，请重新选择。");
                    offset += count;
                }
                return new { base64 = Convert.ToBase64String(bytes) };
            }
        }
    }
}
