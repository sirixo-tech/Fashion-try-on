param(
  [string]$Root = (Join-Path $PSScriptRoot '..\assets\audio\capture')
)

$ErrorActionPreference = 'Stop'
$sampleRate = 44100
$maxInt16 = 32767

function New-Buffer([double]$durationSeconds) {
  $length = [Math]::Ceiling($durationSeconds * $sampleRate)
  $buffer = [double[]]::new($length)
  return ,$buffer
}

function Get-BufferPeak([double[]]$buffer) {
  $peak = 0.0
  foreach ($sample in $buffer) {
    $abs = [Math]::Abs($sample)
    if ($abs -gt $peak) {
      $peak = $abs
    }
  }
  return $peak
}

function Get-Envelope([int]$index, [int]$total, [double]$attackSeconds, [double]$releaseSeconds) {
  $attackSamples = [Math]::Max(1, [int]($attackSeconds * $sampleRate))
  $releaseSamples = [Math]::Max(1, [int]($releaseSeconds * $sampleRate))
  if ($index -lt $attackSamples) {
    return $index / $attackSamples
  }
  $remaining = $total - $index
  if ($remaining -lt $releaseSamples) {
    return [Math]::Max(0, $remaining / $releaseSamples)
  }
  return 1.0
}

function Add-Tone(
  [double[]]$buffer,
  [double]$startSeconds,
  [double]$durationSeconds,
  [double]$frequency,
  [double]$gain,
  [double[]]$harmonics,
  [double]$attackSeconds = 0.008,
  [double]$releaseSeconds = 0.045
) {
  $start = [int]($startSeconds * $sampleRate)
  $count = [int]($durationSeconds * $sampleRate)
  for ($i = 0; $i -lt $count; $i++) {
    $target = $start + $i
    if ($target -ge $buffer.Length) {
      break
    }
    $t = $i / $sampleRate
    $sample = 0.0
    for ($h = 0; $h -lt $harmonics.Length; $h++) {
      $multiple = $h + 1
      $sample += $harmonics[$h] * [Math]::Sin(2 * [Math]::PI * $frequency * $multiple * $t)
    }
    $buffer[$target] += $gain * $sample * (Get-Envelope $i $count $attackSeconds $releaseSeconds)
  }
}

function Add-NoiseBurst(
  [double[]]$buffer,
  [double]$startSeconds,
  [double]$durationSeconds,
  [double]$gain,
  [int]$seed,
  [double]$attackSeconds = 0.001,
  [double]$releaseSeconds = 0.055
) {
  $random = [Random]::new($seed)
  $start = [int]($startSeconds * $sampleRate)
  $count = [int]($durationSeconds * $sampleRate)
  $last = 0.0
  for ($i = 0; $i -lt $count; $i++) {
    $target = $start + $i
    if ($target -ge $buffer.Length) {
      break
    }
    $raw = ($random.NextDouble() * 2.0) - 1.0
    $last = ($last * 0.58) + ($raw * 0.42)
    $buffer[$target] += $gain * $last * (Get-Envelope $i $count $attackSeconds $releaseSeconds)
  }
}

