import { messageTypes } from "../../lib/messages"
import { defaultSettings } from "../../lib/tab-state"

const nativeHostNameInput = must<HTMLInputElement>("native-host-name")
const ffmpegPathInput = must<HTMLInputElement>("ffmpeg-path")
const outputDirInput = must<HTMLInputElement>("output-dir")
const forwardCredentialHeadersInput = must<HTMLInputElement>("forward-credential-headers")
const extensionIdRoot = must<HTMLDivElement>("extension-id")
const hostStatusRoot = must<HTMLDivElement>("host-status")
const saveButton = must<HTMLButtonElement>("save-button")
const pingButton = must<HTMLButtonElement>("ping-button")

extensionIdRoot.textContent = chrome.runtime.id

saveButton.addEventListener("click", () => {
  void saveSettings()
})

pingButton.addEventListener("click", () => {
  void pingNativeHost()
})

void loadSettings()

async function loadSettings(): Promise<void> {
  const stored = await chrome.storage.local.get(defaultSettings)
  nativeHostNameInput.value = stored.nativeHostName || defaultSettings.nativeHostName
  ffmpegPathInput.value = stored.ffmpegPath || defaultSettings.ffmpegPath
  outputDirInput.value = stored.outputDir || defaultSettings.outputDir
  forwardCredentialHeadersInput.checked =
    typeof stored.forwardCredentialHeaders === "boolean"
      ? stored.forwardCredentialHeaders
      : defaultSettings.forwardCredentialHeaders
}

async function saveSettings(): Promise<void> {
  await chrome.storage.local.set({
    nativeHostName: nativeHostNameInput.value.trim() || defaultSettings.nativeHostName,
    ffmpegPath: ffmpegPathInput.value.trim() || defaultSettings.ffmpegPath,
    outputDir: outputDirInput.value.trim(),
    forwardCredentialHeaders: forwardCredentialHeadersInput.checked
  })

  try {
    await chrome.runtime.sendMessage({
      type: messageTypes.resetNativePort
    })
  } catch {
    // ignore reset failures; settings are already persisted
  }

  hostStatusRoot.textContent = "Settings saved"
}

async function pingNativeHost(): Promise<void> {
  hostStatusRoot.textContent = "Checking native host..."

  try {
    const response = await chrome.runtime.sendMessage({
      type: messageTypes.pingNativeHost
    })

    if (response?.ok === false) {
      hostStatusRoot.textContent = typeof response.error === "string" ? response.error : "Ping failed"
      return
    }

    hostStatusRoot.textContent = formatPingStatus(response?.response ?? response)
  } catch (error) {
    hostStatusRoot.textContent = error instanceof Error ? error.message : "Ping failed"
  }
}

function formatPingStatus(value: unknown): string {
  const payload = value as {
    type?: string
    payload?: {
      ok?: boolean
      ffmpegPath?: string
      ffmpegVersion?: string
      stderr?: string
    }
  }

  const ok = payload?.payload?.ok === true
  const ffmpegPath = payload?.payload?.ffmpegPath || "ffmpeg"
  const ffmpegVersion = payload?.payload?.ffmpegVersion || ""
  const stderr = payload?.payload?.stderr || ""
  const status = ok ? "Native host is reachable and ffmpeg is available." : "Native host is reachable, but ffmpeg check failed."

  return [
    status,
    `ffmpeg path: ${ffmpegPath}`,
    ffmpegVersion ? `version: ${ffmpegVersion}` : "",
    stderr ? `stderr: ${stderr}` : ""
  ]
    .filter(Boolean)
    .join("\n")
}

function must<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) {
    throw new Error(`Missing element: ${id}`)
  }

  return element as T
}
