$ErrorActionPreference = 'Stop'

$installDirectory = Split-Path -Parent $PSScriptRoot
if (Test-Path (Join-Path $PSScriptRoot 'CoachingOS.exe')) {
  $installDirectory = $PSScriptRoot
}

$certificateDirectory = Join-Path $installDirectory 'certificates'
$pfxPath = Join-Path $certificateDirectory 'coachingos.pfx'
$certificatePath = Join-Path $certificateDirectory 'coachingos.crt'
$password = ConvertTo-SecureString 'CoachingOS-Local-HTTPS' -AsPlainText -Force
$computerName = $env:COMPUTERNAME
$ipAddresses = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object {
    $_.IPAddress -ne '127.0.0.1' -and
    $_.IPAddress -notlike '169.254.*' -and
    $_.PrefixOrigin -ne 'WellKnown'
  } |
  Select-Object -ExpandProperty IPAddress -Unique

New-Item -ItemType Directory -Path $certificateDirectory -Force | Out-Null

$sanEntries = @('DNS=localhost', "DNS=$computerName", 'IPAddress=127.0.0.1')
foreach ($ipAddress in $ipAddresses) {
  $sanEntries += "IPAddress=$ipAddress"
}

$certificate = New-SelfSignedCertificate `
  -Subject "CN=CoachingOS Local Server" `
  -FriendlyName 'CoachingOS Local HTTPS' `
  -CertStoreLocation 'Cert:\LocalMachine\My' `
  -KeyAlgorithm RSA `
  -KeyLength 2048 `
  -HashAlgorithm SHA256 `
  -KeyExportPolicy Exportable `
  -NotAfter (Get-Date).AddYears(10) `
  -TextExtension @(
    "2.5.29.17={text}$($sanEntries -join '&')",
    '2.5.29.37={text}1.3.6.1.5.5.7.3.1'
  )

Export-PfxCertificate -Cert $certificate -FilePath $pfxPath -Password $password -Force | Out-Null
Export-Certificate -Cert $certificate -FilePath $certificatePath -Force | Out-Null
Import-Certificate -FilePath $certificatePath -CertStoreLocation 'Cert:\LocalMachine\Root' | Out-Null

Write-Host ''
Write-Host 'CoachingOS HTTPS was enabled.'
Write-Host "Certificate: $certificatePath"
Write-Host 'Restart CoachingOS and use:'
Write-Host '  https://127.0.0.1:5000'
if ($ipAddresses) {
  foreach ($ipAddress in $ipAddresses) {
    Write-Host "  https://${ipAddress}:5000"
  }
}
Write-Host ''
Write-Host 'Other devices must trust coachingos.crt before their browser will allow camera access.'
