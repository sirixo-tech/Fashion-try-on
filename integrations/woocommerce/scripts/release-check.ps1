param([string]$PhpPath = 'php')
$ErrorActionPreference = 'Stop'
$wooRoot = Split-Path $PSScriptRoot -Parent
$pluginRoot = Join-Path $wooRoot 'selfx-woocommerce'
$header = Get-Content -LiteralPath (Join-Path $pluginRoot 'selfx-woocommerce.php') -Raw
$readme = Get-Content -LiteralPath (Join-Path $pluginRoot 'readme.txt') -Raw
if ($header -notmatch '(?m)^ \* Version: (\d+\.\d+\.\d+)\s*$') { throw 'Plugin version missing.' }
$version = $Matches[1]
if ($readme -notmatch "(?m)^Stable tag: $([regex]::Escape($version))\s*$") { throw 'Stable tag must match plugin version.' }
foreach ($required in @('Requires at least:', 'Requires PHP:', 'License:', 'License URI:', '== External service and privacy ==', 'Privacy policy:', 'Support:')) {
    if (!$readme.Contains($required)) { throw "Missing release disclosure: $required" }
}
Get-ChildItem -LiteralPath $pluginRoot -Recurse -Filter '*.php' | ForEach-Object {
    & $PhpPath -l $_.FullName
    if ($LASTEXITCODE -ne 0) { throw "PHP syntax failed: $($_.FullName)" }
}
& $PhpPath (Join-Path $wooRoot 'tests/plugin-test.php')
if ($LASTEXITCODE -ne 0) { throw 'Plugin behavior checks failed.' }
& (Join-Path $PSScriptRoot 'build.ps1')
Write-Output 'Local release checks passed. WordPress Plugin Check, real-site compatibility and directory review remain required before publication.'
