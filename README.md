# HLS Downloader V2

Small Chrome MV3 extension focused on one job:

- detect real HLS playlist requests
- show them in a simple popup
- send the chosen playlist to a local native host
- let the host use the machine's installed `ffmpeg` to save a single MP4

## Architecture

- `background.ts`: captures `.m3u8` requests with `chrome.webRequest`, stores per-tab state, and talks to the native host
- `popup/`: plain HTML + TypeScript UI for the active tab
- `options/`: local settings for host name, ffmpeg path, and output directory
- `native-host/host.js`: native messaging host that runs local `ffmpeg`

There are no content scripts and no injected page scripts in this version.

## Quick Start

1. Install dependencies:

```bash
pnpm install
```

2. Run the extension build/dev server:

```bash
pnpm dev
```

3. Load the generated extension folder in Chrome.

4. Open the extension popup once and copy the extension ID from the options page.

5. Install the native host manifest, replacing the placeholder extension ID:

```bash
./native-host/install/install-linux.sh <extension-id> "$(pwd)/native-host/host.js"
```

6. Make sure `ffmpeg` is installed and available in `PATH`.

## Notes

- This setup is intentionally Linux-first because the current workspace is Linux.
- The native host manifest uses a fixed host name by default: `com.stefan.hls_downloader`.
- The popup will only show HLS playlist candidates, not transport segments.
