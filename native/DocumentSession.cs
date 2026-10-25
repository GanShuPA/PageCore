using System;
using System.IO;
using System.Text;
using System.Security.Cryptography;

namespace FieldNotes {
 public sealed class DocumentSession {
  public string PathName {get;private set;}
  public string Text {get;private set;}
  public string CleanText {get;private set;}
  public string Name {get;private set;}
  public string Eol {get;private set;}
  public Encoding Encoding {get;private set;}
  public DocumentSession(){New("","未命名.md");}
  public bool Bom {get;private set;}
  public string Fingerprint {get;private set;}
  public bool Dirty {get{return Text!=CleanText;}}
  public const int MaxBytes=10*1024*1024;
  public static string Normalize(string text){return text.Replace("\r\n","\n").Replace("\r","\n");}
  public static string Hash(byte[] bytes){using(var hash=SHA256.Create())return Convert.ToBase64String(hash.ComputeHash(bytes));}
  public void New(string content,string name,bool dirty=false){PathName=null;Name=name;Text=Normalize(content);CleanText=dirty?"":Text;Encoding=new UTF8Encoding(false,true);Bom=false;Eol="\n";Fingerprint=null;}
  public void Update(string text){if(text.Length>MaxBytes)throw new IOException("文档过大，请控制在 10 MB 以内。");Text=Normalize(text);}
  public void Open(string path){
   path=Path.GetFullPath(path);
   if(!Allowed(path))throw new IOException("请选择 .md、.markdown 或 .txt 文件。");
   if(new FileInfo(path).Length>MaxBytes)throw new IOException("文件超过 10 MB，暂不支持打开。");
   byte[] bytes=File.ReadAllBytes(path);int skip=0;bool bom=false;Encoding encoding;
   if(bytes.Length>=3&&bytes[0]==239&&bytes[1]==187&&bytes[2]==191){encoding=new UTF8Encoding(true,true);skip=3;bom=true;}
   else if(bytes.Length>=2&&bytes[0]==255&&bytes[1]==254){encoding=new UnicodeEncoding(false,true,true);skip=2;bom=true;}
   else if(bytes.Length>=2&&bytes[0]==254&&bytes[1]==255){encoding=new UnicodeEncoding(true,true,true);skip=2;bom=true;}
   else encoding=new UTF8Encoding(false,true);
   string raw;
   try{raw=encoding.GetString(bytes,skip,bytes.Length-skip);}catch(DecoderFallbackException){if(skip!=0)throw;encoding=Encoding.GetEncoding(54936,EncoderFallback.ExceptionFallback,DecoderFallback.ExceptionFallback);raw=encoding.GetString(bytes);}
   if(raw.IndexOf('\0')>=0)throw new IOException("文件包含二进制内容，无法作为 Markdown 打开。");
   PathName=path;Name=Path.GetFileName(path);Encoding=encoding;Bom=bom;Eol=raw.Contains("\r\n")?"\r\n":"\n";Text=CleanText=Normalize(raw);Fingerprint=Hash(bytes);
  }
  public static bool Allowed(string path){var ext=Path.GetExtension(path).ToLowerInvariant();return ext==".md"||ext==".markdown"||ext==".txt";}
  public bool HasExternalChanges(){return PathName!=null&&(!File.Exists(PathName)||Hash(File.ReadAllBytes(PathName))!=Fingerprint);}
  public void Save(string target,string backupDir,bool allowConflict=false){
   target=Path.GetFullPath(target);
   if(!Allowed(target))throw new IOException("文档请保存为 .md、.markdown 或 .txt。");
   bool same=String.Equals(PathName,target,StringComparison.OrdinalIgnoreCase);
   if(same&&!allowConflict&&HasExternalChanges())throw new IOException("文件已被外部修改，已取消保存。");
   if(same&&!Dirty&&File.Exists(target))return;
   string value=Text.Replace("\n",Eol);
   byte[] body=Encoding.GetBytes(value),prefix=Bom?Encoding.GetPreamble():new byte[0];
   byte[] result=new byte[body.Length+prefix.Length];Buffer.BlockCopy(prefix,0,result,0,prefix.Length);Buffer.BlockCopy(body,0,result,prefix.Length,body.Length);
   AtomicWrite(target,result,backupDir);
   PathName=target;Name=Path.GetFileName(target);CleanText=Text;Fingerprint=Hash(result);
  }
  public static void AtomicWrite(string target,byte[] bytes,string backupDir){
   var temp=target+"."+Guid.NewGuid().ToString("N")+".tmp";
   try{
    using(var file=new FileStream(temp,FileMode.CreateNew,FileAccess.Write,FileShare.None)){file.Write(bytes,0,bytes.Length);file.Flush(true);}
    if(File.Exists(target)){
     if(backupDir!=null)Directory.CreateDirectory(backupDir);
     string backup=backupDir==null?null:Path.Combine(backupDir,DateTime.UtcNow.ToString("yyyyMMdd-HHmmss-")+Guid.NewGuid().ToString("N")+".bak");
     File.Replace(temp,target,backup);
    }else File.Move(temp,target);
   }finally{if(File.Exists(temp))File.Delete(temp);}
  }
 }
}
