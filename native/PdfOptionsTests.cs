using System;
using System.Collections.Generic;
using System.IO;

namespace FieldNotes
{
    static class PdfOptionsTests
    {
        public static void Run()
        {
            var values = new Dictionary<string, object>
            {
                { "paper", "A5" },
                { "orientation", "landscape" },
                { "marginTop", 20 },
                { "marginBottom", 18 },
                { "marginLeft", 10 },
                { "marginRight", 12 },
                { "header", "中文页眉" },
                { "footer", "页脚" },
                { "pageNumbers", true },
            };
            var parsed = PdfOptions.Parse(values);
            if (
                parsed.Paper != "A5"
                || !parsed.Landscape
                || parsed.Top != 20
                || parsed.Left != 10
                || !parsed.HasRunningText
            )
                throw new Exception("PDF options were not preserved");
            foreach (
                object invalid in new object[]
                {
                    -1,
                    41,
                    Double.NaN,
                    Double.PositiveInfinity,
                    true,
                    "invalid",
                }
            )
            {
                values["marginTop"] = invalid;
                ExpectRejection(values);
            }
            values["marginTop"] = 5;
            ExpectRejection(values);
            values["marginTop"] = 20;
            values["marginBottom"] = 5;
            ExpectRejection(values);
            values["marginBottom"] = 18;
            values["paper"] = "bad";
            ExpectRejection(values);
            if (PdfOptions.Parse(null).Paper != "A4")
                throw new Exception("Legacy PDF defaults changed");
        }

        static void ExpectRejection(Dictionary<string, object> values)
        {
            try
            {
                PdfOptions.Parse(values);
            }
            catch (IOException)
            {
                return;
            }
            throw new Exception("Invalid PDF options were accepted");
        }
    }
}
