param(
  [string]$PfxPassword = 'change-me',
  [switch]$NoPause
)

$ErrorActionPreference = 'Stop'

function Get-PrimaryLanIp {
  $ip = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object {
      $_.IPAddress -notlike '127.*' -and
      $_.IPAddress -notlike '169.254.*' -and
      $_.PrefixOrigin -ne 'WellKnown' -and
      $_.IPAddress -match '^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)'
    } |
    Sort-Object InterfaceMetric, InterfaceIndex |
    Select-Object -First 1 -ExpandProperty IPAddress

  if (-not $ip) {
    throw 'Could not detect a private LAN IPv4 address. Connect to WiFi/LAN and try again.'
  }

  return $ip
}

$installDirectory = Split-Path -Parent $PSScriptRoot
if (Test-Path (Join-Path $PSScriptRoot 'CoachingOS.exe')) {
  $installDirectory = $PSScriptRoot
}

$certificateDirectory = Join-Path $installDirectory 'certificates'
$pfxPath = Join-Path $certificateDirectory 'coachingos.pfx'
$certificatePath = Join-Path $certificateDirectory 'coachingos.crt'
$password = ConvertTo-SecureString $PfxPassword -AsPlainText -Force
$lanIp = Get-PrimaryLanIp
$computerName = $env:COMPUTERNAME

New-Item -ItemType Directory -Path $certificateDirectory -Force | Out-Null

$cert = New-SelfSignedCertificate `
  -Subject "CN=$lanIp" `
  -FriendlyName 'CoachingOS Local Camera HTTPS' `
  -CertStoreLocation 'Cert:\LocalMachine\My' `
  -KeyAlgorithm RSA `
  -KeyLength 2048 `
  -HashAlgorithm SHA256 `
  -KeyExportPolicy Exportable `
  -NotAfter (Get-Date).AddYears(2) `
  -TextExtension @(
    "2.5.29.17={text}DNS=localhost&DNS=$computerName&IPAddress=127.0.0.1&IPAddress=$lanIp",
    '2.5.29.37={text}1.3.6.1.5.5.7.3.1'
  )

Export-PfxCertificate -Cert $cert -FilePath $pfxPath -Password $password -Force | Out-Null
Export-Certificate -Cert $cert -FilePath $certificatePath -Force | Out-Null

Write-Host ''
Write-Host 'CoachingOS HTTPS certificate was created for camera support.'
Write-Host "LAN IP:      $lanIp"
Write-Host "PFX:         $pfxPath"
Write-Host "Certificate: $certificatePath"
Write-Host ''
Write-Host 'Important: browsers may still show Not secure / Advanced warning unless this certificate is trusted on the device.'
Write-Host "Teacher scan URL: https://${lanIp}:5000/scan"

if (-not $NoPause) {
  Write-Host ''
  pause
}
