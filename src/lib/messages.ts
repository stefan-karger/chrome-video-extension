export const messageTypes = {
  getTabState: "GET_TAB_STATE",
  startDownload: "START_DOWNLOAD",
  pingNativeHost: "PING_NATIVE_HOST"
} as const

export interface GetTabStateMessage {
  type: typeof messageTypes.getTabState
  payload: {
    tabId: number
  }
}

export interface StartDownloadMessage {
  type: typeof messageTypes.startDownload
  payload: {
    tabId: number
    candidateId: string
  }
}

export interface PingNativeHostMessage {
  type: typeof messageTypes.pingNativeHost
}

export type ExtensionMessage =
  | GetTabStateMessage
  | StartDownloadMessage
  | PingNativeHostMessage
