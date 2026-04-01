#!/usr/bin/env node

import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const rootDir = process.cwd()
const libraryDir = path.join(rootDir, 'templates', 'library')
const manifestPath = path.join(libraryDir, 'manifest.json')
const crawledDir = path.join(rootDir, 'templates', 'crawled')
const promotedDir = path.join(libraryDir, 'crawled')

const includeMode = (process.env.PROMOTE_INCLUDE_CRAWLED || 'all').toLowerCase()
const minChars = Number(process.env.PROMOTE_MIN_CHARS || 400)
const overwriteExisting = String(process.env.PROMOTE_OVERWRITE_EXISTING || 'false').toLowerCase() === 'true'
const rebuildCrawled = String(process.env.PROMOTE_REBUILD_CRAWLED || 'true').toLowerCase() === 'true'

function slugify(input) {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

function normalizeContent(input) {
  return String(input || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function normalizeText(input) {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function includesAny(text, patterns) {
  return patterns.some((pattern) => text.includes(pattern))
}

function isPromotableTemplate(item) {
  const title = normalizeText(item.name)
  const content = normalizeText(item.content_md)
  const sourceUrl = String(item.source_url || '')
  const url = normalizeText(sourceUrl)
  const sourceDomain = normalizeText(item.source_domain || '')
  const corpus = `${title}\n${content}\n${url}`

  if (!title || !sourceUrl) return false
  if (sourceDomain.startsWith('english.')) return false

  const hardRejectPatterns = [
    'hoi-dap',
    'hoi dap',
    'hoi dap phap luat',
    'cong-dong-dan-luat',
    'cong dong dan luat',
    'an le',
    'nghi dinh',
    'thong tu',
    'du thao',
    'law on',
    'decree',
    'circular',
    'consolidated text',
    '/van-ban/',
    '/du-thao-vbqppl/',
    'question',
    'huong dan',
    'cach dien',
    'the nao',
    'dung lam gi',
    'pho bien nhat',
    'thuong dung',
    'top ',
    'top+',
  ]

  const sourcePositivePatterns = [
    '/bieu-mau/',
    '/hopdong/',
    '-forms.',
    'tai-ve-mau',
    'tai mau',
  ]

  if (includesAny(corpus, hardRejectPatterns)) return false

  if (/^\d+\s*mau\b/.test(title) || /^\d+\s*top\b/.test(title)) return false

  if (!includesAny(corpus, sourcePositivePatterns) && !includesAny(title, ['mau ', 'hop dong', 'thoa thuan', 'cam ket', 'dieu khoan'])) {
    return false
  }

  if (item.template_kind === 'full_template') {
    const templatePatterns = [
      'mau hop dong',
      'hop dong',
      'mau thoa thuan',
      'thoa thuan bao mat',
      'mau nda',
      'mau don',
      'bieu mau',
      'cam ket bao mat',
      'tai ve mau',
    ]

    if (!includesAny(corpus, templatePatterns)) return false

    if (item.category === 'bảo mật') {
      return includesAny(corpus, [
        'bao mat',
        'khong tiet lo',
        'nda',
        'bi mat thong tin',
        'cam ket bao mat',
      ])
    }

    return includesAny(corpus, ['hop dong', 'thoa thuan', 'bieu mau', 'mau don'])
  }

  if (item.template_kind === 'clause_snippet') {
    if (!includesAny(corpus, ['dieu khoan', 'clause'])) return false

    if (item.category === 'thanh toán') {
      return includesAny(corpus, ['thanh toan', 'tam ung', 'phat cham thanh toan', 'tien do'])
    }

    if (item.category === 'tranh chấp') {
      return includesAny(corpus, ['tranh chap', 'trong tai', 'toa an', 'luat ap dung'])
    }
  }

  return true
}

function buildManifestEntry(item, filePath) {
  return {
    seed_key: item.seed_key,
    name: item.name,
    category: item.category,
    template_kind: item.template_kind,
    path: filePath,
    is_public: true,
    source_type: 'web_curated',
    source_url: item.source_url || null,
    source_domain: item.source_domain || null,
    source_note: item.source_note || `Promoted from crawled web template on ${new Date().toISOString().slice(0, 10)}.`,
  }
}

async function loadManifest() {
  try {
    const raw = await readFile(manifestPath, 'utf8')
    if (!raw.trim()) {
      return []
    }
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function writeJsonAtomic(filePath, value) {
  const tempPath = `${filePath}.tmp`
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(tempPath, filePath)
}

async function loadCrawledItems() {
  if (includeMode === 'none') return []

  if (includeMode.startsWith('file:')) {
    const fileName = includeMode.slice('file:'.length)
    const raw = await readFile(path.join(crawledDir, fileName), 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  }

  const files = await readdir(crawledDir)
  const today = new Date().toISOString().slice(0, 10)
  const selected = files
    .filter((fileName) => fileName.endsWith('.json'))
    .filter((fileName) => includeMode === 'all' ? true : fileName.includes(today))

  const all = []
  for (const fileName of selected) {
    try {
      const raw = await readFile(path.join(crawledDir, fileName), 'utf8')
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) all.push(...parsed)
    } catch {
      // Ignore malformed crawl files and continue.
    }
  }
  return all
}

const loadedManifest = await loadManifest()
const crawledItems = await loadCrawledItems()
const manifest = rebuildCrawled
  ? loadedManifest.filter((entry) => !['web_curated', 'repo_curated'].includes(String(entry.source_type || '')))
  : loadedManifest
const manifestBySeed = new Map(manifest.map((entry) => [entry.seed_key, entry]))
const usedPaths = new Set(manifest.map((entry) => entry.path).filter(Boolean))

if (rebuildCrawled) {
  await rm(promotedDir, { recursive: true, force: true })
}

await mkdir(promotedDir, { recursive: true })

let createdCount = 0
let updatedCount = 0
let skippedExisting = 0
let skippedLowQuality = 0

for (const item of crawledItems) {
  if (!item?.seed_key || !item?.name) {
    skippedLowQuality += 1
    continue
  }

  const content = normalizeContent(item.content_md)
  if (content.length < minChars) {
    skippedLowQuality += 1
    continue
  }

  if (!isPromotableTemplate({ ...item, content_md: content })) {
    skippedLowQuality += 1
    continue
  }

  const existing = manifestBySeed.get(item.seed_key)
  let relativePath = existing?.path

  if (!relativePath) {
    const titleSlug = slugify(item.name).slice(0, 72) || item.seed_key
    const baseName = `${item.category || 'uncategorized'}-${item.template_kind || 'template'}-${titleSlug}`.slice(0, 120)
    let nextPath = path.posix.join('crawled', `${baseName}.md`)
    if (usedPaths.has(nextPath)) {
      nextPath = path.posix.join('crawled', `${baseName}-${item.seed_key.slice(-6)}.md`)
    }
    relativePath = nextPath
    usedPaths.add(relativePath)
  }

  const absolutePath = path.join(libraryDir, relativePath)
  const nextEntry = buildManifestEntry(item, relativePath)

  if (existing && !overwriteExisting) {
    const normalizedExisting = JSON.stringify(existing)
    const normalizedNext = JSON.stringify({ ...existing, ...nextEntry })
    if (normalizedExisting === normalizedNext) {
      skippedExisting += 1
      continue
    }
  }

  await mkdir(path.dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, `${content}\n`, 'utf8')

  if (existing) {
    Object.assign(existing, nextEntry)
    updatedCount += 1
  } else {
    manifest.push(nextEntry)
    manifestBySeed.set(nextEntry.seed_key, nextEntry)
    createdCount += 1
  }
}

manifest.sort((left, right) => {
  const categoryCompare = String(left.category || '').localeCompare(String(right.category || ''), 'vi')
  if (categoryCompare !== 0) return categoryCompare
  return String(left.name || '').localeCompare(String(right.name || ''), 'vi')
})

await writeJsonAtomic(manifestPath, manifest)

console.log(
  `Promoted crawled templates into library (created=${createdCount}, updated=${updatedCount}, skipped_existing=${skippedExisting}, skipped_low_quality=${skippedLowQuality}, manifest_total=${manifest.length})`
)
