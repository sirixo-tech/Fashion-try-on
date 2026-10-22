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
$filename = "selfx-woocommerce-$version.zip"
$archive = Join-Path $outputRoot $filename
Compress-Archive -LiteralPath $pluginRoot -DestinationPath $archive -Force
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($archive)
try {
    foreach ($entry in $zip.Entries) {
        $name = $entry.FullName.Replace('\', '/')
        if (!$name.StartsWith('selfx-woocommerce/') -or $name.Contains('..') -or $name -notmatch '\.(php|txt)$') { throw "Unexpected package entry: $name" }
    }
    if ($zip.Entries.Count -ne 6) { throw 'Expected five PHP files and readme.txt.' }
} finally { $zip.Dispose() }
Copy-Item -LiteralPath $archive -Destination (Join-Path $publicRoot $filename) -Force
$hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $outputRoot "$filename.sha256"), "$hash  $filename`n")
Write-Output "Built $archive"
Write-Output "Dashboard download: /downloads/$filename"
Write-Output "SHA-256: $hash"
