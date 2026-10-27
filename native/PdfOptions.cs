using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using Microsoft.Web.WebView2.Core;

namespace FieldNotes
{
    sealed class PdfOptions
    {
        public string Paper = "A4";
        public bool Landscape;
        public double Top = 18,
            Bottom = 18,
            Left = 16,
            Right = 16;
        public bool HasRunningText;

        public static PdfOptions Parse(Dictionary<string, object> values)
        {
            var result = new PdfOptions();
            if (values == null)
                return result;
            string paper = Text(values, "paper");
            if (paper != "A4" && paper != "A5" && paper != "Letter")
                throw new IOException("不支持的 PDF 纸张。");
            result.Paper = paper;
            string orientation = Text(values, "orientation");
            if (orientation != "portrait" && orientation != "landscape")
                throw new IOException("不支持的 PDF 页面方向。");
            result.Landscape = orientation == "landscape";
            result.Top = Margin(values, "marginTop");
            result.Bottom = Margin(values, "marginBottom");
            result.Left = Margin(values, "marginLeft");
            result.Right = Margin(values, "marginRight");
            string header = Text(values, "header"),
                footer = Text(values, "footer");
            object pageNumbers;
            bool numbers =
                values.TryGetValue("pageNumbers", out pageNumbers)
                && pageNumbers is bool
                && (bool)pageNumbers;
            if (header.Length > 60 || footer.Length > 60)
                throw new IOException("页眉和页脚最多各 60 个字符。");
            if (
                (header.Length > 0 && result.Top < 12)
                || ((footer.Length > 0 || numbers) && result.Bottom < 12)
            )
                throw new IOException("页眉、页脚或页码需要至少 12 mm 的对应页边距。");
            result.HasRunningText = header.Length > 0 || footer.Length > 0 || numbers;
            return result;
        }

        static string Text(Dictionary<string, object> values, string key)
        {
            object value;
            return values.TryGetValue(key, out value) ? value as string ?? "" : "";
        }

        static double Margin(Dictionary<string, object> values, string key)
        {
            object value;
            double number;
            if (
                !values.TryGetValue(key, out value)
                || value is bool
                || !Double.TryParse(
                    Convert.ToString(value, CultureInfo.InvariantCulture),
                    NumberStyles.Float,
                    CultureInfo.InvariantCulture,
                    out number
                )
                || Double.IsNaN(number)
                || number < 5
                || number > 40
            )
                throw new IOException("PDF 页边距必须为 5–40 mm。");
            return number;
        }

        public void Apply(CoreWebView2PrintSettings settings)
        {
            settings.Orientation = Landscape
                ? CoreWebView2PrintOrientation.Landscape
                : CoreWebView2PrintOrientation.Portrait;
            settings.PageWidth =
                (
                    Paper == "A5" ? 148
                    : Paper == "Letter" ? 215.9
                    : 210
                ) / 25.4;
            settings.PageHeight =
                (
                    Paper == "A5" ? 210
                    : Paper == "Letter" ? 279.4
                    : 297
                ) / 25.4;
            settings.MarginTop = Top / 25.4;
            settings.MarginBottom = Bottom / 25.4;
            settings.MarginLeft = Left / 25.4;
            settings.MarginRight = Right / 25.4;
        }
    }
}
