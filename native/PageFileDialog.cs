using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Windows.Forms;

namespace FieldNotes
{
    enum FilePickerMode
    {
        Open,
        Save,
        Folder,
    }

    // A local file browser with explicit file type and overwrite checks.
    sealed class PageFileDialog : StyledDialog
    {
        readonly DialogStyle style;
        readonly FilePickerMode mode;
        readonly string[] extensions;
        readonly bool dark;
        readonly ListView list;
        readonly DialogInput address,
            filename;
        readonly DialogSelect filter;
        readonly Label status,
            location;
        readonly Button primary;
        string directory;
        public string[] SelectedPaths { get; private set; }

        PageFileDialog(
            string title,
            FilePickerMode mode,
            string initial,
            string name,
            string[] extensions,
            bool dark,
            bool multi
        )
        {
            this.mode = mode;
            this.extensions = extensions ?? new string[0];
            this.dark = dark;
            style = new DialogStyle(dark);
            Text = title;
            FormBorderStyle = FormBorderStyle.None;
            StartPosition = FormStartPosition.CenterParent;
            ShowInTaskbar = false;
            AutoScaleMode = AutoScaleMode.Dpi;
            ClientSize = new Size(860, 568);
            BackColor = style.Surface;
            Padding = new Padding(1);
            Font = new Font("Microsoft YaHei UI", 10.5F);
            style.Frame(this);

            var header = new Panel
            {
                Dock = DockStyle.Top,
                Height = 82,
                Width = 858,
                BackColor = style.Surface,
            };
            var accent = new Panel
            {
                Bounds = new Rectangle(26, 23, 30, 3),
                BackColor = style.Accent,
            };
            var eyebrow = style.Label("PAGECORE  /  FILE SYSTEM", 8F);
            eyebrow.ForeColor = style.Muted;
            eyebrow.Bounds = new Rectangle(68, 15, 400, 22);
            var heading = style.Label(title, 16F, true);
            heading.Bounds = new Rectangle(25, 38, 700, 32);
            var close = style.Button("×");
            close.FlatAppearance.BorderSize = 0;
            close.Font = new Font("Segoe UI", 16F);
            close.Bounds = new Rectangle(800, 22, 34, 34);
            close.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            close.DialogResult = DialogResult.Cancel;
            header.Controls.AddRange(new Control[] { accent, eyebrow, heading, close });
            EnableDrag(header, eyebrow, heading);

            var footer = new Panel
            {
                Dock = DockStyle.Bottom,
                Height = 118,
                Width = 858,
                BackColor = style.Background,
            };
            var line = new Panel
            {
                Dock = DockStyle.Top,
                Height = 1,
                BackColor = style.Line,
            };
            var nameLabel = style.Label(mode == FilePickerMode.Folder ? "位置" : "文件名", 10F);
            nameLabel.TextAlign = ContentAlignment.MiddleLeft;
            nameLabel.Bounds = new Rectangle(24, 18, 65, 36);
            filename = new DialogInput(style)
            {
                Bounds = new Rectangle(92, 18, 536, 36),
                BackColor = style.Surface,
                ForeColor = style.Ink,
                Text = name ?? "",
                Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right,
                AccessibleName = mode == FilePickerMode.Folder ? "所选文件夹" : "文件名",
                ReadOnly = mode == FilePickerMode.Folder,
            };
            filter = new DialogSelect(style)
            {
                Bounds = new Rectangle(640, 18, 194, 36),
                Anchor = AnchorStyles.Top | AnchorStyles.Right,
                BackColor = style.Surface,
                ForeColor = style.Ink,
                AccessibleName = "文件类型",
            };
            filter.Items.Add(
                mode == FilePickerMode.Folder ? "文件夹"
                : this.extensions.Contains(".md") ? "Markdown 文档"
                : this.extensions.Contains(".png") ? "图片文件"
                : String.Join(" / ", this.extensions).ToUpperInvariant()
            );
            if (mode == FilePickerMode.Open)
                filter.Items.Add("所有文件");
            filter.SelectedIndex = 0;
            filter.Enabled = mode == FilePickerMode.Open;
            filter.SelectedIndexChanged += (sender, e) => RefreshDirectory();
            status = style.Label("", 9F);
            status.ForeColor = style.Muted;
            status.Bounds = new Rectangle(184, 70, 414, 36);
            status.Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right;
            var cancel = style.Button("取消");
            cancel.Bounds = new Rectangle(618, 66, 100, 36);
            cancel.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            cancel.DialogResult = DialogResult.Cancel;
            primary = style.Button(
                mode == FilePickerMode.Save ? "保存"
                    : mode == FilePickerMode.Folder ? "选择文件夹"
                    : "打开",
                true
            );
            primary.Bounds = new Rectangle(730, 66, 104, 36);
            primary.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            primary.Click += (sender, e) => AcceptSelection();
            var create = style.Button("＋  新建文件夹");
            create.Bounds = new Rectangle(24, 66, 140, 36);
            create.Click += (sender, e) => CreateFolder();
            footer.Controls.AddRange(
                new Control[] { line, nameLabel, filename, filter, status, cancel, primary, create }
            );
            if (mode != FilePickerMode.Open)
            {
                filter.Visible = false;
                var fileType = style.Label(filter.Items[0].ToString(), 10F);
                fileType.Bounds = new Rectangle(640, 18, 194, 36);
                fileType.TextAlign = ContentAlignment.MiddleLeft;
                fileType.ForeColor = style.Muted;
                fileType.Anchor = AnchorStyles.Top | AnchorStyles.Right;
                footer.Controls.Add(fileType);
            }
            CancelButton = cancel;
            AcceptButton = primary;
            filename.KeyDown += (sender, e) =>
            {
                if (e.KeyCode == Keys.Enter)
                {
                    e.SuppressKeyPress = true;
                    AcceptSelection();
                }
            };

            var sidebar = new Panel
            {
                Dock = DockStyle.Left,
                Width = 168,
                BackColor = style.Background,
                AutoScroll = true,
                Padding = new Padding(14, 8, 14, 8),
            };
            var quick = new FlowLayoutPanel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                FlowDirection = FlowDirection.TopDown,
                WrapContents = false,
            };
            var quickTitle = style.Label("QUICK ACCESS", 8F);
            quickTitle.ForeColor = style.Muted;
            quickTitle.Size = new Size(130, 26);
            quick.Controls.Add(quickTitle);
            AddLocation(
                quick,
                "桌面",
                Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory)
            );
            AddLocation(
                quick,
                "文档",
                Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments)
            );
            AddLocation(
                quick,
                "下载",
                Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                    "Downloads"
                )
            );
            var driveTitle = style.Label("THIS PC", 8F);
            driveTitle.ForeColor = style.Muted;
            driveTitle.Size = new Size(130, 30);
            driveTitle.TextAlign = ContentAlignment.BottomLeft;
            quick.Controls.Add(driveTitle);
            foreach (var drive in DriveInfo.GetDrives())
                AddLocation(quick, drive.Name.TrimEnd('\\') + "  /  磁盘", drive.Name);
            sidebar.Controls.Add(quick);

            var body = new Panel
            {
                Dock = DockStyle.Fill,
                BackColor = style.Surface,
                Padding = new Padding(20, 0, 24, 12),
            };
            var navigation = new Panel
            {
                Dock = DockStyle.Top,
                Height = 52,
                Width = 646,
                BackColor = style.Surface,
            };
            var up = style.Button("↑");
            up.Font = new Font("Segoe UI", 12F);
            up.Bounds = new Rectangle(0, 0, 36, 36);
            up.AccessibleName = "上一级文件夹";
            up.Click += (sender, e) =>
            {
                if (directory == null)
                    return;
                var parent = Directory.GetParent(directory);
                if (parent != null)
                    Navigate(parent.FullName);
            };
            address = new DialogInput(style)
            {
                Bounds = new Rectangle(44, 0, 526, 36),
                Anchor = AnchorStyles.Top | AnchorStyles.Left | AnchorStyles.Right,
                BackColor = style.Surface,
                ForeColor = style.Ink,
                AccessibleName = "当前位置",
            };
            address.KeyDown += (sender, e) =>
            {
                if (e.KeyCode == Keys.Enter)
                {
                    e.SuppressKeyPress = true;
                    Navigate(address.Text);
                }
            };
            var refresh = style.Button("刷新");
            refresh.Bounds = new Rectangle(582, 0, 64, 36);
            refresh.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            refresh.Click += (sender, e) => RefreshDirectory();
            navigation.Controls.AddRange(new Control[] { up, address, refresh });
            list = new ListView
            {
                Dock = DockStyle.Fill,
                View = View.Details,
                FullRowSelect = true,
                HideSelection = false,
                MultiSelect = multi,
                BorderStyle = BorderStyle.None,
                BackColor = style.Surface,
                ForeColor = style.Ink,
                HeaderStyle = ColumnHeaderStyle.Nonclickable,
                AccessibleName = "文件和文件夹",
                OwnerDraw = true,
            };
            var rowHeight = new ImageList { ImageSize = new Size(1, 34) };
            style.ThemeScrollbars(list, dark);
            list.SmallImageList = rowHeight;
            Disposed += (sender, e) => rowHeight.Dispose();
            list.Columns.Add("名称", 370);
            list.Columns.Add("修改日期", 154);
            list.Columns.Add("类型", 72);
            list.DrawColumnHeader += DrawHeader;
            list.DrawItem += (sender, e) => { };
            list.DrawSubItem += DrawSubItem;
            list.Resize += (sender, e) =>
            {
                list.Columns[0].Width = Math.Max(
                    180,
                    list.ClientSize.Width - list.Columns[1].Width - list.Columns[2].Width - 4
                );
            };
            list.SelectedIndexChanged += (sender, e) =>
            {
                if (
                    mode != FilePickerMode.Folder
                    && list.SelectedItems.Count == 1
                    && !((FileEntry)list.SelectedItems[0].Tag).IsDirectory
                )
                    filename.Text = list.SelectedItems[0].Text;
                if (mode == FilePickerMode.Folder)
                    filename.Text =
                        list.SelectedItems.Count == 1
                            ? ((FileEntry)list.SelectedItems[0].Tag).Path
                            : directory;
            };
            list.ItemActivate += (sender, e) =>
            {
                if (list.SelectedItems.Count == 0)
                    return;
                var entry = (FileEntry)list.SelectedItems[0].Tag;
                if (entry.IsDirectory)
                    Navigate(entry.Path);
                else
                    AcceptSelection();
            };
            location = style.Label("", 9F);
            location.ForeColor = style.Muted;
            location.Height = 30;
            location.Dock = DockStyle.Top;
            body.Controls.Add(list);
            body.Controls.Add(location);
            body.Controls.Add(navigation);
            Controls.Add(body);
            Controls.Add(sidebar);
            Controls.Add(footer);
            Controls.Add(header);
            Navigate(
                String.IsNullOrEmpty(initial)
                    ? Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments)
                    : initial
            );
        }

        sealed class FileEntry
        {
            public string Path;
            public bool IsDirectory;
        }

        void AddLocation(FlowLayoutPanel panel, string text, string path)
        {
            if (String.IsNullOrEmpty(path))
                return;
            var button = style.Button(text);
            button.Size = new Size(132, 36);
            button.FlatAppearance.BorderSize = 0;
            button.TextAlign = ContentAlignment.MiddleLeft;
            button.BackColor = style.Background;
            button.Click += (sender, e) => Navigate(path);
            panel.Controls.Add(button);
        }

        void DrawHeader(object sender, DrawListViewColumnHeaderEventArgs e)
        {
            using (var background = new SolidBrush(style.Background))
                e.Graphics.FillRectangle(background, e.Bounds);
            TextRenderer.DrawText(
                e.Graphics,
                e.Header.Text,
                Font,
                new Rectangle(e.Bounds.X + 8, e.Bounds.Y, e.Bounds.Width - 12, e.Bounds.Height),
                style.Muted,
                TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis
            );
        }

        void DrawSubItem(object sender, DrawListViewSubItemEventArgs e)
        {
            bool selected = e.Item.Selected;
            using (var background = new SolidBrush(selected ? style.Soft : style.Surface))
                e.Graphics.FillRectangle(background, e.Bounds);
            Rectangle bounds = e.Bounds;
            bounds.X += e.ColumnIndex == 0 ? 34 : 8;
            bounds.Width -= e.ColumnIndex == 0 ? 38 : 12;
            if (e.ColumnIndex == 0)
            {
                var entry = (FileEntry)e.Item.Tag;
                var icon = new Rectangle(
                    e.Bounds.X + 7,
                    e.Bounds.Y + (e.Bounds.Height - 13) / 2,
                    14,
                    12
                );
                using (var pen = new Pen(selected ? style.Ink : style.Muted, 1F))
                {
                    if (entry.IsDirectory)
                    {
                        e.Graphics.DrawLines(
                            pen,
                            new[]
                            {
                                new Point(icon.Left, icon.Bottom),
                                new Point(icon.Left, icon.Top),
                                new Point(icon.Left + 5, icon.Top),
                                new Point(icon.Left + 7, icon.Top + 3),
                                new Point(icon.Right, icon.Top + 3),
                                new Point(icon.Right, icon.Bottom),
                                new Point(icon.Left, icon.Bottom),
                            }
                        );
                    }
                    else
                    {
                        e.Graphics.DrawRectangle(pen, icon);
                        e.Graphics.DrawLine(
                            pen,
                            icon.Left + 3,
                            icon.Top + 5,
                            icon.Right - 3,
                            icon.Top + 5
                        );
                    }
                }
                if (selected)
                    using (var marker = new SolidBrush(style.Accent))
                        e.Graphics.FillRectangle(
                            marker,
                            e.Bounds.X,
                            e.Bounds.Y,
                            3,
                            e.Bounds.Height
                        );
            }
            TextRenderer.DrawText(
                e.Graphics,
                e.SubItem.Text,
                Font,
                bounds,
                e.ColumnIndex == 0 ? style.Ink : style.Muted,
                TextFormatFlags.Left
                    | TextFormatFlags.VerticalCenter
                    | TextFormatFlags.EndEllipsis
                    | TextFormatFlags.NoPrefix
            );
        }

        void Navigate(string path)
        {
            try
            {
                string resolved = Path.GetFullPath(path);
                if (!Directory.Exists(resolved))
                    throw new IOException("文件夹不存在或无法访问。");
                var entries = new List<ListViewItem>();
                foreach (string item in Directory.EnumerateFileSystemEntries(resolved))
                {
                    FileAttributes attributes;
                    try
                    {
                        attributes = File.GetAttributes(item);
                    }
                    catch (IOException)
                    {
                        continue;
                    }
                    catch (UnauthorizedAccessException)
                    {
                        continue;
                    }
                    if ((attributes & (FileAttributes.Hidden | FileAttributes.System)) != 0)
                        continue;
                    bool isDirectory = (attributes & FileAttributes.Directory) != 0;
                    if (!isDirectory && mode == FilePickerMode.Folder)
                        continue;
                    if (
                        !isDirectory
                        && filter.SelectedIndex == 0
                        && !extensions.Contains(
                            Path.GetExtension(item),
                            StringComparer.OrdinalIgnoreCase
                        )
                    )
                        continue;
                    var row = new ListViewItem(Path.GetFileName(item));
                    row.Tag = new FileEntry { Path = item, IsDirectory = isDirectory };
                    row.SubItems.Add(File.GetLastWriteTime(item).ToString("yyyy-MM-dd  HH:mm"));
                    row.SubItems.Add(
                        isDirectory
                            ? "文件夹"
                            : Path.GetExtension(item).TrimStart('.').ToUpperInvariant()
                    );
                    entries.Add(row);
                    if (entries.Count >= 5000)
                        break;
                }
                directory = resolved;
                address.Text = resolved;
                if (mode == FilePickerMode.Folder)
                    filename.Text = resolved;
                else if (mode == FilePickerMode.Open)
                    filename.Clear();
                list.BeginUpdate();
                list.Items.Clear();
                list.Items.AddRange(
                    entries
                        .OrderByDescending(row => ((FileEntry)row.Tag).IsDirectory)
                        .ThenBy(row => row.Text, StringComparer.CurrentCultureIgnoreCase)
                        .ToArray()
                );
                list.EndUpdate();
                location.Text = "本地文件  /  " + entries.Count + " 项";
                status.Text =
                    entries.Count >= 5000 ? "仅显示前 5000 项，请进入更具体的文件夹。"
                    : mode == FilePickerMode.Folder ? "选择当前文件夹，或双击进入子文件夹。"
                    : mode == FilePickerMode.Save ? "输入文件名，确认保存位置。"
                    : "双击文件打开，或进入文件夹。";
            }
            catch (Exception error)
            {
                if (
                    !(error is IOException)
                    && !(error is UnauthorizedAccessException)
                    && !(error is ArgumentException)
                    && !(error is NotSupportedException)
                )
                    throw;
                status.Text = "无法打开此位置：" + error.Message;
                if (directory != null)
                    address.Text = directory;
            }
        }

        void RefreshDirectory()
        {
            if (directory != null && list != null)
                Navigate(directory);
        }

        void CreateFolder()
        {
            string name = PageNamePrompt.Show(this, dark);
            if (name == null)
                return;
            try
            {
                if (
                    String.IsNullOrWhiteSpace(name)
                    || name == "."
                    || name == ".."
                    || name.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0
                    || name.EndsWith(".")
                    || name.EndsWith(" ")
                )
                    throw new IOException("文件夹名称无效。");
                string path = Path.Combine(directory, name);
                if (File.Exists(path) || Directory.Exists(path))
                    throw new IOException("已有同名文件或文件夹。");
                Directory.CreateDirectory(path);
                Navigate(path);
            }
            catch (Exception error)
            {
                if (
                    !(error is IOException)
                    && !(error is UnauthorizedAccessException)
                    && !(error is ArgumentException)
                )
                    throw;
                status.Text = error.Message;
            }
        }

        void AcceptSelection()
        {
            try
            {
                if (directory == null)
                    throw new IOException("请选择可以访问的文件夹。");
                if (mode == FilePickerMode.Folder)
                {
                    if (
                        list.SelectedItems.Count == 1
                        && ((FileEntry)list.SelectedItems[0].Tag).IsDirectory
                    )
                        SelectedPaths = new[] { ((FileEntry)list.SelectedItems[0].Tag).Path };
                    else
                        SelectedPaths = new[] { directory };
                    DialogResult = DialogResult.OK;
                    return;
                }
                if (mode == FilePickerMode.Open && list.MultiSelect && list.SelectedItems.Count > 1)
                {
                    var chosen = list
                        .SelectedItems.Cast<ListViewItem>()
                        .Select(item => (FileEntry)item.Tag)
                        .ToArray();
                    if (
                        chosen.Any(item =>
                            item.IsDirectory
                            || !File.Exists(item.Path)
                            || !extensions.Contains(
                                Path.GetExtension(item.Path),
                                StringComparer.OrdinalIgnoreCase
                            )
                        )
                    )
                        throw new IOException("请选择有效的文件。");
                    SelectedPaths = chosen.Select(item => item.Path).ToArray();
                    DialogResult = DialogResult.OK;
                    return;
                }
                string name = filename.Text.Trim();
                if (String.IsNullOrEmpty(name))
                    throw new IOException("请输入文件名或选择文件。");
                string target = Path.GetFullPath(
                    Path.IsPathRooted(name) ? name : Path.Combine(directory, name)
                );
                if (Directory.Exists(target))
                {
                    Navigate(target);
                    return;
                }
                if (mode == FilePickerMode.Save && String.IsNullOrEmpty(Path.GetExtension(target)))
                    target += extensions[0];
                if (
                    !extensions.Contains(
                        Path.GetExtension(target),
                        StringComparer.OrdinalIgnoreCase
                    )
                )
                    throw new IOException("文件格式不受支持，请检查扩展名。");
                if (mode == FilePickerMode.Open && !File.Exists(target))
                    throw new IOException("文件不存在，请重新选择。");
                if (mode == FilePickerMode.Save)
                {
                    if (!Directory.Exists(Path.GetDirectoryName(target)))
                        throw new IOException("目标文件夹不存在。");
                    if (
                        File.Exists(target)
                        && PagePrompt.Ask(
                            this,
                            "替换现有文件？",
                            "“" + Path.GetFileName(target) + "”已存在。继续将替换原文件。",
                            "替换",
                            null,
                            dark
                        ) != DialogResult.Yes
                    )
                        return;
                }
                SelectedPaths = new[] { target };
                DialogResult = DialogResult.OK;
            }
            catch (Exception error)
            {
                if (
                    !(error is IOException)
                    && !(error is UnauthorizedAccessException)
                    && !(error is ArgumentException)
                    && !(error is NotSupportedException)
                )
                    throw;
                status.Text = error.Message;
            }
        }

        public static string[] Pick(
            IWin32Window owner,
            string title,
            FilePickerMode mode,
            string initial,
            string name,
            string[] extensions,
            bool dark,
            bool multi = false
        )
        {
            using (
                var picker = new PageFileDialog(title, mode, initial, name, extensions, dark, multi)
            )
                return picker.ShowDialog(owner) == DialogResult.OK ? picker.SelectedPaths : null;
        }

        public static void SelfTest(string root)
        {
            string folder = Path.Combine(root, "picker-test");
            Directory.CreateDirectory(folder);
            string source = Path.Combine(folder, "sample.md");
            File.WriteAllText(source, "test");
            using (
                var picker = new PageFileDialog(
                    "打开",
                    FilePickerMode.Open,
                    folder,
                    null,
                    new[] { ".md", ".txt" },
                    false,
                    false
                )
            )
            {
                picker.filename.Text = "sample.md";
                picker.AcceptSelection();
                if (picker.SelectedPaths == null || picker.SelectedPaths[0] != source)
                    throw new Exception("file picker must open the chosen file");
            }
            using (
                var picker = new PageFileDialog(
                    "保存",
                    FilePickerMode.Save,
                    folder,
                    null,
                    new[] { ".md" },
                    true,
                    false
                )
            )
            {
                picker.filename.Text = "new-note";
                picker.AcceptSelection();
                if (
                    picker.SelectedPaths == null
                    || picker.SelectedPaths[0] != Path.Combine(folder, "new-note.md")
                    || File.Exists(picker.SelectedPaths[0])
                )
                    throw new Exception(
                        "file picker must add the default extension without writing the file"
                    );
            }
            using (
                var picker = new PageFileDialog(
                    "打开",
                    FilePickerMode.Open,
                    folder,
                    null,
                    new[] { ".md" },
                    false,
                    false
                )
            )
            {
                picker.filename.Text = "missing.md";
                picker.AcceptSelection();
                if (picker.SelectedPaths != null || picker.DialogResult == DialogResult.OK)
                    throw new Exception("file picker must reject a missing file");
                picker.filename.Text = "other.exe";
                picker.AcceptSelection();
                if (picker.SelectedPaths != null || picker.DialogResult == DialogResult.OK)
                    throw new Exception("file picker must reject an unsupported extension");
            }
        }
    }
}
