param([Parameter(Mandatory = $true)][string]$Path)
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try {
  Add-Type -AssemblyName System.Speech
  $recognizers = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
  if (-not $recognizers -or $recognizers.Count -eq 0) {
    Write-Output "ERROR no-recognizer"
    exit 0
  }
  $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine($recognizers[0].Culture)
  $engine.SetInputToWaveFile($Path)
  $phrases = @(
    "smaller", "small step", "do it", "start focus", "rest", "take a break",
    "not now", "later", "change", "another one", "mark done", "mark it as done",
    "complete", "open today", "open my tasks", "read the recommendation",
    "read this", "stop reading", "add task"
  )
  $choices = New-Object System.Speech.Recognition.Choices
  foreach ($phrase in $phrases) { [void]$choices.Add($phrase) }
  $builder = New-Object System.Speech.Recognition.GrammarBuilder
  $builder.Culture = $recognizers[0].Culture
  $builder.Append($choices)
  $engine.LoadGrammar((New-Object System.Speech.Recognition.Grammar($builder)))
  $engine.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
  $result = $engine.Recognize()
  $engine.Dispose()
  if (-not $result -or -not $result.Text) { Write-Output "NONE"; exit 0 }
  $text = ($result.Text -replace "[\r\n\t]", " ").Trim()
  Write-Output ("OK`t" + [math]::Round($result.Confidence, 3) + "`t" + $text)
} catch {
  Write-Output ("ERROR " + $_.Exception.Message)
}
