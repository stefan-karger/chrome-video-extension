export interface JobState {
  jobId: string
  candidateId: string
  status: "idle" | "starting" | "running" | "done" | "error"
  startedAt: number
  updatedAt: number
  outputPath?: string
  error?: string
  details?: string
}

export interface TabCandidate {
  id: string
  url: string
  pageUrl?: string
  pageTitle?: string
  referer?: string
  origin?: string
  userAgent?: string
  headers: Record<string, string>
  seenAt: number
  frameId: number
}

export interface TabState {
  tabId: number
  pageUrl?: string
  pageTitle?: string
  updatedAt: number
  candidates: TabCandidate[]
  job?: JobState
}

export interface ExtensionSettings {
  nativeHostName: string
  ffmpegPath: string
  outputDir: string
  forwardCredentialHeaders: boolean
}

export const defaultSettings: ExtensionSettings = {
  nativeHostName: "com.stefan.hls_downloader",
  ffmpegPath: "ffmpeg",
  outputDir: "",
  forwardCredentialHeaders: false
}

export function tabStateKey(tabId: number): string {
  return `tab:${tabId}`
}

export async function getTabState(tabId: number): Promise<TabState | null> {
  const stored = await chrome.storage.session.get(tabStateKey(tabId))
  return (stored[tabStateKey(tabId)] as TabState | undefined) || null
}

export async function setTabState(state: TabState): Promise<void> {
  await chrome.storage.session.set({
    [tabStateKey(state.tabId)]: state
  })
}

export async function clearTabState(tabId: number): Promise<void> {
  await chrome.storage.session.remove(tabStateKey(tabId))
}

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(defaultSettings)
  return {
    nativeHostName: stored.nativeHostName || defaultSettings.nativeHostName,
    ffmpegPath: stored.ffmpegPath || defaultSettings.ffmpegPath,
    outputDir: stored.outputDir || defaultSettings.outputDir,
    forwardCredentialHeaders:
      typeof stored.forwardCredentialHeaders === "boolean"
        ? stored.forwardCredentialHeaders
        : defaultSettings.forwardCredentialHeaders
  }
}
