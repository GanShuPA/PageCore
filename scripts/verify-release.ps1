$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$packageOutput = Join-Path $projectRoot 'release\packages'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
$archivePath = Join-Path $packageOutput "PageCore-v$version-windows-x64.zip"
$zip = [IO.Compression.ZipFile]::OpenRead($archivePath)
try {
    $entries = @($zip.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
    foreach ($required in @('bin/PageCore.exe', 'bin/PageCore.exe.config', 'bin/Microsoft.Web.WebView2.Core.dll', 'bin/Microsoft.Web.WebView2.WinForms.dll', 'bin/WebView2Loader.dll', 'dist/index.html', 'dist/app.js', 'dist/app.css', 'dist/welcome.md', 'README.md', 'LICENSE', 'docs/CHANGELOG.md', 'dist/licenses/LICENSE-WebView2.txt', 'dist/licenses/THIRD-PARTY.json', 'dist/licenses/THIRD-PARTY-LICENSES.txt', '启动页核.cmd')) {
        if ($entries -notcontains "PageCore/$required") { throw "Missing release file: $required" }
    }
    if ($entries | Where-Object { $_ -match '(^|/)(\.runtime|\.git|node_modules|\.pnpm-store)(/|$)|(^|/)\.env|FieldNotes\.exe|(^|/)docs/local(/|$)|\.miora$|_assets/' }) { throw 'Unexpected development or private data in release' }
    if ($entries | Where-Object { $_ -match '(^/|(^|/)\.\.(/|$)|:)' }) { throw 'Unsafe archive entry' }
} finally { $zip.Dispose() }
$hash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
$expected = (Get-Content -LiteralPath (Join-Path $packageOutput 'SHA256SUMS.txt') -Raw).Trim()
if ($expected -ne "$hash  $([IO.Path]::GetFileName($archivePath))") { throw 'Release checksum mismatch' }
$testRoot = Join-Path $projectRoot ('.runtime\release-test-' + [guid]::NewGuid().ToString('N'))
Expand-Archive -LiteralPath $archivePath -DestinationPath $testRoot
$exe = Join-Path $testRoot 'PageCore\bin\PageCore.exe'
$result = Start-Process -FilePath $exe -ArgumentList '--self-test' -WindowStyle Hidden -Wait -PassThru
if ($result.ExitCode -ne 0) { throw 'Packaged native self-test failed' }
$report = Get-Content -LiteralPath (Join-Path $testRoot 'PageCore\.runtime\self-test.json') -Raw | ConvertFrom-Json
if (!$report.passed) { throw 'Native self-test did not report success' }
Write-Output "PASS: release files, exclusions, SHA-256, and extracted native session tests ($version)"
