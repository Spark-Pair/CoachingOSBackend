param(
  [string]$Version = '',

  [ValidateSet('optional', 'mandatory')]
  [string]$UpdateType = 'optional',

  [string]$Notes = '',

  [switch]$Draft
)

$ErrorActionPreference = 'Stop'

if ($Version -notmatch '^\d+\.\d+\.\d+$') {
  throw 'Version must contain three numbers separated by dots, for example 1.2.0.'
}

$backendRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$workspaceRoot = (Resolve-Path (Join-Path $backendRoot '..')).Path
$frontendRoot = Join-Path $workspaceRoot 'CoachingOS'
$manualUpdateDirectory = Join-Path $workspaceRoot 'ManualUpdate'
$tag = "v$Version"
$repository = 'Spark-Pair/CoachingOSBackend'
$assetName = "CoachingOS-ManualUpdate-v$Version.zip"
$assetPath = Join-Path $workspaceRoot $assetName
$checksumPath = "$assetPath.sha256.txt"
$metadataPath = Join-Path $workspaceRoot 'update.json'
$notesPath = Join-Path $workspaceRoot "release-notes-v$Version.md"
$ghCandidates = @(
  (Get-Command gh -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1),
  (Join-Path $env:LOCALAPPDATA 'Programs\GitHub CLI\bin\gh.exe'),
  'C:\Program Files\GitHub CLI\gh.exe'
) | Where-Object { $_ -and (Test-Path $_) }
$gh = $ghCandidates | Select-Object -First 1

function Invoke-Git {
  param([string]$RepositoryPath, [string[]]$Arguments)
  $output = & git -C $RepositoryPath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Git command failed in $RepositoryPath`: git $($Arguments -join ' ')"
  }
  return $output
}

function Assert-RepositoryReady {
  param([string]$RepositoryPath, [string]$Label)

  $changes = Invoke-Git $RepositoryPath @('status', '--porcelain')
  $sourceChanges = @($changes | Where-Object {
    $_ -and $_ -notmatch '^[ MADRCU?!]{2} build(?:-updater)?/'
  })
  if ($sourceChanges.Count -gt 0) {
    throw "$Label has uncommitted changes. Commit or discard them before publishing a release."
  }

  Invoke-Git $RepositoryPath @('fetch', 'origin', 'main') | Out-Null
  $branch = (Invoke-Git $RepositoryPath @('branch', '--show-current')).Trim()
  if ($branch -ne 'main') {
    throw "$Label must be on the main branch. Current branch: $branch"
  }

  $localCommit = (Invoke-Git $RepositoryPath @('rev-parse', 'HEAD')).Trim()
  $remoteCommit = (Invoke-Git $RepositoryPath @('rev-parse', 'origin/main')).Trim()
  if ($localCommit -ne $remoteCommit) {
    throw "$Label main does not match origin/main. Push or pull before publishing."
  }

  return $localCommit
}

if (-not $gh) {
  throw 'GitHub CLI is not installed. Install it and run: gh auth login'
}

& $gh auth status | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw 'GitHub CLI is not authenticated. Run: gh auth login --web --git-protocol https'
}

$previousErrorPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
& $gh release view $tag --repo $repository --json tagName 2> $null | Out-Null
$releaseExists = $LASTEXITCODE -eq 0
$ErrorActionPreference = $previousErrorPreference
if ($releaseExists) {
  throw "Release $tag already exists."
}

Write-Host 'Checking source repositories...' -ForegroundColor Cyan
$frontendCommit = Assert-RepositoryReady $frontendRoot 'Frontend repository'
$backendCommit = Assert-RepositoryReady $backendRoot 'Backend repository'
$existingTag = Invoke-Git $backendRoot @('ls-remote', '--tags', 'origin', "refs/tags/$tag")
if ($existingTag) {
  throw "Git tag $tag already exists. Choose a new version number."
}

Write-Host "Building CoachingOS $Version..." -ForegroundColor Cyan
$env:COACHINGOS_VERSION = $Version
& npm.cmd run release:update
if ($LASTEXITCODE -ne 0) {
  throw 'Update package build failed.'
}

if (Test-Path $assetPath) {
  Remove-Item -LiteralPath $assetPath -Force
}
Compress-Archive -Path (Join-Path $manualUpdateDirectory '*') -DestinationPath $assetPath -CompressionLevel Optimal

$checksum = (Get-FileHash -LiteralPath $assetPath -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath $checksumPath -Value "$checksum  $assetName" -Encoding ascii

$downloadUrl = "https://github.com/$repository/releases/download/$tag/$assetName"
$releaseUrl = "https://github.com/$repository/releases/tag/$tag"
$metadata = [ordered]@{
  version = $Version
  mandatory = $UpdateType -eq 'mandatory'
  publishedAt = (Get-Date).ToUniversalTime().ToString('o')
  downloadUrl = $downloadUrl
  releaseUrl = $releaseUrl
  sha256 = $checksum
  assetName = $assetName
  frontendCommit = $frontendCommit
  backendCommit = $backendCommit
}
$metadata | ConvertTo-Json | Set-Content -LiteralPath $metadataPath -Encoding utf8

if (-not $Notes.Trim()) {
  $Notes = "CoachingOS $Version update."
}

$releaseNotes = @"
# CoachingOS $Version

$Notes

**Update type:** $UpdateType

## Installation

1. Download $assetName.
2. Extract it outside C:\CoachingOS.
3. Run RUN UPDATE.bat.
4. Delete the extracted update files after the update succeeds.

The updater creates a database safety backup before changing application files.

## Build

- Frontend commit: $frontendCommit
- Backend commit: $backendCommit
- SHA-256: $checksum
"@
Set-Content -LiteralPath $notesPath -Value $releaseNotes -Encoding utf8

Write-Host ''
Write-Host "Version: $Version"
Write-Host "Update type: $UpdateType"
Write-Host "Asset: $assetPath"
Write-Host "Repository: $repository"
Write-Host ''

$confirmation = Read-Host "Type RELEASE to publish $tag"
if ($confirmation -cne 'RELEASE') {
  throw 'Release cancelled. No GitHub release was created.'
}

$arguments = @(
  'release', 'create', $tag,
  $assetPath,
  $checksumPath,
  $metadataPath,
  '--repo', $repository,
  '--target', $backendCommit,
  '--title', "CoachingOS $Version",
  '--notes-file', $notesPath,
  '--latest'
)
if ($Draft) {
  $arguments += '--draft'
}

Write-Host 'Uploading release assets to GitHub...' -ForegroundColor Cyan
& $gh @arguments
if ($LASTEXITCODE -ne 0) {
  throw 'GitHub release creation failed.'
}

Write-Host ''
Write-Host "Release created: $releaseUrl" -ForegroundColor Green
Write-Host "Latest metadata: https://github.com/$repository/releases/latest/download/update.json"
