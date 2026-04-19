#!/usr/bin/env node

const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawn, spawnSync } = require("node:child_process")

let currentJob = null
let readBuffer = Buffer.alloc(0)

process.stdin.on("readable", readMessages)
process.stdin.on("end", () => {
  if (!currentJob) {
    process.exit(0)
  }
})

function readMessages() {
  let chunk
  while ((chunk = process.stdin.read()) !== null) {
    readBuffer = Buffer.concat([readBuffer, chunk])
  }

  while (readBuffer.length >= 4) {
    const messageLength = readBuffer.readUInt32LE(0)
    if (readBuffer.length < messageLength + 4) {
      return
    }

    const message = readBuffer.subarray(4, 4 + messageLength).toString("utf8")
    readBuffer = readBuffer.subarray(4 + messageLength)

    try {
      handleMessage(JSON.parse(message))
    } catch (error) {
      send({
        type: "job_error",
        payload: {
          error: error instanceof Error ? error.message : "Invalid host message"
        }
      })
    }
  }
}

function handleMessage(message) {
  switch (message.type) {
    case "ping":
      handlePing(message.payload || {})
      return
    case "start_job":
      handleStartJob(message.payload || {})
      return
    case "cancel_job":
      handleCancelJob(message.payload || {})
      return
    default:
      send({
        type: "job_error",
        payload: {
          error: `Unknown message type: ${message.type || "<empty>"}`
        }
      })
  }
}

function handlePing(payload) {
  const ffmpegPath = payload.ffmpegPath || "ffmpeg"
  const probe = spawnSync(ffmpegPath, ["-version"], {
    encoding: "utf8"
  })

  send({
    type: "pong",
    payload: {
      ok: probe.status === 0,
      ffmpegPath,
      ffmpegFound: probe.status === 0,
      ffmpegVersion: probe.stdout.split("\n")[0] || "",
      stderr: probe.stderr || ""
    }
  })
}

function handleStartJob(payload) {
  if (currentJob) {
    send({
      type: "job_error",
      payload: {
        tabId: payload.tabId,
        error: "A download is already running in the native host"
      }
    })
    return
  }

  const jobId = String(payload.jobId || "")
  const tabId = Number(payload.tabId)
  const inputUrl = String(payload.inputUrl || "")

  if (!jobId || !Number.isFinite(tabId) || !inputUrl) {
    send({
      type: "job_error",
      payload: {
        tabId,
        error: "Missing required start_job payload"
      }
    })
    return
  }

  const ffmpegPath = String(payload.ffmpegPath || "ffmpeg")
  const outputDir = resolveOutputDir(String(payload.outputDir || ""))
  const outputPath = buildOutputPath(outputDir, String(payload.baseName || "video"))
  const args = buildFfmpegArgs({
    ffmpegPath,
    inputUrl,
    outputPath,
    headers: payload.requestHeaders || {},
    referer: payload.referer || "",
    userAgent: payload.userAgent || ""
  })

  const child = spawn(ffmpegPath, args, {
    stdio: ["ignore", "ignore", "pipe", "pipe"]
  })

  currentJob = {
    jobId,
    tabId,
    child,
    stderr: ""
  }

  send({
    type: "job_started",
    payload: {
      jobId,
      tabId,
      command: [ffmpegPath, ...args].join(" ")
    }
  })

  child.stderr.setEncoding("utf8")
  child.stderr.on("data", (chunk) => {
    if (!currentJob) {
      return
    }

    currentJob.stderr = `${currentJob.stderr}${chunk}`.slice(-8000)
  })

  const progressStream = child.stdio[3]
  progressStream.setEncoding("utf8")
  let progressBuffer = ""
  progressStream.on("data", (chunk) => {
    progressBuffer += chunk
    const blocks = progressBuffer.split("\n")
    progressBuffer = blocks.pop() || ""

    const progress = {}
    for (const line of blocks) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.includes("=")) {
        continue
      }

      const [key, value] = trimmed.split("=", 2)
      progress[key] = value

      if (key === "progress") {
        send({
          type: "job_progress",
          payload: {
            jobId,
            tabId,
            outTime: progress.out_time || progress.out_time_ms || "",
            speed: progress.speed || "",
            state: value
          }
        })
      }
    }
  })

  child.on("error", (error) => {
    send({
      type: "job_error",
      payload: {
        jobId,
        tabId,
        error: error.message
      }
    })
    currentJob = null
  })

  child.on("close", (code) => {
    const stderr = currentJob ? currentJob.stderr : ""

    if (code === 0) {
      send({
        type: "job_done",
        payload: {
          jobId,
          tabId,
          outputPath
        }
      })
    } else {
      send({
        type: "job_error",
        payload: {
          jobId,
          tabId,
          error: `ffmpeg exited with code ${code}`,
          stderr
        }
      })
    }

    currentJob = null
  })
}

function handleCancelJob(payload) {
  const jobId = String(payload.jobId || "")
  if (!currentJob || currentJob.jobId !== jobId) {
    return
  }

  currentJob.child.kill("SIGTERM")
}

function buildFfmpegArgs({ inputUrl, outputPath, headers, referer, userAgent }) {
  const args = ["-nostdin", "-v", "warning", "-progress", "pipe:3", "-nostats"]
  const headerString = buildHeaderString(headers)

  if (userAgent) {
    args.push("-user_agent", userAgent)
  }

  if (referer) {
    args.push("-referer", referer)
  }

  if (headerString) {
    args.push("-headers", headerString)
  }

  args.push("-i", inputUrl, "-c", "copy", "-bsf:a", "aac_adtstoasc", outputPath)
  return args
}

function buildHeaderString(headers) {
  const allowed = ["origin", "cookie", "authorization", "accept", "accept-language"]
  const lines = []

  for (const name of allowed) {
    const value = headers[name]
    if (!value) {
      continue
    }

    lines.push(`${canonicalHeaderName(name)}: ${value}`)
  }

  return lines.length > 0 ? `${lines.join("\r\n")}\r\n` : ""
}

function canonicalHeaderName(name) {
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("-")
}

function resolveOutputDir(outputDir) {
  if (outputDir) {
    return outputDir
  }

  return path.join(os.homedir(), "Downloads")
}

function buildOutputPath(outputDir, baseName) {
  const fileName = `${sanitizeFileName(baseName) || "video"}.mp4`
  const initialPath = path.join(outputDir, fileName)

  if (!fs.existsSync(initialPath)) {
    return initialPath
  }

  let index = 2
  while (true) {
    const nextPath = path.join(outputDir, `${sanitizeFileName(baseName)} (${index}).mp4`)
    if (!fs.existsSync(nextPath)) {
      return nextPath
    }
    index += 1
  }
}

function sanitizeFileName(value) {
  return String(value)
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120)
}

function send(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8")
  const header = Buffer.alloc(4)
  header.writeUInt32LE(body.length, 0)
  process.stdout.write(header)
  process.stdout.write(body)
}
