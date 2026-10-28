$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$') { throw 'Invalid package version' }
$packageOutput = Join-Path $projectRoot 'release\packages'
New-Item -ItemType Directory -Force -Path $packageOutput | Out-Null
$stage = Join-Path $projectRoot ('release\stage-' + [guid]::NewGuid().ToString('N'))
$releaseRoot = Join-Path $stage 'PageCore'
New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null
try {
    foreach ($item in @('dist', 'assets', '启动页核.cmd', 'README.md', 'LICENSE')) {
        Copy-Item -LiteralPath (Join-Path $projectRoot $item) -Destination $releaseRoot -Recurse -Force
    }
    $releaseDocs = Join-Path $releaseRoot 'docs'
    New-Item -ItemType Directory -Path $releaseDocs | Out-Null
    foreach ($item in @('USER-GUIDE.md', 'EMBEDDING.md', 'DEVELOPMENT.md', 'CHANGELOG.md', 'images', 'releases')) {
        Copy-Item -LiteralPath (Join-Path $projectRoot "docs\$item") -Destination $releaseDocs -Recurse -Force
    }
    $releaseBin = Join-Path $releaseRoot 'bin'
    New-Item -ItemType Directory -Force -Path $releaseBin | Out-Null
    foreach ($binary in @('PageCore.exe', 'PageCore.exe.config', 'Microsoft.Web.WebView2.Core.dll', 'Microsoft.Web.WebView2.WinForms.dll', 'WebView2Loader.dll')) {
        Copy-Item -LiteralPath (Join-Path $projectRoot "bin\$binary") -Destination $releaseBin
    }
    $archive = Join-Path $packageOutput "PageCore-v$version-windows-x64.zip"
    Compress-Archive -LiteralPath $releaseRoot -DestinationPath $archive -Force
    $hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText((Join-Path $packageOutput 'SHA256SUMS.txt'), "$hash  $([IO.Path]::GetFileName($archive))" + [Environment]::NewLine, [Text.Encoding]::ASCII)
    Get-Item -LiteralPath $archive | Select-Object FullName, Length
} finally {
    $resolvedStage = [IO.Path]::GetFullPath($stage)
    $allowedParent = [IO.Path]::GetFullPath((Join-Path $projectRoot 'release')) + [IO.Path]::DirectorySeparatorChar
    if (!$resolvedStage.StartsWith($allowedParent, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe staging path' }
    if (Test-Path -LiteralPath $resolvedStage) { Remove-Item -LiteralPath $resolvedStage -Recurse -Force }
}
