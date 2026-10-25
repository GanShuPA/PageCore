using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

[assembly: System.Reflection.AssemblyTitle("页核 · PAGECORE")]
[assembly: System.Reflection.AssemblyProduct("页核 · PAGECORE")]
[assembly: System.Reflection.AssemblyDescription("页核 Markdown 编辑器")]
[assembly: System.Reflection.AssemblyVersion("0.1.0.0")]
[assembly: System.Reflection.AssemblyFileVersion("0.1.0.0")]

namespace FieldNotes {
 static class Program {
  public static readonly string Root=Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,".."));
  public static readonly string Data=Path.Combine(Root,".runtime");
  [STAThread] static void Main(string[] args){
   Directory.CreateDirectory(Data);Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
   if(args.Contains("--self-test")){Environment.ExitCode=SessionTests.Run();return;}
   bool isNew;using(var mutex=new System.Threading.Mutex(true,"Local\\FieldNotesMarkdownStudio",out isNew)){
    if(!isNew){MessageBox.Show("页核 · PAGECORE 已经在运行，请切换到已有窗口。","页核 · PAGECORE");return;}
    Application.Run(new StudioForm(args.FirstOrDefault(a=>!a.StartsWith("--"))));
   }
  }
 }
 sealed class StudioForm:BorderlessForm {
  readonly WebView2 web=new WebView2();
  readonly JavaScriptSerializer json=new JavaScriptSerializer{MaxJsonLength=DocumentSession.MaxBytes*3};
  readonly DocumentSession doc=new DocumentSession();
  readonly List<string> recent=new List<string>();
  readonly Timer draftTimer=new Timer{Interval=800};
  readonly string initialPath;
  string assetFolder;bool ready,closing,allowClose;
  Dictionary<string,object> pendingRecovery;
  string DraftPath{get{return Path.Combine(Program.Data,"recovery.json");}}
  string BackupPath{get{return Path.Combine(Program.Data,"backups");}}
  static bool OwnDocument(string uri){Uri u;return Uri.TryCreate(uri,UriKind.Absolute,out u)&&u.Scheme=="https"&&u.Host=="notes.field.local"&&u.IsDefaultPort&&u.AbsolutePath=="/index.html";}
  public StudioForm(string path){
   initialPath=path;Text="页核 · PAGECORE · Markdown 编辑器";ClientSize=new Size(1400,900);MinimumSize=new Size(900,650);WindowState=FormWindowState.Maximized;StartPosition=FormStartPosition.CenterScreen;BackColor=Color.FromArgb(233,235,229);web.Dock=DockStyle.Fill;Controls.Add(web);
   Icon=System.Drawing.Icon.ExtractAssociatedIcon(Application.ExecutablePath);
   SizeChanged+=(s,e)=>SendWindowState();
   doc.New(File.ReadAllText(Path.Combine(Program.Root,"dist","welcome.md")),"欢迎使用.md");
   try{var list=json.Deserialize<string[]>(File.ReadAllText(Path.Combine(Program.Data,"recent.json")));recent.AddRange(list.Where(DocumentSession.Allowed).Take(12));}catch{}
   draftTimer.Tick+=(s,e)=>{draftTimer.Stop();PersistDraft();};
   Load+=async(s,e)=>await Start();FormClosing+=OnClosing;
  }
  object Payload(){return new {name=doc.Name,path=doc.PathName,text=doc.Text,cleanText=doc.CleanText,encoding=doc.Encoding.WebName+(doc.Bom?" BOM":""),eol=doc.Eol=="\r\n"?"CRLF":"LF",dirty=doc.Dirty,assetBase=doc.PathName==null?"":"https://media.field.local/",recent=recent.Select(p=>new {name=Path.GetFileName(p),path=p}).ToArray()};}
  void Send(object value){if(!IsDisposed&&web.CoreWebView2!=null)web.CoreWebView2.PostWebMessageAsJson(json.Serialize(value));}
  void SendWindowState(){Send(new {type="window-state",maximized=WindowState==FormWindowState.Maximized});}
  string Get(Dictionary<string,object> d,string key){object v;return d.TryGetValue(key,out v)?v as string:null;}
  void Sync(Dictionary<string,object> message){string text=Get(message,"text");if(text!=null){doc.Update(text);UpdateTitle();draftTimer.Stop();draftTimer.Start();}}
  void UpdateTitle(){Text=(doc.Dirty?"● ":"")+doc.Name+" — 页核 · PAGECORE";}
  void PersistDraft(){try{if(doc.Dirty)DocumentSession.AtomicWrite(DraftPath,Encoding.UTF8.GetBytes(json.Serialize(new {name=doc.Name,text=doc.Text,path=doc.PathName})),null);else if(File.Exists(DraftPath))File.Delete(DraftPath);}catch(Exception ex){Send(new {type="notice",message="恢复草稿保存失败："+ex.Message});}}
  void Remember(){if(doc.PathName==null)return;recent.RemoveAll(p=>String.Equals(p,doc.PathName,StringComparison.OrdinalIgnoreCase));recent.Insert(0,doc.PathName);if(recent.Count>12)recent.RemoveRange(12,recent.Count-12);try{File.WriteAllText(Path.Combine(Program.Data,"recent.json"),json.Serialize(recent));}catch{}}
  void ConfigureAssets(){assetFolder=doc.PathName==null?null:Path.GetDirectoryName(doc.PathName);}
  async Task Start(){
   try{
    var env=await CoreWebView2Environment.CreateAsync(null,Path.Combine(Program.Data,"WebView2"));await web.EnsureCoreWebView2Async(env);var core=web.CoreWebView2;
    core.Settings.AreDevToolsEnabled=false;core.Settings.IsStatusBarEnabled=false;core.Settings.AreDefaultContextMenusEnabled=false;core.Settings.IsZoomControlEnabled=false;core.Settings.IsNonClientRegionSupportEnabled=true;
    core.PermissionRequested+=(s,e)=>e.State=CoreWebView2PermissionState.Deny;core.DownloadStarting+=(s,e)=>e.Cancel=true;
    core.NavigationStarting+=(s,e)=>{if(!OwnDocument(e.Uri))e.Cancel=true;};core.FrameNavigationStarting+=(s,e)=>e.Cancel=true;core.NewWindowRequested+=(s,e)=>{e.Handled=true;OpenExternal(e.Uri);};
    core.SetVirtualHostNameToFolderMapping("notes.field.local",Path.Combine(Program.Root,"dist"),CoreWebView2HostResourceAccessKind.DenyCors);
    core.AddWebResourceRequestedFilter("https://media.field.local/*",CoreWebView2WebResourceContext.Image);
    core.WebResourceRequested+=(s,e)=>{
     try{
      var uri=new Uri(e.Request.Uri);string rel=Uri.UnescapeDataString(uri.AbsolutePath).TrimStart('/').Replace('/',Path.DirectorySeparatorChar);
      if(assetFolder==null||Path.IsPathRooted(rel))throw new IOException();
      string path=Path.GetFullPath(Path.Combine(assetFolder,rel));
      if(!path.StartsWith(assetFolder.TrimEnd('\\')+"\\",StringComparison.OrdinalIgnoreCase))throw new IOException();
      string ext=Path.GetExtension(path).ToLowerInvariant();string mime=ext==".png"?"image/png":ext==".jpg"||ext==".jpeg"?"image/jpeg":ext==".gif"?"image/gif":ext==".webp"?"image/webp":null;
      if(mime==null||new FileInfo(path).Length>20*1024*1024)throw new IOException();
      e.Response=core.Environment.CreateWebResourceResponse(new MemoryStream(File.ReadAllBytes(path)),200,"OK","Content-Type: "+mime+"\r\nCache-Control: no-store\r\nAccess-Control-Allow-Origin: https://notes.field.local");
     }catch{e.Response=core.Environment.CreateWebResourceResponse(null,404,"Not Found","Cache-Control: no-store");}
    };
    core.WebMessageReceived+=(s,e)=>{
     if(!OwnDocument(e.Source))return;
     Dictionary<string,object> m=null;string id=null;
     try{m=json.Deserialize<Dictionary<string,object>>(e.WebMessageAsJson);id=Get(m,"id");var command=Get(m,"command");
      if(command=="window:drag"){StartWindowInteraction(null);return;}
      if(command=="window:resize"){StartWindowInteraction(Get(m,"edge"));return;}
      if(command=="window:minimize"){WindowState=FormWindowState.Minimized;return;}
      if(command=="window:maximize"){ToggleWindowMaximize();SendWindowState();return;}
      if(command=="window:close"){Close();return;}
      if(command=="changed"){Sync(m);return;}
      if(command=="ready"){
       ready=true;if(initialPath!=null){try{doc.Open(initialPath);Remember();}catch(Exception ex){Send(new {type="notice",message=ex.Message});}}
       ConfigureAssets();UpdateTitle();try{if(pendingRecovery==null&&File.Exists(DraftPath)){string recovered=File.ReadAllText(DraftPath);pendingRecovery=json.Deserialize<Dictionary<string,object>>(recovered);Directory.CreateDirectory(BackupPath);File.WriteAllText(Path.Combine(BackupPath,"recovery-"+Guid.NewGuid().ToString("N")+".json"),recovered);}}catch{}
       Send(new {id=id,ok=true,data=new {document=Payload(),recovery=pendingRecovery}});SendWindowState();File.WriteAllText(Path.Combine(Program.Data,"ui-ready.txt"),DateTime.UtcNow.ToString("o"));return;
      }
      Sync(m);object result=null;
      switch(command){
       case "save": if(Save(false))result=Payload();break;
       case "save-as": if(Save(true))result=Payload();break;
       case "new": if(ConfirmChanges()){doc.New("","未命名.md");result=ChangedDocument();}break;
       case "open": if(ConfirmChanges()){using(var dialog=new OpenFileDialog{Filter="Markdown 文件|*.md;*.markdown;*.txt|所有文件|*.*",Title="打开 Markdown 文档"}){if(dialog.ShowDialog(this)==DialogResult.OK){doc.Open(dialog.FileName);result=ChangedDocument();}}}break;
       case "recent": var p=Get(m,"path");if(!recent.Contains(p))throw new IOException("此文件不在最近记录中。");if(ConfirmChanges()){doc.Open(p);result=ChangedDocument();}break;
       case "restore": if(pendingRecovery==null)throw new IOException("没有可恢复的草稿。");if(ConfirmChanges()){var draft=pendingRecovery;doc.New(Get(draft,"text")??"",Path.GetFileName(Get(draft,"name")??"恢复草稿.md"),true);pendingRecovery=null;ConfigureAssets();UpdateTitle();PersistDraft();result=Payload();}break;
       case "dismiss-recovery": pendingRecovery=null;PersistDraft();break;
       case "export": result=Export(Get(m,"html"));break;
       case "external": OpenExternal(Get(m,"url"));break;
       default:throw new IOException("不支持的操作。");
      }
      Send(new {id=id,ok=true,data=result});
     }catch(Exception ex){Send(new {id=id,ok=false,error=ex.Message});}
    };
    core.Navigate("https://notes.field.local/index.html");
   }catch(Exception ex){File.WriteAllText(Path.Combine(Program.Data,"error.log"),ex.ToString());MessageBox.Show(this,"编辑器加载失败："+ex.Message,"页核 · PAGECORE");allowClose=true;Close();}
  }
  object ChangedDocument(){ConfigureAssets();Remember();UpdateTitle();PersistDraft();return Payload();}
  bool ConfirmChanges(){
   if(!doc.Dirty)return true;
   var choice=MessageBox.Show(this,"“"+doc.Name+"”有未保存的更改。是否先保存？\n选择“否”将放弃这些更改。","保存更改",MessageBoxButtons.YesNoCancel,MessageBoxIcon.Question);
   if(choice==DialogResult.Cancel)return false;if(choice==DialogResult.Yes)return Save(false);return true;
  }
  bool Save(bool saveAs){
   string target=doc.PathName;
   if(saveAs||target==null){using(var dialog=new SaveFileDialog{Filter="Markdown 文档|*.md|Markdown 文档|*.markdown|文本文件|*.txt",FileName=doc.Name,DefaultExt="md",AddExtension=true,OverwritePrompt=true,Title="保存 Markdown 文档"}){if(dialog.ShowDialog(this)!=DialogResult.OK)return false;target=dialog.FileName;}}
   bool conflict=String.Equals(target,doc.PathName,StringComparison.OrdinalIgnoreCase)&&doc.HasExternalChanges();
   if(conflict&&MessageBox.Show(this,"磁盘上的文件已被其他程序修改或删除。是否用当前编辑内容覆盖？\n选择“否”可以返回编辑器，再另存为新文件。","检测到外部修改",MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes)return false;
   doc.Save(target,BackupPath,conflict);ChangedDocument();return true;
  }
  object Export(string html){
   if(html==null||html.Length>DocumentSession.MaxBytes*2)throw new IOException("无法导出此文档。");
   using(var dialog=new SaveFileDialog{Filter="HTML 文档|*.html",FileName=Path.GetFileNameWithoutExtension(doc.Name)+".html",DefaultExt="html",AddExtension=true,OverwritePrompt=true,Title="导出 HTML"}){
    if(dialog.ShowDialog(this)!=DialogResult.OK)return null;
    if(!String.Equals(Path.GetExtension(dialog.FileName),".html",StringComparison.OrdinalIgnoreCase))throw new IOException("导出文件扩展名必须为 .html。");
    // Embed local raster images so exported documents remain portable.
    if(assetFolder!=null)html=System.Text.RegularExpressions.Regex.Replace(html,"https://media\\.field\\.local/[^\\\"<> ]+",match=>{
     try{var u=new Uri(match.Value);var path=Path.GetFullPath(Path.Combine(assetFolder,Uri.UnescapeDataString(u.AbsolutePath).TrimStart('/').Replace('/',Path.DirectorySeparatorChar)));if(!path.StartsWith(assetFolder.TrimEnd('\\')+"\\",StringComparison.OrdinalIgnoreCase))return "";var ext=Path.GetExtension(path).ToLowerInvariant();var mime=ext==".png"?"image/png":ext==".jpg"||ext==".jpeg"?"image/jpeg":ext==".gif"?"image/gif":ext==".webp"?"image/webp":null;if(mime==null||new FileInfo(path).Length>20*1024*1024)return "";return "data:"+mime+";base64,"+Convert.ToBase64String(File.ReadAllBytes(path));}catch{return "";}
    });
    DocumentSession.AtomicWrite(dialog.FileName,new UTF8Encoding(false).GetBytes(html),BackupPath);return new {path=dialog.FileName};
   }
  }
  void OpenExternal(string url){Uri u;if(Uri.TryCreate(url,UriKind.Absolute,out u)&&(u.Scheme=="https"||u.Scheme=="http"))Process.Start(new ProcessStartInfo{FileName=u.AbsoluteUri,UseShellExecute=true});}
  async void OnClosing(object sender,FormClosingEventArgs e){
   if(allowClose||!ready)return;e.Cancel=true;if(closing)return;closing=true;
   try{
    string raw=await web.CoreWebView2.ExecuteScriptAsync("window.FieldMarkdown.flush()");string text=json.Deserialize<string>(raw);if(text!=null)doc.Update(text);
    if(!ConfirmChanges())return;
    draftTimer.Stop();if(File.Exists(DraftPath))File.Delete(DraftPath);allowClose=true;BeginInvoke(new Action(Close));
   }catch(Exception ex){PersistDraft();MessageBox.Show(this,"关闭前检查失败，已保留当前窗口："+ex.Message,"页核 · PAGECORE");}finally{closing=false;}
  }
 }
}
