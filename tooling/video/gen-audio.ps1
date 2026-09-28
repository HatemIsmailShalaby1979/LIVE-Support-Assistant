# Generate one audio file per segment from segments.json using SAPI COM (no Add-Type).
# Output: audio/seg01.mp3 ... (actually WAV-in-.mp3; ffmpeg re-encodes later)
$segs = Get-Content -Raw -Path segments.json | ConvertFrom-Json
if (-not (Test-Path audio)) { New-Item -ItemType Directory -Path audio | Out-Null }

$voice = New-Object -ComObject SAPI.SpVoice
# pick an English US voice if available
$want = $voice.GetVoices() | Where-Object { $_.GetAttribute('Language') -match '409' -or $_.GetAttribute('Name') -match 'David|Zira|US' } | Select-Object -First 1
if ($want) { $voice.Voice = $want; Write-Host ("Voice: " + $want.GetAttribute('Name')) } else { Write-Host "Voice: default" }
$voice.Rate = -1

$i = 0
foreach ($s in $segs) {
  $i++
  $name = ('seg{0:D2}.mp3' -f $i)
  $path = Join-Path audio $name
  if (Test-Path $path) { Remove-Item $path -Force }
  $text = ($s.spoken -replace '\*+', '') -replace '`', ''
  Write-Host ("[{0}/{1}] {2}" -f $i, $segs.Count, $s.title)

  $stream = New-Object -ComObject SAPI.SpFileStream
  # SAFTDefault = 0x10 (22kHz 16-bit mono); SAFT22kHz16BitMono = 34
  $stream.Open($path, 34, $false)
  $voice.AudioOutputStream = $stream
  [void]$voice.Speak($text, 0)
  $stream.Close()
  if (Test-Path $path) { Write-Host ("   wrote {0} ({1} KB)" -f $name, [math]::Round((Get-Item $path).Length/1KB,1)) }
  else { Write-Error ("FAILED " + $name) }
}
Write-Host ("Done: " + $segs.Count + " segments.")
