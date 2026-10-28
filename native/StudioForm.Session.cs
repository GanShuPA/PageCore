using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace FieldNotes
{
    sealed partial class StudioForm
    {
        CancellationTokenSource searchCancellation;
        string SessionPath
        {
            get { return Path.Combine(Program.Data, "session.json"); }
        }
        bool sessionReady;

        void PersistSession()
        {
            if (!sessionReady || closing)
                return;
            try
            {
                SessionStore.Save(SessionPath, workspace, workspace.Active.Id);
            }
            catch (Exception ex)
            {
                Send(new { type = "notice", message = "会话记录未能保存：" + ex.Message });
            }
        }

        void SyncView(Dictionary<string, object> message)
        {
            object value;
            var tab = workspace.Find(Get(message, "tabId"));
            if (tab == null || !message.TryGetValue("view", out value))
                return;
            try
            {
                tab.View = json.Deserialize<TabView>(json.Serialize(value));
            }
            catch { }
        }

        object[] SessionDocuments()
        {
            var active = workspace.Active.Id;
            var documents = new List<object>();
            foreach (var tab in workspace.Tabs)
            {
                workspace.Select(tab.Id);
                documents.Add(Payload());
            }
            workspace.Select(active);
            return documents.ToArray();
        }

        async Task<object> SearchWorkspace(Dictionary<string, object> message)
        {
            if (searchCancellation != null)
                searchCancellation.Cancel();
            string root = folders.Root;
            if (root == null)
                throw new IOException("请先打开工作区文件夹。");
            var cancel = new CancellationTokenSource();
            searchCancellation = cancel;
            string query = Get(message, "query");
            object option;
            bool matchCase =
                message.TryGetValue("matchCase", out option) && option is bool && (bool)option;
            var openText = workspace
                .Tabs.Where(t => t.Document.PathName != null && t.Document.Dirty)
                .ToDictionary(
                    t => t.Document.PathName,
                    t => t.Document.Text,
                    StringComparer.OrdinalIgnoreCase
                );
            try
            {
                return await Task.Run(() =>
                    WorkspaceSearch.Run(root, query, matchCase, openText, cancel.Token)
                );
            }
            catch (OperationCanceledException)
            {
                return new { cancelled = true };
            }
            finally
            {
                if (searchCancellation == cancel)
                    searchCancellation = null;
                cancel.Dispose();
            }
        }
    }
}
