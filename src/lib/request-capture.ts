export interface CapturedCandidate {
  id: string
  url: string
  tabId: number
  frameId: number
  pageUrl?: string
  pageTitle?: string
  referer?: string
  origin?: string
  userAgent?: string
  headers: Record<string, string>
  seenAt: number
}

const ignoredExtensions = [".ts", ".m4s", ".mp4", ".m4a", ".mp3", ".mpd"]

export function isLikelyHlsPlaylistUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl)
    const path = url.pathname.toLowerCase()

    if (ignoredExtensions.some((extension) => path.endsWith(extension))) {
      return false
    }

    if (path.endsWith(".m3u8")) {
      return true
    }

    return path.includes("m3u8") || url.search.toLowerCase().includes("m3u8")
  } catch {
    return rawUrl.toLowerCase().includes(".m3u8")
  }
}

export function normalizeCandidateUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl)
    url.hash = ""
    return url.toString()
  } catch {
    return rawUrl
  }
}

export function headersToRecord(
  headers: chrome.webRequest.HttpHeader[] | undefined
): Record<string, string> {
  const result: Record<string, string> = {}

  for (const header of headers || []) {
    if (!header.name || typeof header.value !== "string") {
      continue
    }

    result[header.name.toLowerCase()] = header.value
  }

  return result
}

export function candidateIdFor(url: string, frameId: number): string {
  return `${normalizeCandidateUrl(url)}::${frameId}`
}
