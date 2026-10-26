using System;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace FieldNotes
{
    // Keep native moving, sizing and work-area maximization without system chrome.
    class BorderlessForm : Form
    {
        const int WmGetMinMaxInfo = 0x0024;
        const int WmNcCalcSize = 0x0083;
        const int WmNcLeftButtonDown = 0x00A1;
        const int WmNcLeftButtonDoubleClick = 0x00A3;
        const int HtCaption = 2;
        const int WsThickFrame = 0x00040000;
        const int WsMinimizeBox = 0x00020000;
        const int WsMaximizeBox = 0x00010000;
        const int WsSystemMenu = 0x00080000;
        const int WsCaption = 0x00C00000;
        const int DwmWindowCornerPreference = 33;
        const int DwmBorderColor = 34;

        [DllImport("user32.dll")]
        static extern bool ReleaseCapture();

        [DllImport("user32.dll")]
        static extern IntPtr SendMessage(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam);

        [DllImport("dwmapi.dll")]
        static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);

        [StructLayout(LayoutKind.Sequential)]
        struct MinMaxInfo
        {
            public Point Reserved,
                MaxSize,
                MaxPosition,
                MinTrackSize,
                MaxTrackSize;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct NativeRect
        {
            public int Left,
                Top,
                Right,
                Bottom;
        }

        public BorderlessForm()
        {
            FormBorderStyle = FormBorderStyle.None;
        }

        protected override CreateParams CreateParams
        {
            get
            {
                var p = base.CreateParams;
                p.Style |= WsThickFrame | WsMinimizeBox | WsMaximizeBox | WsSystemMenu | WsCaption;
                return p;
            }
        }

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            try
            {
                int square = 1,
                    none = unchecked((int)0xFFFFFFFE);
                DwmSetWindowAttribute(Handle, DwmWindowCornerPreference, ref square, sizeof(int));
                DwmSetWindowAttribute(Handle, DwmBorderColor, ref none, sizeof(int));
            }
            catch (DllNotFoundException) { }
            catch (EntryPointNotFoundException) { }
        }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == WmNcCalcSize)
            {
                if (m.WParam != IntPtr.Zero && WindowState == FormWindowState.Maximized)
                {
                    var work = Screen.FromHandle(Handle).WorkingArea;
                    Marshal.StructureToPtr(
                        new NativeRect
                        {
                            Left = work.Left,
                            Top = work.Top,
                            Right = work.Right,
                            Bottom = work.Bottom,
                        },
                        m.LParam,
                        false
                    );
                }
                m.Result = IntPtr.Zero;
                return;
            }
            if (m.Msg == WmNcLeftButtonDoubleClick && m.WParam.ToInt32() == HtCaption)
            {
                ToggleWindowMaximize();
                m.Result = IntPtr.Zero;
                return;
            }
            if (m.Msg == WmGetMinMaxInfo)
            {
                base.WndProc(ref m);
                var info = (MinMaxInfo)Marshal.PtrToStructure(m.LParam, typeof(MinMaxInfo));
                var screen = Screen.FromHandle(Handle);
                var work = screen.WorkingArea;
                var bounds = screen.Bounds;
                info.MaxPosition = new Point(work.Left - bounds.Left, work.Top - bounds.Top);
                info.MaxSize = new Point(work.Width, work.Height);
                info.MinTrackSize = new Point(MinimumSize.Width, MinimumSize.Height);
                Marshal.StructureToPtr(info, m.LParam, false);
                m.Result = IntPtr.Zero;
                return;
            }
            base.WndProc(ref m);
        }

        protected void ToggleWindowMaximize()
        {
            WindowState =
                WindowState == FormWindowState.Maximized
                    ? FormWindowState.Normal
                    : FormWindowState.Maximized;
        }

        protected void StartWindowInteraction(string edge)
        {
            int hit = HtCaption;
            if (edge != null)
            {
                switch (edge)
                {
                    case "w":
                        hit = 10;
                        break;
                    case "e":
                        hit = 11;
                        break;
                    case "n":
                        hit = 12;
                        break;
                    case "nw":
                        hit = 13;
                        break;
                    case "ne":
                        hit = 14;
                        break;
                    case "s":
                        hit = 15;
                        break;
                    case "sw":
                        hit = 16;
                        break;
                    case "se":
                        hit = 17;
                        break;
                    default:
                        return;
                }
                if (WindowState == FormWindowState.Maximized)
                    return;
            }
            ReleaseCapture();
            var point = Cursor.Position;
            int packed = (point.Y << 16) | (point.X & 0xFFFF);
            SendMessage(Handle, WmNcLeftButtonDown, new IntPtr(hit), new IntPtr(packed));
        }
    }
}
