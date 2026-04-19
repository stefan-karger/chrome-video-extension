import { messageTypes } from "../../lib/messages"
import { defaultSettings } from "../../lib/tab-state"

const nativeHostNameInput = must<HTMLInputElement>("native-host-name")
const ffmpegPathInput = must<HTMLInputElement>("ffmpeg-path")
const outputDirInput = must<HTMLInputElement>("output-dir")
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
}

async function saveSettings(): Promise<void> {
  await chrome.storage.local.set({
    nativeHostName: nativeHostNameInput.value.trim() || defaultSettings.nativeHostName,
    ffmpegPath: ffmpegPathInput.value.trim() || defaultSettings.ffmpegPath,
    outputDir: outputDirInput.value.trim()
  })

  hostStatusRoot.textContent = "Settings saved"
}

async function pingNativeHost(): Promise<void> {
  hostStatusRoot.textContent = "Checking native host..."

  try {
    const response = await chrome.runtime.sendMessage({
      type: messageTypes.pingNativeHost
    })

    hostStatusRoot.textContent = JSON.stringify(response.response ?? response, null, 2)
  } catch (error) {
    hostStatusRoot.textContent = error instanceof Error ? error.message : "Ping failed"
  }
}

function must<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) {
    throw new Error(`Missing element: ${id}`)
  }

  return element as T
}
