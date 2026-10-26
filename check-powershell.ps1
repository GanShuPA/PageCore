$ErrorActionPreference = 'Stop'
if (!(Get-Module PSScriptAnalyzer | Where-Object { $_.Version -eq [version]'1.24.0' })) {
    Import-Module PSScriptAnalyzer -RequiredVersion '1.24.0' -ErrorAction Stop
}
$settings = Join-Path $PSScriptRoot 'PSScriptAnalyzerSettings.psd1'
$issues = @(
    Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.ps1' | ForEach-Object {
        Invoke-ScriptAnalyzer -Path $_.FullName -Settings $settings
    }
)
if ($issues.Count -gt 0) {
    $issues | Format-Table ScriptName, Line, RuleName, Message -AutoSize
    throw 'PowerShell code style check failed'
}
Write-Output 'PASS: PowerShell code style'
