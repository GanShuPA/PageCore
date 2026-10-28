using System;
using System.Collections.Generic;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace FieldNotes
{
    abstract class StyledDialog : Form
    {
        protected StyledDialog()
        {
            AutoScaleDimensions = new SizeF(96F, 96F);
            AutoScaleMode = AutoScaleMode.Dpi;
            Font = new Font("Microsoft YaHei UI", 10.5F);
        }

        [DllImport("user32.dll")]
        static extern bool ReleaseCapture();

        [DllImport("user32.dll")]
        static extern IntPtr SendMessage(IntPtr window, int message, IntPtr wParam, IntPtr lParam);

        protected override CreateParams CreateParams
        {
            get
            {
                var parameters = base.CreateParams;
                parameters.ClassStyle |= 0x00020000;
                return parameters;
            }
        }

        protected void EnableDrag(params Control[] controls)
        {
            foreach (Control control in controls)
                control.MouseDown += (sender, e) =>
                {
                    if (e.Button != MouseButtons.Left)
                        return;
                    ReleaseCapture();
                    SendMessage(Handle, 0x00A1, new IntPtr(2), IntPtr.Zero);
                };
        }
    }

    // Keep single-line text vertically centered without using multiline editing semantics.
    sealed class DialogInput : UserControl
    {
        readonly TextBox editor;
        readonly DialogStyle style;

        public DialogInput(DialogStyle style)
        {
            this.style = style;
            BackColor = style.Surface;
            ForeColor = style.Ink;
            TabStop = false;
            editor = new TextBox
            {
                BorderStyle = BorderStyle.None,
                BackColor = BackColor,
                ForeColor = ForeColor,
            };
            editor.KeyDown += (sender, e) => OnKeyDown(e);
            editor.Enter += (sender, e) => Invalidate();
            editor.Leave += (sender, e) => Invalidate();
            Controls.Add(editor);
        }

        public override string Text
        {
            get { return editor == null ? "" : editor.Text; }
            set
            {
                if (editor != null)
                    editor.Text = value;
            }
        }

        public bool ReadOnly
        {
            get { return editor.ReadOnly; }
            set { editor.ReadOnly = value; }
        }

        public void Clear()
        {
            editor.Clear();
        }

        protected override void OnLayout(LayoutEventArgs e)
        {
            base.OnLayout(e);
            if (editor != null)
                editor.Bounds = new Rectangle(
                    10,
                    Math.Max(2, (Height - editor.PreferredHeight) / 2),
                    Math.Max(1, Width - 20),
                    editor.PreferredHeight
                );
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            editor.AccessibleName = AccessibleName;
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            using (var pen = new Pen(ContainsFocus ? style.Muted : style.Line))
                e.Graphics.DrawRectangle(pen, 0, 0, Width - 1, Height - 1);
        }
    }

    sealed class DialogSelect : Control
    {
        readonly DialogStyle style;
        int selectedIndex = -1;
        public readonly List<string> Items = new List<string>();
        public event EventHandler SelectedIndexChanged;

        public DialogSelect(DialogStyle style)
        {
            this.style = style;
            BackColor = style.Surface;
            ForeColor = style.Ink;
            AccessibleRole = AccessibleRole.ComboBox;
            Cursor = Cursors.Hand;
            SetStyle(
                ControlStyles.Selectable
                    | ControlStyles.UserPaint
                    | ControlStyles.OptimizedDoubleBuffer,
                true
            );
            TabStop = true;
        }

        public int SelectedIndex
        {
            get { return selectedIndex; }
            set
            {
                if (value == selectedIndex)
                    return;
                selectedIndex = value;
                Invalidate();
                if (SelectedIndexChanged != null)
                    SelectedIndexChanged(this, EventArgs.Empty);
            }
        }

        protected override void OnClick(EventArgs e)
        {
            base.OnClick(e);
            Focus();
            var menu = new ContextMenuStrip
            {
                ShowImageMargin = false,
                Font = Font,
                BackColor = style.Surface,
                ForeColor = style.Ink,
                Renderer = new MenuRenderer(style),
            };
            for (int i = 0; i < Items.Count; i++)
            {
                int index = i;
                var item = menu.Items.Add(Items[i]);
                item.Click += (sender, args) => SelectedIndex = index;
            }
            menu.Closed += (sender, args) => menu.Dispose();
            menu.Show(this, new Point(0, Height));
        }

        protected override void OnKeyDown(KeyEventArgs e)
        {
            base.OnKeyDown(e);
            if (e.KeyCode == Keys.Space || (e.Alt && e.KeyCode == Keys.Down))
            {
                OnClick(EventArgs.Empty);
                e.SuppressKeyPress = true;
            }
            else if (e.KeyCode == Keys.Down || e.KeyCode == Keys.Up)
            {
                SelectedIndex = Math.Max(
                    0,
                    Math.Min(Items.Count - 1, SelectedIndex + (e.KeyCode == Keys.Down ? 1 : -1))
                );
                e.SuppressKeyPress = true;
            }
        }

        protected override bool IsInputKey(Keys keyData)
        {
            return keyData == Keys.Up || keyData == Keys.Down || base.IsInputKey(keyData);
        }

        protected override void OnGotFocus(EventArgs e)
        {
            base.OnGotFocus(e);
            Invalidate();
        }

        protected override void OnLostFocus(EventArgs e)
        {
            base.OnLostFocus(e);
            Invalidate();
        }

        protected override void OnPaint(PaintEventArgs e)
        {
            base.OnPaint(e);
            using (var pen = new Pen(Focused ? style.Muted : style.Line))
                e.Graphics.DrawRectangle(pen, 0, 0, Width - 1, Height - 1);
            if (SelectedIndex >= 0 && SelectedIndex < Items.Count)
                TextRenderer.DrawText(
                    e.Graphics,
                    Items[SelectedIndex],
                    Font,
                    new Rectangle(10, 0, Width - 36, Height),
                    style.Ink,
                    TextFormatFlags.Left
                        | TextFormatFlags.VerticalCenter
                        | TextFormatFlags.EndEllipsis
                );
            using (var pen = new Pen(style.Muted))
                e.Graphics.DrawLines(
                    pen,
                    new[]
                    {
                        new Point(Width - 20, Height / 2 - 2),
                        new Point(Width - 16, Height / 2 + 2),
                        new Point(Width - 12, Height / 2 - 2),
                    }
                );
        }

        sealed class MenuRenderer : ToolStripProfessionalRenderer
        {
            readonly DialogStyle style;

            public MenuRenderer(DialogStyle style)
            {
                this.style = style;
            }

            protected override void OnRenderMenuItemBackground(ToolStripItemRenderEventArgs e)
            {
                using (var brush = new SolidBrush(e.Item.Selected ? style.Soft : style.Surface))
                    e.Graphics.FillRectangle(brush, new Rectangle(Point.Empty, e.Item.Size));
                e.Item.ForeColor = style.Ink;
            }
        }
    }

    sealed class DialogStyle
    {
        [DllImport("uxtheme.dll", CharSet = CharSet.Unicode)]
        static extern int SetWindowTheme(IntPtr window, string theme, string subIdList);

        public void ThemeScrollbars(Control control, bool dark)
        {
            control.HandleCreated += (sender, e) =>
                SetWindowTheme(control.Handle, dark ? "DarkMode_Explorer" : "Explorer", null);
        }

        public readonly Color Background,
            Surface,
            Ink,
            Muted,
            Line,
            Accent,
            Soft;

        public DialogStyle(bool dark)
        {
            Background = ColorTranslator.FromHtml(dark ? "#252b27" : "#e9ebe5");
            Surface = ColorTranslator.FromHtml(dark ? "#2c332e" : "#fafbf6");
            Ink = ColorTranslator.FromHtml(dark ? "#e3e8db" : "#29312b");
            Muted = ColorTranslator.FromHtml(dark ? "#a1ac9e" : "#7a8277");
            Line = ColorTranslator.FromHtml(dark ? "#414b42" : "#cdd2c7");
            Soft = ColorTranslator.FromHtml(dark ? "#353e35" : "#eff2e7");
            Accent = ColorTranslator.FromHtml("#ddec45");
        }

        public Button Button(string text, bool primary = false)
        {
            var button = new Button
            {
                Text = text,
                FlatStyle = FlatStyle.Flat,
                BackColor = primary ? Ink : Surface,
                ForeColor = primary ? Surface : Ink,
                Cursor = Cursors.Hand,
                UseVisualStyleBackColor = false,
                Font = new Font("Microsoft YaHei UI", 10.5F),
            };
            button.FlatAppearance.BorderColor = primary ? Ink : Line;
            button.FlatAppearance.MouseOverBackColor = primary ? Muted : Soft;
            return button;
        }

        public Label Label(string text, float size, bool bold = false)
        {
            return new Label
            {
                Text = text,
                ForeColor = Ink,
                BackColor = Color.Transparent,
                Font = new Font(
                    "Microsoft YaHei UI",
                    size,
                    bold ? FontStyle.Bold : FontStyle.Regular
                ),
                AutoEllipsis = true,
            };
        }

        public void Frame(Form form)
        {
            form.Paint += (sender, e) =>
            {
                using (var pen = new Pen(Line))
                    e.Graphics.DrawRectangle(
                        pen,
                        0,
                        0,
                        form.ClientSize.Width - 1,
                        form.ClientSize.Height - 1
                    );
            };
        }
    }

    sealed class PagePrompt : StyledDialog
    {
        PagePrompt(string title, string message, string primary, string secondary, bool dark)
        {
            var style = new DialogStyle(dark);
            FormBorderStyle = FormBorderStyle.None;
            StartPosition = FormStartPosition.CenterParent;
            ShowInTaskbar = false;
            AutoScaleMode = AutoScaleMode.Dpi;
            int bodyHeight = Math.Max(
                54,
                Math.Min(
                    200,
                    TextRenderer
                        .MeasureText(message, Font, new Size(464, 0), TextFormatFlags.WordBreak)
                        .Height + 10
                )
            );
            int actionsY = 114 + bodyHeight + 30;
            ClientSize = new Size(520, actionsY + 60);
            BackColor = style.Surface;
            Font = new Font("Microsoft YaHei UI", 10.5F);
            Text = title;
            style.Frame(this);
            var marker = new Panel
            {
                BackColor = style.Accent,
                Bounds = new Rectangle(26, 26, 32, 3),
            };
            var eyebrow = style.Label("PAGECORE  /  CONFIRM", 8F);
            eyebrow.ForeColor = style.Muted;
            eyebrow.Bounds = new Rectangle(70, 18, 300, 22);
            var heading = style.Label(title, 16F, true);
            heading.Bounds = new Rectangle(26, 52, 465, 42);
            var body = style.Label(message, 10.5F);
            body.Bounds = new Rectangle(28, 105, 464, bodyHeight);
            var rule = new Panel
            {
                BackColor = style.Line,
                Bounds = new Rectangle(28, actionsY - 18, 464, 1),
            };
            var cancel = style.Button("取消");
            cancel.Bounds = new Rectangle(28, actionsY, 100, 36);
            cancel.DialogResult = DialogResult.Cancel;
            var yes = style.Button(primary, true);
            yes.Bounds = new Rectangle(382, actionsY, 110, 36);
            yes.DialogResult = DialogResult.Yes;
            var close = style.Button("×");
            close.FlatAppearance.BorderSize = 0;
            close.Font = new Font("Segoe UI", 16F);
            close.Bounds = new Rectangle(478, 8, 32, 32);
            close.DialogResult = DialogResult.Cancel;
            Controls.AddRange(
                new Control[] { marker, eyebrow, heading, body, rule, cancel, yes, close }
            );
            EnableDrag(eyebrow, heading);
            if (secondary != null)
            {
                var no = style.Button(secondary);
                no.Bounds = new Rectangle(260, actionsY, 110, 36);
                no.DialogResult = DialogResult.No;
                Controls.Add(no);
            }
            CancelButton = cancel;
            AcceptButton = yes;
        }

        public static DialogResult Ask(
            IWin32Window owner,
            string title,
            string message,
            string primary,
            string secondary,
            bool dark
        )
        {
            using (var prompt = new PagePrompt(title, message, primary, secondary, dark))
                return owner == null ? prompt.ShowDialog() : prompt.ShowDialog(owner);
        }

        public static void SelfTest()
        {
            using (var prompt = new PagePrompt("保存更改", "内容未保存", "保存", "不保存", false))
            {
                if (
                    prompt.AcceptButton == null
                    || prompt.AcceptButton.DialogResult != DialogResult.Yes
                    || prompt.CancelButton == null
                    || prompt.CancelButton.DialogResult != DialogResult.Cancel
                )
                    throw new Exception(
                        "confirmation defaults must preserve save and cancel behavior"
                    );
                bool hasDiscard = false;
                foreach (Control control in prompt.Controls)
                {
                    var button = control as Button;
                    if (
                        button != null
                        && button.Text == "不保存"
                        && button.DialogResult == DialogResult.No
                    )
                        hasDiscard = true;
                }
                if (!hasDiscard)
                    throw new Exception("confirmation must expose a distinct discard choice");
            }
        }
    }

    sealed class PageNamePrompt : StyledDialog
    {
        readonly DialogInput name;

        PageNamePrompt(bool dark)
        {
            var style = new DialogStyle(dark);
            FormBorderStyle = FormBorderStyle.None;
            StartPosition = FormStartPosition.CenterParent;
            ShowInTaskbar = false;
            AutoScaleMode = AutoScaleMode.Dpi;
            ClientSize = new Size(450, 226);
            BackColor = style.Surface;
            Text = "新建文件夹";
            style.Frame(this);
            var eyebrow = style.Label("PAGECORE  /  FILE SYSTEM", 8F);
            eyebrow.ForeColor = style.Muted;
            eyebrow.Bounds = new Rectangle(68, 18, 300, 22);
            var accent = new Panel
            {
                BackColor = style.Accent,
                Bounds = new Rectangle(26, 26, 30, 3),
            };
            var title = style.Label("新建文件夹", 16F, true);
            title.Bounds = new Rectangle(25, 46, 350, 36);
            name = new DialogInput(style)
            {
                Bounds = new Rectangle(26, 96, 398, 36),
                BackColor = style.Surface,
                ForeColor = style.Ink,
                AccessibleName = "文件夹名称",
            };
            var cancel = style.Button("取消");
            cancel.Bounds = new Rectangle(200, 160, 100, 38);
            cancel.DialogResult = DialogResult.Cancel;
            var create = style.Button("创建", true);
            create.Bounds = new Rectangle(314, 160, 110, 38);
            create.DialogResult = DialogResult.OK;
            var close = style.Button("×");
            close.FlatAppearance.BorderSize = 0;
            close.Font = new Font("Segoe UI", 16F);
            close.Bounds = new Rectangle(408, 8, 32, 32);
            close.DialogResult = DialogResult.Cancel;
            Controls.AddRange(
                new Control[] { accent, eyebrow, title, name, cancel, create, close }
            );
            EnableDrag(eyebrow, title);
            AcceptButton = create;
            CancelButton = cancel;
        }

        public static string Show(IWin32Window owner, bool dark)
        {
            using (var prompt = new PageNamePrompt(dark))
                return prompt.ShowDialog(owner) == DialogResult.OK ? prompt.name.Text : null;
        }
    }
}
