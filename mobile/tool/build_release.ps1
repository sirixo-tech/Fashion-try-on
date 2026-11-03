param(
  [string[]] $FlutterArgs = @()
)

$ErrorActionPreference = "Stop"
$mobileRoot = Split-Path -Parent $PSScriptRoot
$pubspecPath = Join-Path $mobileRoot "pubspec.yaml"
$pubspec = [System.IO.File]::ReadAllText($pubspecPath)
$match = [regex]::Match($pubspec, '(?m)^version:\s*(\d+\.\d+\.\d+)\+(\d+)\s*$')
if (-not $match.Success) {
  throw "Expected pubspec version in major.minor.patch+build format."
}

$versionName = $match.Groups[1].Value
$currentBuild = [long]::Parse($match.Groups[2].Value)
$nextBuild = $currentBuild + 1
if ($nextBuild -gt 2147483647) {
  throw "Android versionCode limit reached."
}

$updatedPubspec = $pubspec.Substring(0, $match.Index) + "version: $versionName+$nextBuild" + $pubspec.Substring($match.Index + $match.Length)
[System.IO.File]::WriteAllText(
  $pubspecPath,
  $updatedPubspec,
  [System.Text.UTF8Encoding]::new($false)
)

Push-Location $mobileRoot
try {
  & flutter build apk --release --split-per-abi --build-name $versionName --build-number $nextBuild @FlutterArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Flutter APK build failed with exit code $LASTEXITCODE. The build number remains advanced to avoid reuse."
  }
} finally {
  Pop-Location
}