function Write-Wav([string]$path, [double[]]$buffer) {
  $peak = Get-BufferPeak $buffer
  if ($peak -le 0) {
    throw "Refusing to write silent audio cue: $path"
  }
  $scale = if ($peak -gt 0) { 0.94 / $peak } else { 1.0 }
  $dataSize = $buffer.Length * 2
  $directory = Split-Path -Parent $path
  if (-not (Test-Path $directory)) {
    New-Item -ItemType Directory -Path $directory | Out-Null
  }

  $stream = [System.IO.File]::Create($path)
  try {
    $writer = [System.IO.BinaryWriter]::new($stream)
    try {
      $writer.Write([Text.Encoding]::ASCII.GetBytes('RIFF'))
      $writer.Write([int](36 + $dataSize))
      $writer.Write([Text.Encoding]::ASCII.GetBytes('WAVE'))
      $writer.Write([Text.Encoding]::ASCII.GetBytes('fmt '))
      $writer.Write([int]16)
      $writer.Write([int16]1)
      $writer.Write([int16]1)
      $writer.Write([int]$sampleRate)
      $writer.Write([int]($sampleRate * 2))
      $writer.Write([int16]2)
      $writer.Write([int16]16)
      $writer.Write([Text.Encoding]::ASCII.GetBytes('data'))
      $writer.Write([int]$dataSize)
      foreach ($sample in $buffer) {
        $limited = [Math]::Max(-0.98, [Math]::Min(0.98, $sample * $scale))
        $writer.Write([int16]($limited * $maxInt16))
      }
    } finally {
      $writer.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

function New-StartCue([hashtable]$profile) {
  $buffer = New-Buffer $profile.startDuration
  switch ($profile.style) {
    'soft' {
      Add-Tone $buffer 0.000 0.130 659.25 ($profile.gain * 0.58) @(1.0, 0.24) 0.004 0.070
      Add-Tone $buffer 0.085 0.160 987.77 ($profile.gain * 0.42) @(1.0, 0.18) 0.006 0.085
    }
    'classic' {
      Add-NoiseBurst $buffer 0.000 0.028 ($profile.gain * 0.46) ($profile.seed + 1) 0.001 0.018
      Add-Tone $buffer 0.008 0.085 880.00 ($profile.gain * 0.70) @(1.0, 0.46, 0.20) 0.002 0.045
      Add-Tone $buffer 0.095 0.095 1174.66 ($profile.gain * 0.62) @(1.0, 0.34, 0.18) 0.002 0.050
    }
    'digital' {
      Add-Tone $buffer 0.000 0.060 1567.98 ($profile.gain * 0.72) @(1.0, 0.72, 0.38, 0.18) 0.001 0.028
      Add-Tone $buffer 0.082 0.070 2349.32 ($profile.gain * 0.58) @(1.0, 0.60, 0.30) 0.001 0.032
      Add-Tone $buffer 0.162 0.065 3135.96 ($profile.gain * 0.42) @(1.0, 0.40) 0.001 0.032
    }
    default {
      Add-NoiseBurst $buffer 0.000 0.020 ($profile.gain * 0.28) ($profile.seed + 1) 0.001 0.014
      Add-Tone $buffer 0.000 0.085 987.77 ($profile.gain * 0.62) @(1.0, 0.28) 0.002 0.040
    }
  }
  return $buffer
}

function New-TickCue([hashtable]$profile) {
  $buffer = New-Buffer $profile.tickDuration
  switch ($profile.style) {
    'soft' {
      Add-Tone $buffer 0.000 ($profile.tickDuration - 0.018) 1046.50 ($profile.gain * 0.74) @(1.0, 0.22) 0.002 0.055
      Add-Tone $buffer 0.018 ($profile.tickDuration - 0.030) 1567.98 ($profile.gain * 0.26) @(1.0, 0.16) 0.002 0.045
    }
    'classic' {
      Add-NoiseBurst $buffer 0.000 0.030 ($profile.gain * 0.48) ($profile.seed + 2) 0.001 0.018
      Add-Tone $buffer 0.006 ($profile.tickDuration - 0.020) 1318.51 ($profile.gain * 0.62) @(1.0, 0.44, 0.20) 0.001 0.040
    }
    'digital' {
      Add-Tone $buffer 0.000 0.045 1975.53 ($profile.gain * 0.76) @(1.0, 0.70, 0.34) 0.001 0.020
      Add-Tone $buffer 0.052 0.045 2637.02 ($profile.gain * 0.54) @(1.0, 0.48) 0.001 0.020
    }
    default {
      Add-NoiseBurst $buffer 0.000 0.024 ($profile.gain * 0.42) ($profile.seed + 2) 0.001 0.015
      Add-Tone $buffer 0.002 0.055 1174.66 ($profile.gain * 0.45) @(1.0, 0.18) 0.001 0.022
    }
  }
  return $buffer
}

function New-ShutterCue([hashtable]$profile) {
  $buffer = New-Buffer $profile.shutterDuration
  switch ($profile.style) {
    'soft' {
      Add-NoiseBurst $buffer 0.000 0.038 ($profile.gain * 0.42) ($profile.seed + 10) 0.001 0.026
      Add-Tone $buffer 0.010 0.090 880.00 ($profile.gain * 0.26) @(1.0, 0.28) 0.002 0.055
      Add-NoiseBurst $buffer 0.112 0.075 ($profile.gain * 0.38) ($profile.seed + 20) 0.001 0.050
      Add-Tone $buffer 0.118 0.120 1760.00 ($profile.gain * 0.28) @(1.0, 0.22) 0.001 0.060
    }
    'classic' {
      Add-NoiseBurst $buffer 0.000 0.045 ($profile.gain * 0.75) ($profile.seed + 10) 0.001 0.025
      Add-Tone $buffer 0.003 0.075 420.00 ($profile.gain * 0.30) @(1.0, 0.50) 0.001 0.040
      Add-NoiseBurst $buffer 0.105 0.115 ($profile.gain * 0.70) ($profile.seed + 20) 0.001 0.060
      Add-Tone $buffer 0.108 0.135 1500.00 ($profile.gain * 0.42) @(1.0, 0.62, 0.24) 0.001 0.066
      Add-NoiseBurst $buffer 0.255 0.040 ($profile.gain * 0.24) ($profile.seed + 30) 0.001 0.030
    }
    'digital' {
      Add-NoiseBurst $buffer 0.000 0.032 ($profile.gain * 0.64) ($profile.seed + 10) 0.001 0.018
      Add-Tone $buffer 0.002 0.065 2600.00 ($profile.gain * 0.44) @(1.0, 0.55, 0.20) 0.001 0.028
      Add-NoiseBurst $buffer 0.080 0.070 ($profile.gain * 0.58) ($profile.seed + 20) 0.001 0.036
      Add-Tone $buffer 0.082 0.110 1850.00 ($profile.gain * 0.50) @(1.0, 0.48, 0.18) 0.001 0.048
    }
    default {
      Add-NoiseBurst $buffer 0.000 0.026 ($profile.gain * 0.70) ($profile.seed + 10) 0.001 0.018
      Add-Tone $buffer 0.004 0.070 1400.00 ($profile.gain * 0.32) @(1.0, 0.32) 0.001 0.026
      Add-NoiseBurst $buffer 0.082 0.038 ($profile.gain * 0.38) ($profile.seed + 20) 0.001 0.026
    }
  }
  return $buffer
}

$profiles = @{
  soft = @{
    style = 'soft'
    gain = 0.82
    seed = 1100
    startDuration = 0.27
    tickDuration = 0.16
    shutterDuration = 0.30
  }
  classic = @{
    style = 'classic'
    gain = 0.98
    seed = 2100
    startDuration = 0.23
    tickDuration = 0.13
    shutterDuration = 0.34
  }
  digital = @{
    style = 'digital'
    gain = 0.92
    seed = 3100
    startDuration = 0.24
    tickDuration = 0.11
    shutterDuration = 0.25
  }
  minimal = @{
    style = 'minimal'
    gain = 0.78
    seed = 4100
    startDuration = 0.11
    tickDuration = 0.075
    shutterDuration = 0.16
  }
}

foreach ($name in $profiles.Keys) {
  $profile = $profiles[$name]
  $obsoleteSuccessCue = Join-Path $Root "$name\success.wav"
  if (Test-Path $obsoleteSuccessCue) {
    Remove-Item -LiteralPath $obsoleteSuccessCue
  }
  Write-Wav (Join-Path $Root "$name\start.wav") (New-StartCue $profile)
  Write-Wav (Join-Path $Root "$name\tick.wav") (New-TickCue $profile)
  Write-Wav (Join-Path $Root "$name\shutter.wav") (New-ShutterCue $profile)
}

Write-Host "Generated capture audio cues in $Root"
