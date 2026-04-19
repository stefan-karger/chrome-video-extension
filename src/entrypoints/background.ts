import { defineBackground } from "wxt/utils/define-background"

import { buildSuggestedBaseName } from "../lib/filename"
import { messageTypes, type ExtensionMessage } from "../lib/messages"
import { disconnectNativePort, ensureNativePort, pingNativeHost } from "../lib/native-host"
import {
  candidateIdFor,
  headersToRecord,
  isLikelyHlsPlaylistUrl,
  normalizeCandidateUrl
} from "../lib/request-capture"
import {
  clearTabState,
  defaultSettings,
  getSettings,
  getTabState,
  setTabState,
  type JobState,
  type TabCandidate,
  type TabState
} from "../lib/tab-state"

export default defineBackground(() => {
  chrome.webRequest.onBeforeSendHeaders.addListener(
    (details) => {
      void capturePlaylistRequest(details)
    },
    {
      urls: ["<all_urls>"],
      types: ["xmlhttprequest", "media", "other"]
    },
    ["requestHeaders", "extraHeaders"]
  )

  chrome.tabs.onRemoved.addListener((tabId) => {
    void clearTabState(tabId)
    void updateBadge(tabId, 0)
  })

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === "loading") {
      void clearTabState(tabId)
      void updateBadge(tabId, 0)
    }
  })

  chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
    void handleMessage(message)
      .then((response) => sendResponse(response))
      .catch((error: unknown) => {
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : "Unknown error"
        })
      })

    return true
  })
})

async function handleMessage(message: ExtensionMessage): Promise<Record<string, unknown>> {
  switch (message.type) {
    case messageTypes.getTabState: {
      const state = await getTabState(message.payload.tabId)
      return { ok: true, state }
    }

    case messageTypes.startDownload: {
      const result = await startDownload(message.payload.tabId, message.payload.candidateId)
      return { ok: true, ...result }
    }

    case messageTypes.pingNativeHost: {
      const response = await pingNativeHost()
      return { ok: true, response }
    }

    case messageTypes.resetNativePort: {
      disconnectNativePort()
      return { ok: true }
    }
  }
}

const tabUpdateQueue = new Map<number, Promise<void>>()

async function capturePlaylistRequest(details: chrome.webRequest.WebRequestHeadersDetails): Promise<void> {
  if (details.tabId < 0) {
    return
  }

  if (!isLikelyHlsPlaylistUrl(details.url)) {
    return
  }

  await enqueueTabUpdate(details.tabId, async () => {
    const [tab, settings] = await Promise.all([safeGetTab(details.tabId), getSettings()])
    const headers = headersToRecord(details.requestHeaders, settings.forwardCredentialHeaders)
    const id = candidateIdFor(details.url, details.frameId)

    const state =
      (await getTabState(details.tabId)) || {
        tabId: details.tabId,
        candidates: [],
        updatedAt: Date.now()
      }

    const candidate: TabCandidate = {
      id,
      url: normalizeCandidateUrl(details.url),
      pageUrl: tab?.url,
      pageTitle: tab?.title,
      frameId: details.frameId,
      seenAt: Date.now(),
      referer: headers.referer,
      origin: headers.origin,
      userAgent: headers["user-agent"],
      headers
    }

    state.pageUrl = tab?.url || state.pageUrl
    state.pageTitle = tab?.title || state.pageTitle
    state.updatedAt = Date.now()
    state.candidates = dedupeCandidates([candidate, ...state.candidates]).slice(0, 12)

    await setTabState(state)
    await updateBadge(details.tabId, state.candidates.length)
  })
}

function enqueueTabUpdate(tabId: number, updater: () => Promise<void>): Promise<void> {
  const previous = tabUpdateQueue.get(tabId) || Promise.resolve()

  const next = previous.catch(() => undefined).then(updater)
  tabUpdateQueue.set(tabId, next)

  next.finally(() => {
    if (tabUpdateQueue.get(tabId) === next) {
      tabUpdateQueue.delete(tabId)
    }
  })

  return next
}

