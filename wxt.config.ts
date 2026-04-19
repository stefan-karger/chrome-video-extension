import { defineConfig } from "wxt"

export default defineConfig({
  srcDir: "src",
  outDir: ".output",
  manifest: {
    name: "HLS Downloader V2",
    version: "0.1.0",
    description: "Capture HLS playlists and hand downloads to a local ffmpeg host",
    permissions: ["nativeMessaging", "storage", "tabs", "webRequest"],
    host_permissions: ["<all_urls>"],
    action: {
      default_title: "HLS Downloader",
      default_popup: "popup.html"
    },
    options_ui: {
      page: "options.html",
      open_in_tab: true
    },
    background: {
      service_worker: "background.js",
      type: "module"
    }
  }
})
