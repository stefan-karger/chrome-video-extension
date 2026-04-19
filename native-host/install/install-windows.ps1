param(
  [Parameter(Mandatory = $true)]
  [string]$ExtensionId,

  [string]$HostName = "com.stefan.hls_downloader",

  [string]$InstallRoot = "$env:LOCALAPPDATA\HlsDownloaderNativeHost"
)

$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$hostSourcePath = Join-Path $scriptRoot "..\host.cjs"

if (-not (Test-Path -LiteralPath $hostSourcePath)) {
  throw "Missing host script: $hostSourcePath"
}

$nodeCommand = Get-Command node -ErrorAction Stop

New-Item -ItemType Directory -Path $InstallRoot -Force | Out-Null

$hostTargetPath = Join-Path $InstallRoot "host.cjs"
Copy-Item -LiteralPath $hostSourcePath -Destination $hostTargetPath -Force

$wrapperPath = Join-Path $InstallRoot "host.cmd"
$wrapperContent = "@echo off`r`n`"$($nodeCommand.Source)`" `"%~dp0host.cjs`" %*`r`n"
Set-Content -LiteralPath $wrapperPath -Value $wrapperContent -Encoding Ascii

$manifestPath = Join-Path $InstallRoot "$HostName.json"
$manifest = @{
  name = $HostName
  description = "Native host for personal HLS downloader project"
  path = $wrapperPath
  type = "stdio"
  allowed_origins = @("chrome-extension://$ExtensionId/")
}

$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

$registryKey = "HKCU\Software\Google\Chrome\NativeMessagingHosts\$HostName"
reg.exe ADD $registryKey /ve /t REG_SZ /d $manifestPath /f | Out-Null

Write-Host "Installed host script: $hostTargetPath"
Write-Host "Installed manifest: $manifestPath"
Write-Host "Registered native host key: $registryKey"