function dedupeCandidates(candidates: TabCandidate[]): TabCandidate[] {
  const seen = new Set<string>()
  const result: TabCandidate[] = []

  for (const candidate of candidates) {
    if (seen.has(candidate.id)) {
      continue
    }

    seen.add(candidate.id)
    result.push(candidate)
  }

  return result.sort((left, right) => right.seenAt - left.seenAt)
}

async function startDownload(
  tabId: number,
  candidateId: string
): Promise<{ jobId: string }> {
  const state = await getTabState(tabId)
  if (!state) {
    throw new Error("No captured HLS playlist found for this tab")
  }

  const candidate = state.candidates.find((entry) => entry.id === candidateId)
  if (!candidate) {
    throw new Error("Playlist candidate no longer exists")
  }

  if (state.job && (state.job.status === "starting" || state.job.status === "running")) {
    throw new Error("A download is already running for this tab")
  }

  const settings = await getSettings()
  const port = await ensureNativePort()
  bindNativePort(port)

  const jobId = `${tabId}-${Date.now()}`
  const job: JobState = {
    jobId,
    candidateId,
    status: "starting",
    startedAt: Date.now(),
    updatedAt: Date.now(),
    details: "Launching ffmpeg"
  }

  state.job = job
  state.updatedAt = Date.now()
  await setTabState(state)

  port.postMessage({
    type: "start_job",
    payload: {
      jobId,
      tabId,
      inputUrl: candidate.url,
      ffmpegPath: settings.ffmpegPath || defaultSettings.ffmpegPath,
      outputDir: settings.outputDir,
      baseName: buildSuggestedBaseName(candidate.pageTitle, candidate.pageUrl),
      requestHeaders: candidate.headers,
      referer: candidate.referer,
      userAgent: candidate.userAgent
    }
  })

  return { jobId }
}

let nativePortBound = false

function bindNativePort(port: chrome.runtime.Port): void {
  if (nativePortBound) {
    return
  }

  nativePortBound = true

  port.onMessage.addListener((message: { type?: string; payload?: Record<string, unknown> }) => {
    void handleNativeMessage(message)
  })

  port.onDisconnect.addListener(async () => {
    nativePortBound = false
  })
}

async function handleNativeMessage(message: {
  type?: string
  payload?: Record<string, unknown>
}): Promise<void> {
  if (!message.type || !message.payload) {
    return
  }

  const tabId = numberValue(message.payload.tabId)
  if (tabId === null) {
    return
  }

  const state = await getTabState(tabId)
  if (!state?.job) {
    return
  }

  switch (message.type) {
    case "job_started": {
      state.job.status = "running"
      state.job.updatedAt = Date.now()
      state.job.details = "ffmpeg started"
      break
    }

    case "job_progress": {
      state.job.status = "running"
      state.job.updatedAt = Date.now()
      const outTime = stringValue(message.payload.outTime)
      const speed = stringValue(message.payload.speed)
      state.job.details = [outTime, speed].filter(Boolean).join(" | ") || "Downloading"
      break
    }

    case "job_done": {
      state.job.status = "done"
      state.job.updatedAt = Date.now()
      state.job.outputPath = stringValue(message.payload.outputPath) || undefined
      state.job.details = "Download complete"
      break
    }

    case "job_error": {
      state.job.status = "error"
      state.job.updatedAt = Date.now()
      state.job.error = stringValue(message.payload.error) || "Download failed"
      state.job.details = sanitizeStatusText(stringValue(message.payload.stderr) || state.job.error)
      break
    }

    default:
      return
  }

  state.updatedAt = Date.now()
  await setTabState(state)
}

async function updateBadge(tabId: number, count: number): Promise<void> {
  await chrome.action.setBadgeBackgroundColor({
    color: "#1f6feb",
    tabId
  })
  await chrome.action.setBadgeText({
    tabId,
    text: count > 0 ? String(count) : ""
  })
}

async function safeGetTab(tabId: number): Promise<chrome.tabs.Tab | null> {
  try {
    return await chrome.tabs.get(tabId)
  } catch {
    return null
  }
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function sanitizeStatusText(value: string): string {
  return value.replace(/https?:\/\/\S+/g, (raw) => {
    try {
      const parsed = new URL(raw)
      parsed.search = ""
      return parsed.toString()
    } catch {
      return raw
    }
  })
}
