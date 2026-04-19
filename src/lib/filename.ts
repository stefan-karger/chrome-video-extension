export function sanitizeBaseName(input: string): string {
  const cleaned = input
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (!cleaned) {
    return "video"
  }

  return cleaned.slice(0, 120)
}

export function buildSuggestedBaseName(title: string | undefined, pageUrl: string | undefined): string {
  const host = safeHost(pageUrl)
  const safeTitle = sanitizeBaseName(title || "")

  if (safeTitle && host) {
    return `${safeTitle} - ${host}`
  }

  if (safeTitle) {
    return safeTitle
  }

  return host || "video"
}

function safeHost(pageUrl: string | undefined): string {
  if (!pageUrl) {
    return ""
  }

  try {
    return new URL(pageUrl).hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}
