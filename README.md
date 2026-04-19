# HLS Downloader V2

Small Chrome MV3 extension focused on one job:

- detect real HLS playlist requests
- show them in a simple popup
- send the chosen playlist to a local native host
- let the host use the machine's installed `ffmpeg` to save a single MP4

## Architecture

- `src/entrypoints/background.ts`: captures `.m3u8` requests with `chrome.webRequest`, stores per-tab state, and talks to the native host
- `src/entrypoints/popup/`: popup UI for the active tab
- `src/entrypoints/options/`: local settings for host name, ffmpeg path, output directory, and credential forwarding
- `native-host/host.cjs`: native messaging host that runs local `ffmpeg`

There are no content scripts and no injected page scripts in this version.

## Extension Setup

1. Install dependencies:

```bash
pnpm install
```

2. Run dev mode:

```bash
pnpm dev
```

3. Load the generated extension folder in Chrome (`chrome://extensions`, Developer mode, "Load unpacked").

4. Open the extension options page and copy the extension ID.

## Native Host Setup (Windows 11, Chrome)

This is the primary target runtime.

1. Make sure Node.js and `ffmpeg` are installed and available in `PATH`.
2. Run the installer from PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File ".\native-host\install\install-windows.ps1" -ExtensionId "<extension-id>"
```

This installs host files under `%LOCALAPPDATA%\HlsDownloaderNativeHost`, creates the native host manifest, and registers:

- `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.stefan.hls_downloader`

Uninstall:

```powershell
powershell -ExecutionPolicy Bypass -File ".\native-host\install\uninstall-windows.ps1"
```

## Native Host Setup (Linux)

```bash
./native-host/install/install-linux.sh <extension-id> "$(pwd)/native-host/host.cjs"
```

## Security Notes

- By default, credential headers are **not** forwarded to `ffmpeg`.
- In options, enable "Forward credential headers to ffmpeg" only when an authenticated stream requires `Cookie` or `Authorization`.
- The extension only stores and forwards a small header allowlist; it does not capture all request headers.

## WSL Note

If development happens inside WSL but usage is Windows Chrome, native messaging must still be installed in the Windows environment (Windows file paths + Windows registry). Linux host registration in WSL does not make the host visible to Windows Chrome.

## Troubleshooting

- `Specified native messaging host not found`:
  - confirm the registry key exists under `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.stefan.hls_downloader`
  - confirm the manifest path exists and JSON is valid
  - confirm `allowed_origins` contains your current extension ID
- `Ping native host` fails in options:
  - verify `node` is available in `PATH`
  - verify `ffmpeg` path is valid
- Download fails immediately:
  - verify output directory exists or can be created
  - verify output directory is writable
