param([switch]$Submission)
$ErrorActionPreference = 'Stop'
$wooRoot = Split-Path $PSScriptRoot -Parent
$repoRoot = [IO.Path]::GetFullPath((Join-Path $wooRoot '../..'))
$pluginRoot = Join-Path $wooRoot 'selfx-woocommerce'
$header = Get-Content -LiteralPath (Join-Path $pluginRoot 'selfx-woocommerce.php') -Raw
if ($header -notmatch '(?m)^ \* Version: (\d+\.\d+\.\d+)\s*$') { throw 'Plugin version missing.' }
$version = $Matches[1]
$outputRoot = Join-Path $wooRoot 'dist'
$publicRoot = Join-Path $repoRoot 'frontend/web/public/downloads'
New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null
$filename = if ($Submission) { "selfx-woocommerce-$version-wordpress-org.zip" } else { 'selfx-woocommerce.zip' }
$archive = Join-Path $outputRoot $filename

Add-Type -AssemblyName System.IO.Compression.FileSystem
$pluginFiles = @(
    'readme.txt',
    'selfx-woocommerce.php',
    'uninstall.php',
    'assets/block.js',
    'assets/block.json',
    'includes/class-selfx-wc-client.php',
    'includes/class-selfx-wc-plugin.php',
    'includes/class-selfx-wc-product.php',
    'includes/class-selfx-wc-storefront.php'
)
$expectedEntries = @($pluginFiles | ForEach-Object { "selfx-woocommerce/$_" })
foreach ($file in $pluginFiles) {
    if (!(Test-Path -LiteralPath (Join-Path $pluginRoot $file) -PathType Leaf)) { throw "Missing plugin file: $file" }
}

# Add only release files, under a stable directory independent of the ZIP filename.
$stream = [IO.File]::Open($archive, [IO.FileMode]::Create)
try {
    $zip = New-Object IO.Compression.ZipArchive($stream, [IO.Compression.ZipArchiveMode]::Create, $true)
    try {
        foreach ($file in $pluginFiles) {
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $pluginRoot $file), "selfx-woocommerce/$file") | Out-Null
        }
    } finally { $zip.Dispose() }
} finally { $stream.Dispose() }

$zip = [IO.Compression.ZipFile]::OpenRead($archive)
try {
    $actualEntries = @($zip.Entries | ForEach-Object { $_.FullName })
    if ($actualEntries.Count -ne $expectedEntries.Count -or (Compare-Object $expectedEntries $actualEntries -CaseSensitive)) {
        throw 'The package does not match the plugin file allowlist.'
    }
} finally { $zip.Dispose() }

if (!$Submission) {
    New-Item -ItemType Directory -Force -Path $publicRoot | Out-Null
    Copy-Item -LiteralPath $archive -Destination (Join-Path $publicRoot $filename) -Force
    Write-Output "Dashboard download: /downloads/$filename"
}
$hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $outputRoot "$filename.sha256"), "$hash  $filename`n")
Write-Output "Built version ${version}: $archive"
Write-Output "SHA-256: $hash"
