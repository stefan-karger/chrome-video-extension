param(
  [string]$HostName = "com.stefan.hls_downloader",
  [string]$InstallRoot = "$env:LOCALAPPDATA\HlsDownloaderNativeHost"
)

$ErrorActionPreference = "Stop"

$registryKey = "HKCU\Software\Google\Chrome\NativeMessagingHosts\$HostName"
reg.exe DELETE $registryKey /f | Out-Null

if (Test-Path -LiteralPath $InstallRoot) {
  Remove-Item -LiteralPath $InstallRoot -Recurse -Force
}

Write-Host "Removed native host key: $registryKey"
Write-Host "Removed install directory: $InstallRoot"
