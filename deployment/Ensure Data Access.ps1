param(
  [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'
$dataDirectory = 'C:\ProgramData\CoachingOS'
$statePath = Join-Path $dataDirectory 'license-state.json'

function Test-DataAccess {
  try {
    New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null
    $testPath = Join-Path $dataDirectory "access-test-$PID.tmp"
    [System.IO.File]::WriteAllText($testPath, 'ok')
    Remove-Item -LiteralPath $testPath -Force

    if (Test-Path -LiteralPath $statePath) {
      $stream = [System.IO.File]::Open($statePath, 'Open', 'ReadWrite', 'Read')
      $stream.Dispose()
    }

    Get-ChildItem -LiteralPath $dataDirectory -Filter 'license-state*.tmp' -Force |
      Remove-Item -Force -ErrorAction Stop
    return $true
  } catch {
    return $false
  }
}

if ($CheckOnly) {
  if (Test-DataAccess) {
    exit 0
  }
  exit 1
}

New-Item -ItemType Directory -Path $dataDirectory -Force | Out-Null
$interactiveUser = (Get-CimInstance Win32_ComputerSystem).UserName
if (-not $interactiveUser) {
  throw 'Unable to determine the logged-in Windows user.'
}

& icacls.exe $dataDirectory /grant:r "${interactiveUser}:(OI)(CI)M" /T /C | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw 'Unable to grant CoachingOS data access.'
}

Get-ChildItem -LiteralPath $dataDirectory -Filter 'license-state*.tmp' -Force |
  Remove-Item -Force -ErrorAction SilentlyContinue

if (-not (Test-DataAccess)) {
  throw 'CoachingOS data access is still unavailable after repair.'
}

Write-Host 'CoachingOS data access repaired.'
