import { getSettings } from "./tab-state"

type NativeHostResponse = {
  type: string
  payload?: Record<string, unknown>
}

let nativePort: chrome.runtime.Port | null = null

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
  if (nativePort) {
    return nativePort
  }

  const settings = await getSettings()
  nativePort = chrome.runtime.connectNative(settings.nativeHostName)
  nativePort.onDisconnect.addListener(() => {
    nativePort = null
  })
  return nativePort
}
