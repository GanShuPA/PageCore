$ErrorActionPreference = 'Stop'
$nativeOutput = Join-Path $PSScriptRoot 'bin'
$nativeVendor = Join-Path $PSScriptRoot 'vendor/webview2'
$nativeRoot = Join-Path $PSScriptRoot 'native'
New-Item -ItemType Directory -Force -Path $nativeOutput | Out-Null
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$compilerArguments = @(
    '/nologo'
    '/target:winexe'
    '/platform:x64'
    '/optimize+'
    '/warnaserror+'
    "/win32icon:$PSScriptRoot/assets/field-notes.ico"
    "/win32manifest:$nativeRoot/app.manifest"
    "/out:$nativeOutput/PageCore.exe"
    '/reference:System.dll'
    '/reference:System.Core.dll'
    '/reference:System.Windows.Forms.dll'
    '/reference:System.Drawing.dll'
    '/reference:System.Web.Extensions.dll'
    "/reference:$nativeVendor/Microsoft.Web.WebView2.Core.dll"
    "/reference:$nativeVendor/Microsoft.Web.WebView2.WinForms.dll"
)
$sourceFiles = Get-ChildItem -LiteralPath $nativeRoot -Filter '*.cs' | Sort-Object Name
$compilerArguments += @($sourceFiles | ForEach-Object { $_.FullName })
& $compiler @compilerArguments
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
Copy-Item -LiteralPath "$nativeVendor/Microsoft.Web.WebView2.Core.dll", "$nativeVendor/Microsoft.Web.WebView2.WinForms.dll", "$nativeVendor/WebView2Loader.dll" -Destination $nativeOutput -Force
Copy-Item -LiteralPath "$nativeRoot/PageCore.exe.config" -Destination $nativeOutput -Force
Write-Output "Built: $nativeOutput/PageCore.exe"
