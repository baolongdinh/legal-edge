#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createHash } from 'node:crypto'

const rootDir = process.cwd()
const libraryDir = path.join(rootDir, 'templates', 'library')
const manifestPath = path.join(libraryDir, 'manifest.json')
const snapshotsDir = path.join(libraryDir, 'sources')
const downloadsDir = path.join(libraryDir, 'downloads')

const concurrency = Number(process.env.SNAPSHOT_CONCURRENCY || 4)
const includeSourceTypes = new Set(
  String(process.env.SNAPSHOT_SOURCE_TYPES || 'web_curated')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
)

function normalizeText(input) {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function stableId(input, len = 12) {
  return createHash('sha1').update(input).digest('hex').slice(0, len)
}

function absolutizeUrl(href, baseUrl) {
  try {
    return new URL(href, baseUrl).toString()
  } catch {
    return null
  }
}

function guessExtension(sourceUrl, contentType) {
  const normalizedType = normalizeText(contentType)
  if (normalizedType.includes('pdf')) return '.pdf'
  if (normalizedType.includes('msword')) return '.doc'
  if (normalizedType.includes('officedocument.wordprocessingml')) return '.docx'
  if (normalizedType.includes('html')) return '.html'
  if (normalizedType.includes('json')) return '.json'

  try {
    const pathname = new URL(sourceUrl).pathname.toLowerCase()
    if (pathname.endsWith('.pdf')) return '.pdf'
    if (pathname.endsWith('.docx')) return '.docx'
    if (pathname.endsWith('.doc')) return '.doc'
    if (pathname.endsWith('.htm') || pathname.endsWith('.html')) return '.html'
  } catch {
    // Ignore malformed URLs.
  }

  return '.html'
}

async function loadManifest() {
  const raw = await readFile(manifestPath, 'utf8')
  const parsed = JSON.parse(raw)
  return Array.isArray(parsed) ? parsed : []
}

function hasPreferredUrlPattern(entry) {
  const corpus = normalizeText(`${entry.source_url || ''} ${entry.name || ''}`)
  return [
    '/bieu-mau/',
    '/hopdong/',
    '-forms.',
    'tai-ve-mau',
    'mau hop dong',
    'mau thoa thuan',
    'mau cam ket',
    'dieu khoan',
  ].some((pattern) => corpus.includes(pattern))
}

function findDownloadCandidates(html, sourceUrl) {
  const directMatches = [...String(html || '').matchAll(/href=["']([^"']+\.(pdf|docx?|rtf))(?:[?#][^"']*)?["']/gi)]
    .map((match) => absolutizeUrl(match[1], sourceUrl))
    .filter(Boolean)

  const anchorMatches = [...String(html || '').matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({
      href: absolutizeUrl(match[1], sourceUrl),
      text: normalizeText(match[2].replace(/<[^>]+>/g, ' ')),
    }))
    .filter((item) => item.href)
    .filter((item) => /\.(pdf|docx?|rtf)(?:[?#].*)?$/i.test(item.href))
    .filter((item) => /(tai|tải|download|file word|pdf|docx|mau|hop dong|thoa thuan|cam ket)/i.test(item.text))
    .map((item) => item.href)

  return Array.from(new Set([...directMatches, ...anchorMatches]))
}

function pickBestDownload(downloads) {
  if (downloads.length === 0) return null

  const scored = downloads.map((href) => {
    const normalized = normalizeText(href)
    let score = 0
    if (normalized.endsWith('.docx')) score += 5
    else if (normalized.endsWith('.doc')) score += 4
    else if (normalized.endsWith('.pdf')) score += 3
    if (/(mau|hop-dong|hop_dong|thoa-thuan|cam-ket|dieu-khoan)/i.test(normalized)) score += 4
    if (/(cdn|upload|uploaded)/i.test(normalized)) score += 1
    return { href, score }
  })

  scored.sort((left, right) => right.score - left.score)
  return scored[0]?.href || null
}

async function downloadArtifact(url, seedKey) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'LegalEdgeTemplateCrawler/1.0 (+https://legaledge.local)',
      'Accept': 'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/rtf,*/*;q=0.8',
    },
  })

  if (!response.ok) {
    throw new Error(`Artifact HTTP ${response.status}`)
  }

  const contentType = response.headers.get('content-type') || 'application/octet-stream'
  const extension = guessExtension(url, contentType)
  const fileName = `${stableId(seedKey)}${extension}`
  const relativePath = path.posix.join('downloads', fileName)
  const absolutePath = path.join(libraryDir, relativePath)
  const bytes = new Uint8Array(await response.arrayBuffer())

  await mkdir(path.dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, bytes)

  return { relativePath, contentType, sourceUrl: url }
}

async function writeJsonAtomic(filePath, value) {
  const tempPath = `${filePath}.tmp`
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(tempPath, filePath)
}

async function runWithConcurrency(items, limit, fn) {
  const queue = [...items]
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const next = queue.shift()
      if (!next) continue
      try {
        await fn(next)
      } catch (error) {
        console.error('Snapshot failed for', next.seed_key, '-', error?.message || error)
      }
    }
  })
  await Promise.all(workers)
}

