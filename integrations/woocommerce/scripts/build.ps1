$ErrorActionPreference = 'Stop'
$wooRoot = Split-Path $PSScriptRoot -Parent
$repoRoot = [IO.Path]::GetFullPath((Join-Path $wooRoot '../..'))
$pluginRoot = Join-Path $wooRoot 'selfx-woocommerce'
$header = Get-Content -LiteralPath (Join-Path $pluginRoot 'selfx-woocommerce.php') -Raw
if ($header -notmatch '(?m)^ \* Version: (\d+\.\d+\.\d+)\s*$') { throw 'Plugin version missing.' }
$version = $Matches[1]
$outputRoot = Join-Path $wooRoot 'dist'
$publicRoot = Join-Path $repoRoot 'frontend/web/public/downloads'
New-Item -ItemType Directory -Force -Path $outputRoot, $publicRoot | Out-Null

# WordPress uses the ZIP filename as the plugin directory when files are at its root.
# Keep both stable so replacing an installed plugin targets selfx-woocommerce/.
$filename = 'selfx-woocommerce.zip'
$archive = Join-Path $outputRoot $filename
Compress-Archive -Path (Join-Path $pluginRoot '*') -DestinationPath $archive -Force

Add-Type -AssemblyName System.IO.Compression.FileSystem
$expectedEntries = @(
    'readme.txt',
    'selfx-woocommerce.php',
    'uninstall.php',
    'assets/block.js',
    'includes/class-selfx-wc-client.php',
    'includes/class-selfx-wc-plugin.php',
    'includes/class-selfx-wc-product.php',
    'includes/class-selfx-wc-storefront.php'
)
$zip = [IO.Compression.ZipFile]::OpenRead($archive)
try {
    $actualEntries = @($zip.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
    $unexpectedEntries = @($actualEntries | Where-Object { $_ -notin $expectedEntries })
    if ($unexpectedEntries.Count -gt 0) { throw "Unexpected package entries: $($unexpectedEntries -join ', ')" }
    if (($actualEntries | Sort-Object -Unique).Count -ne $expectedEntries.Count) { throw 'The plugin package is missing required files.' }
} finally { $zip.Dispose() }

Copy-Item -LiteralPath $archive -Destination (Join-Path $publicRoot $filename) -Force
$hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $outputRoot "$filename.sha256"), "$hash  $filename`n")
Write-Output "Built version ${version}: $archive"
Write-Output "Dashboard download: /downloads/$filename"
Write-Output "SHA-256: $hash"
