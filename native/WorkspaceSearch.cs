using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading;

namespace FieldNotes
{
    sealed class SearchHit
    {
        public string path,
            preview,
            match;
        public int line,
            column,
            length,
            previewColumn;
        public bool unsaved;
    }

    sealed class SearchResults
    {
        public readonly List<SearchHit> hits = new List<SearchHit>();
        public int scanned,
            skipped;
        public bool limited;
    }

    static class WorkspaceSearch
    {
        // Search is literal, bounded and cancellable; never traverse links outside the selected root.
        public static SearchResults Run(
            string root,
            string query,
            bool matchCase,
            Dictionary<string, string> openText,
            CancellationToken cancel
        )
        {
            if (
                String.IsNullOrWhiteSpace(query)
                || query.Length > 200
                || query.Contains("\n")
                || query.Contains("\r")
            )
                throw new IOException("请输入 1–200 个字符的单行搜索词。");
            var folder = new FolderWorkspace();
            folder.Open(root);
            var results = new SearchResults();
            var queue = new Queue<string>();
            queue.Enqueue("");
            var watch = Stopwatch.StartNew();
            long bytes = 0;
            int visited = 0;
            var comparison = matchCase
                ? StringComparison.Ordinal
                : StringComparison.OrdinalIgnoreCase;
            while (queue.Count > 0)
            {
                cancel.ThrowIfCancellationRequested();
                string relative = queue.Dequeue();
                try
                {
                    string directory = folder.Resolve(relative);
                    foreach (var path in Directory.EnumerateFileSystemEntries(directory))
                    {
                        cancel.ThrowIfCancellationRequested();
                        if (
                            ++visited > 10000
                            || watch.ElapsedMilliseconds > 10000
                            || results.scanned >= 2000
                            || bytes > 30 * 1024 * 1024
                        )
                        {
                            results.limited = true;
                            return results;
                        }
                        try
                        {
                            var attributes = File.GetAttributes(path);
                            if (
                                (
                                    attributes
                                    & (
                                        FileAttributes.ReparsePoint
                                        | FileAttributes.Hidden
                                        | FileAttributes.System
                                    )
                                ) != 0
                            )
                                continue;
                            string name = Path.GetFileName(path);
                            string child = String.IsNullOrEmpty(relative)
                                ? name
                                : relative + "/" + name;
                            if ((attributes & FileAttributes.Directory) != 0)
                            {
                                if (
                                    !new[]
                                    {
                                        ".git",
                                        ".runtime",
                                        "node_modules",
                                        ".pnpm-store",
                                    }.Contains(name, StringComparer.OrdinalIgnoreCase)
                                )
                                    queue.Enqueue(child);
                                continue;
                            }
                            if (!DocumentSession.Allowed(path))
                                continue;
                            string text;
                            bool unsaved = openText.TryGetValue(path, out text);
                            if (!unsaved)
                            {
                                if (new FileInfo(path).Length > 2 * 1024 * 1024)
                                {
                                    results.skipped++;
                                    continue;
                                }
                                var doc = new DocumentSession();
                                doc.Open(folder.FilePath(child));
                                text = doc.Text;
                            }
                            bytes += text.Length * 2L;
                            results.scanned++;
                            int start = 0,
                                line = 1;
                            while (start <= text.Length)
                            {
                                cancel.ThrowIfCancellationRequested();
                                int end = text.IndexOf('\n', start);
                                if (end < 0)
                                    end = text.Length;
                                int offset = start;
                                while (offset < end)
                                {
                                    int index = text.IndexOf(
                                        query,
                                        offset,
                                        end - offset,
                                        comparison
                                    );
                                    if (index < 0)
                                        break;
                                    int from = Math.Max(start, index - 50);
                                    int count = Math.Min(
                                        end - from,
                                        Math.Max(180, query.Length + 80)
                                    );
                                    results.hits.Add(
                                        new SearchHit
                                        {
                                            path = child,
                                            line = line,
                                            column = index - start,
                                            length = query.Length,
                                            match = text.Substring(index, query.Length),
                                            preview = text.Substring(from, count),
                                            previewColumn = index - from,
                                            unsaved = unsaved,
                                        }
                                    );
                                    if (results.hits.Count >= 300)
                                    {
                                        results.limited = true;
                                        return results;
                                    }
                                    offset = index + query.Length;
                                }
                                if (end == text.Length)
                                    break;
                                start = end + 1;
                                line++;
                            }
                        }
                        catch (IOException)
                        {
                            results.skipped++;
                        }
                        catch (UnauthorizedAccessException)
                        {
                            results.skipped++;
                        }
                        catch (System.Text.DecoderFallbackException)
                        {
                            results.skipped++;
                        }
                    }
                }
                catch (IOException)
                {
                    results.skipped++;
                }
                catch (UnauthorizedAccessException)
                {
                    results.skipped++;
                }
            }
            return results;
        }
    }
}
