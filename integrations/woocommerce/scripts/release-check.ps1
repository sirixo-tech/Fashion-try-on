param([string]$PhpPath = 'php', [switch]$Submission)
$ErrorActionPreference = 'Stop'
$wooRoot = Split-Path $PSScriptRoot -Parent
$pluginRoot = Join-Path $wooRoot 'selfx-woocommerce'
$header = Get-Content -LiteralPath (Join-Path $pluginRoot 'selfx-woocommerce.php') -Raw
$readme = Get-Content -LiteralPath (Join-Path $pluginRoot 'readme.txt') -Raw
if ($header -notmatch '(?m)^ \* Version: (\d+\.\d+\.\d+)\s*$') { throw 'Plugin version missing.' }
$version = $Matches[1]
if ($readme -notmatch "(?m)^Stable tag: $([regex]::Escape($version))\s*$") { throw 'Stable tag must match plugin version.' }
if ($readme -notmatch "(?m)^= $([regex]::Escape($version)) =\s*$") { throw 'Current version must have a changelog entry.' }
foreach ($required in @('Requires at least:', 'Requires PHP:', 'License:', 'License URI:', '= External service and privacy =', '= Account, plans and pricing =', '[Privacy policy]', '[Terms of service]', '[Support]')) {
    if (!$readme.Contains($required)) { throw "Missing release disclosure: $required" }
}
# Check the literal domains of the PHP/JavaScript translation functions used here.
# Compatibility identifiers (admin routes, scheduler group, source paths) are unrelated.
$translationPattern = '(?s)\b(?:__|esc_html__)\(\s*([''"])(.*?)\1\s*,\s*([''"])(?<domain>[^''"]+)\3'
Get-ChildItem -LiteralPath $pluginRoot -Recurse -File | Where-Object { $_.Extension -in '.php', '.js' } | ForEach-Object {
    $source = Get-Content -LiteralPath $_.FullName -Raw
    $calls = [regex]::Matches($source, '\b(?:__|esc_html__)\s*\(')
    $translations = [regex]::Matches($source, $translationPattern)
    if ($calls.Count -ne $translations.Count) { throw "Unvalidated translation call in $($_.FullName)" }
    foreach ($translation in $translations) {
        if ($translation.Groups['domain'].Value -cne 'selfx-tryon') { throw "Translation domain must be selfx-tryon in $($_.FullName)" }
    }
}
Get-ChildItem -LiteralPath $pluginRoot -Recurse -Filter '*.php' | ForEach-Object {
    & $PhpPath -l $_.FullName
    if ($LASTEXITCODE -ne 0) { throw "PHP syntax failed: $($_.FullName)" }
}
& $PhpPath (Join-Path $wooRoot 'tests/plugin-test.php')
if ($LASTEXITCODE -ne 0) { throw 'Plugin behavior checks failed.' }
& (Join-Path $PSScriptRoot 'build.ps1') -Submission:$Submission
Write-Output 'Local release checks passed. WordPress Plugin Check, real-site compatibility and directory review remain required before publication.'
