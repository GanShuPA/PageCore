$ErrorActionPreference = 'Stop'
$version = (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'package.json') -Raw | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$') { throw 'Invalid package version' }
$stage = Join-Path $PSScriptRoot ('release\stage-' + [guid]::NewGuid().ToString('N'))
$releaseRoot = Join-Path $stage 'PageCore'
New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null
try {
    foreach ($item in @('dist', 'docs', 'assets', '启动页核.cmd', '启动编辑器.cmd', 'README.md', 'CHANGELOG.md', 'LICENSE', 'THIRD-PARTY.json', 'THIRD-PARTY-LICENSES.txt')) {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot $item) -Destination $releaseRoot -Recurse -Force
    }
    $releaseBin = Join-Path $releaseRoot 'bin'
    New-Item -ItemType Directory -Force -Path $releaseBin | Out-Null
    foreach ($binary in @('PageCore.exe', 'PageCore.exe.config', 'Microsoft.Web.WebView2.Core.dll', 'Microsoft.Web.WebView2.WinForms.dll', 'WebView2Loader.dll')) {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot "bin\$binary") -Destination $releaseBin
    }
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'vendor\webview2\LICENSE.txt') -Destination (Join-Path $releaseRoot 'LICENSE-WebView2.txt')
    $archive = Join-Path $PSScriptRoot "PageCore-v$version-windows-x64.zip"
    Compress-Archive -LiteralPath $releaseRoot -DestinationPath $archive -Force
    $hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText((Join-Path $PSScriptRoot 'SHA256SUMS.txt'), "$hash  $([IO.Path]::GetFileName($archive))" + [Environment]::NewLine, [Text.Encoding]::ASCII)
    Copy-Item -LiteralPath $archive -Destination (Join-Path $PSScriptRoot 'PageCore-Windows-x64.zip') -Force
    Get-Item -LiteralPath $archive | Select-Object FullName, Length
} finally {
    $resolvedStage = [IO.Path]::GetFullPath($stage)
    $allowedParent = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'release')) + [IO.Path]::DirectorySeparatorChar
    if (!$resolvedStage.StartsWith($allowedParent, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe staging path' }
    if (Test-Path -LiteralPath $resolvedStage) { Remove-Item -LiteralPath $resolvedStage -Recurse -Force }
}