const manifest = await loadManifest()
const targets = manifest.filter((entry) => entry.source_url && includeSourceTypes.has(String(entry.source_type || '')))

await mkdir(snapshotsDir, { recursive: true })
await mkdir(downloadsDir, { recursive: true })

let savedCount = 0
let skippedCount = 0

await runWithConcurrency(targets, concurrency, async (entry) => {
  if (String(entry.download_artifact_path || '').endsWith('.html') || String(entry.download_artifact_content_type || '').includes('html')) {
    entry.download_artifact_path = null
    entry.download_artifact_content_type = null
    entry.download_artifact_url = null
  }

  const alreadyCapturedPage = entry.source_page_path && entry.source_content_type
  const needsDownloadBackfill = !entry.download_artifact_path

  if (alreadyCapturedPage && !needsDownloadBackfill) {
    skippedCount += 1
    return
  }

  let contentType = entry.source_content_type || 'application/octet-stream'
  let bytes

  if (alreadyCapturedPage) {
    const existingPath = path.join(libraryDir, entry.source_page_path)
    bytes = await readFile(existingPath)
  } else {
    const response = await fetch(entry.source_url, {
      headers: {
        'User-Agent': 'LegalEdgeTemplateCrawler/1.0 (+https://legaledge.local)',
        'Accept': 'text/html,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document;q=0.9,*/*;q=0.8',
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    contentType = response.headers.get('content-type') || 'application/octet-stream'
    bytes = new Uint8Array(await response.arrayBuffer())

    const extension = guessExtension(entry.source_url, contentType)
    const fileName = `${normalizeText(entry.category || 'uncategorized').replace(/[^a-z0-9]+/g, '-')}-${stableId(entry.seed_key)}${extension}`
    const relativePath = path.posix.join('sources', fileName)
    const absolutePath = path.join(libraryDir, relativePath)

    await mkdir(path.dirname(absolutePath), { recursive: true })
    await writeFile(absolutePath, bytes)

    entry.source_page_path = relativePath
    entry.source_artifact_path = relativePath
    entry.source_content_type = contentType
    entry.source_capture_mode = 'raw_fetch'
    entry.source_fetched_at = new Date().toISOString()
  }

  if (contentType.includes('html')) {
    const html = new TextDecoder().decode(bytes)
    const bestDownload = pickBestDownload(findDownloadCandidates(html, entry.source_url))
    if (bestDownload) {
      try {
        const downloaded = await downloadArtifact(bestDownload, entry.seed_key)
        entry.download_artifact_path = downloaded.relativePath
        entry.download_artifact_content_type = downloaded.contentType
        entry.download_artifact_url = downloaded.sourceUrl
      } catch (error) {
        console.error('Download artifact failed for', entry.seed_key, '-', error?.message || error)
      }
    }
  }

  savedCount += 1
})

const retainedManifest = manifest.filter((entry) => hasPreferredUrlPattern(entry) || entry.download_artifact_path)

await writeJsonAtomic(manifestPath, retainedManifest)

console.log(`Captured source artifacts (saved=${savedCount}, skipped=${skippedCount}, retained=${retainedManifest.length}, total=${targets.length})`)
