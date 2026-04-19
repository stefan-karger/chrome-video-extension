import { messageTypes } from "../../lib/messages"
import { tabStateKey, type TabState } from "../../lib/tab-state"

const pageMeta = must<HTMLDivElement>("page-meta")
const statusRoot = must<HTMLDivElement>("status")
const candidatesRoot = must<HTMLDivElement>("candidates")
const refreshButton = must<HTMLButtonElement>("refresh-button")
const optionsButton = must<HTMLButtonElement>("options-button")

let activeTabId: number | null = null
let currentState: TabState | null = null
let transientError: string | null = null

refreshButton.addEventListener("click", () => {
  void loadActiveTabState()
})

optionsButton.addEventListener("click", () => {
  void chrome.runtime.openOptionsPage()
})

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "session" || activeTabId === null) {
    return
  }

  if (!(tabStateKey(activeTabId) in changes)) {
    return
  }

  currentState = (changes[tabStateKey(activeTabId)].newValue as TabState | undefined) || null
  render()
})

void loadActiveTabState()

async function loadActiveTabState(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    activeTabId = tab?.id ?? null

    if (!activeTabId) {
      pageMeta.textContent = "No active tab"
      currentState = null
      render()
      return
    }

    const response = await chrome.runtime.sendMessage({
      type: messageTypes.getTabState,
      payload: { tabId: activeTabId }
    })

    if (response?.ok === false) {
      transientError = typeof response.error === "string" ? response.error : "Failed to load tab state"
    } else {
      transientError = null
      currentState = (response?.state as TabState | null) || null
    }
  } catch (error) {
    transientError = error instanceof Error ? error.message : "Failed to load tab state"
  }

  render()
}

function render(): void {
  if (!activeTabId) {
    statusRoot.innerHTML = ""
    candidatesRoot.innerHTML = '<div class="empty">Open a normal browser tab first.</div>'
    return
  }

  pageMeta.textContent = currentState?.pageTitle || currentState?.pageUrl || "No HLS request captured yet"

  renderStatus(currentState)
  renderCandidates(currentState)
}

function renderStatus(state: TabState | null): void {
  const job = state?.job

  if (transientError) {
    statusRoot.innerHTML = `
      <div class="card">
        <div><span class="pill">ERROR</span></div>
        <div class="status-line" style="margin-top: 8px;">${escapeHtml(transientError)}</div>
      </div>
    `
    return
  }

  if (!job) {
    statusRoot.innerHTML = ""
    return
  }

  const extra = job.outputPath || job.error || job.details || ""
  statusRoot.innerHTML = `
    <div class="card">
      <div><span class="pill">${escapeHtml(job.status.toUpperCase())}</span></div>
      <div class="status-line" style="margin-top: 8px;">${escapeHtml(extra)}</div>
    </div>
  `
}

function renderCandidates(state: TabState | null): void {
  const candidates = state?.candidates || []
  const activeJobId = state?.job?.candidateId
  const isBusy = state?.job?.status === "starting" || state?.job?.status === "running"

  if (candidates.length === 0) {
    candidatesRoot.innerHTML = '<div class="empty">No `.m3u8` request captured in this tab yet.</div>'
    return
  }

  candidatesRoot.innerHTML = candidates
    .map((candidate) => {
      const disabled = isBusy ? "disabled" : ""
      const isCurrent = activeJobId === candidate.id

      return `
        <div class="card">
          <div class="subtle">Seen ${new Date(candidate.seenAt).toLocaleTimeString()}</div>
          <div class="candidate-url">${escapeHtml(candidate.url)}</div>
          <div class="actions">
            <button class="primary start-download" data-id="${escapeHtml(candidate.id)}" ${disabled}>
              ${isCurrent ? "Downloading" : "Download MP4"}
            </button>
            <button class="copy-url" data-url="${escapeHtml(candidate.url)}">Copy URL</button>
          </div>
        </div>
      `
    })
    .join("")

  document.querySelectorAll<HTMLButtonElement>(".start-download").forEach((button) => {
    button.addEventListener("click", () => {
      const candidateId = button.dataset.id
      if (!candidateId || activeTabId === null) {
        return
      }

      void startDownload(activeTabId, candidateId)
    })
  })

  document.querySelectorAll<HTMLButtonElement>(".copy-url").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!button.dataset.url) {
        return
      }

      try {
        await navigator.clipboard.writeText(button.dataset.url)
      } catch (error) {
        transientError = error instanceof Error ? error.message : "Could not copy URL"
        renderStatus(currentState)
      }
    })
  })
}

async function startDownload(tabId: number, candidateId: string): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: messageTypes.startDownload,
      payload: { tabId, candidateId }
    })

    if (!response?.ok) {
      throw new Error(typeof response?.error === "string" ? response.error : "Failed to start download")
    }

    transientError = null
  } catch (error) {
    transientError = error instanceof Error ? error.message : "Failed to start download"
    renderStatus(currentState)
    return
  }

  await loadActiveTabState()
}

function must<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) {
    throw new Error(`Missing element: ${id}`)
  }

  return element as T
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}
