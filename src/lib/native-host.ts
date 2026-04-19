import { getSettings } from "./tab-state"

type NativeHostResponse = {
  type: string
  payload?: Record<string, unknown>
}

let nativePort: chrome.runtime.Port | null = null
let nativePortHostName: string | null = null

export async function pingNativeHost(): Promise<NativeHostResponse> {
  const settings = await getSettings()
  return chrome.runtime.sendNativeMessage(settings.nativeHostName, {
    type: "ping",
    payload: {
      ffmpegPath: settings.ffmpegPath
    }
  })
}

export async function ensureNativePort(): Promise<chrome.runtime.Port> {
  const settings = await getSettings()

  if (nativePort && nativePortHostName === settings.nativeHostName) {
    return nativePort
  }

  if (nativePort) {
    try {
      nativePort.disconnect()
    } catch {
      // ignore disconnect errors
    }
    nativePort = null
    nativePortHostName = null
  }

  nativePort = chrome.runtime.connectNative(settings.nativeHostName)
  nativePortHostName = settings.nativeHostName
  nativePort.onDisconnect.addListener(() => {
    nativePort = null
    nativePortHostName = null
  })
  return nativePort
}

export function disconnectNativePort(): void {
  if (!nativePort) {
    return
  }

  try {
    nativePort.disconnect()
  } catch {
    // ignore disconnect errors
  }

  nativePort = null
  nativePortHostName = null
}
