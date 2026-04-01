#!/usr/bin/env node

import { writeFile, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { createHash } from 'node:crypto'

const EXA_API_KEY = process.env.EXA_API_KEY || process.env.EXA_API_KEYS?.split(',')[0]?.trim()
if (!EXA_API_KEY) {
  console.error('Missing EXA_API_KEY or EXA_API_KEYS in environment.')
  process.exit(1)
}

const rootDir = process.cwd()
const crawledDir = path.join(rootDir, 'templates', 'crawled')
const libraryDir = path.join(rootDir, 'templates', 'library')
const outputPath = path.join(crawledDir, `templates-${new Date().toISOString().slice(0, 10)}.json`)

// Tunables via ENV
const NUM_RESULTS = Number(process.env.EXA_NUM_RESULTS || 25)
const MAX_CHARS = Number(process.env.EXA_MAX_CHARS || 6000)
const CONCURRENCY = Number(process.env.CRAWL_CONCURRENCY || 4)
const STRICT_DOMAINS = String(process.env.STRICT_DOMAINS || 'true').toLowerCase() === 'true'
const EXTRA_INCLUDE = (process.env.EXA_INCLUDE_DOMAINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

const DEFAULT_INCLUDE = [
  'thuvienphapluat.vn',
  'luatvietnam.vn',
  'lawnet.vn',
  'moj.gov.vn',
  'chinhphu.vn',
  'luatminhkhue.vn',
  'luatduonggia.vn',
  'hethongphapluatvietnam.com',
  'luattoanquoc.com',
]
const INCLUDE_DOMAINS = Array.from(new Set([...DEFAULT_INCLUDE, ...EXTRA_INCLUDE]))

// Expanded searches with multiple variants per category
const BASE_SEARCHES = [
  {
    category: 'chung',
    template_kind: 'full_template',
    queries: [
      'mẫu hợp đồng dịch vụ file word việt nam',
      'mẫu hợp đồng dịch vụ docx việt nam',
      'mẫu hợp đồng dịch vụ pdf việt nam',
      'mẫu hợp đồng cung cấp dịch vụ việt nam',
      'mẫu hợp đồng thuê dịch vụ việt nam',
      'service agreement template Vietnam docx',
      'hợp đồng dịch vụ song ngữ việt anh mẫu',
    ],
  },
  {
    category: 'bảo mật',
    template_kind: 'full_template',
    queries: [
      'mẫu thỏa thuận bảo mật nda file word việt nam',
      'mẫu thỏa thuận bảo mật thông tin docx việt nam',
      'mẫu hợp đồng bảo mật thông tin việt nam',
      'non-disclosure agreement template Vietnam docx',
    ],
  },
  {
    category: 'thanh toán',
    template_kind: 'clause_snippet',
    queries: [
      'điều khoản thanh toán hợp đồng mẫu việt nam',
      'điều khoản tạm ứng thanh toán hợp đồng',
      'điều khoản phạt chậm thanh toán hợp đồng',
      'payment terms clause Vietnam contract',
      'điều khoản thanh toán theo tiến độ hợp đồng',
    ],
  },
  {
    category: 'tranh chấp',
    template_kind: 'clause_snippet',
    queries: [
      'điều khoản giải quyết tranh chấp hợp đồng mẫu việt nam',
      'điều khoản trọng tài trong hợp đồng mẫu việt nam',
      'điều khoản luật áp dụng và giải quyết tranh chấp',
      'dispute resolution clause Vietnam contract',
    ],
  },
]

const searches = BASE_SEARCHES.flatMap(s => s.queries.map(q => ({
  category: s.category,
  template_kind: s.template_kind,
  query: q,
})))

function normalizeUrl(u) {
  try {
    const url = new URL(u)
    url.hash = ''
    url.search = ''
    const host = url.hostname.replace(/^www\./, '').toLowerCase()
    const path = url.pathname.replace(/\/+$/, '')
    return `${url.protocol}//${host}${path}`
  } catch {
    return String(u || '').trim()
  }
}

function stableId(input, len = 12) {
  const h = createHash('sha1').update(input).digest('hex')
  return h.slice(0, len)
}

async function search(query) {
  const res = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': EXA_API_KEY,
    },
    body: JSON.stringify({
      query,
      numResults: NUM_RESULTS,
      useAutoprompt: true,
      ...(STRICT_DOMAINS ? { includeDomains: INCLUDE_DOMAINS } : {}),
      contents: { text: { maxCharacters: MAX_CHARS } },
    }),
  })

  if (!res.ok) {
    throw new Error(`Exa search failed (${res.status}) for query: ${query}`)
  }

  return res.json()
}

// Build dedupe sets from prior crawls and curated library
const existingUrlSet = new Set()
const existingNameSet = new Set()

// From curated manifest (names)
try {
  const manifestPath = path.join(libraryDir, 'manifest.json')
  const manifestRaw = await readFile(manifestPath, 'utf8')
  const manifest = JSON.parse(manifestRaw)
  for (const t of Array.isArray(manifest) ? manifest : []) {
    if (t?.name) existingNameSet.add(String(t.name).toLowerCase().trim())
  }
} catch {}

// From previous crawled JSON files (URLs and names)
try {
  const files = await readdir(crawledDir)
  for (const f of files) {
    if (!f.endsWith('.json')) continue
    try {
      const raw = await readFile(path.join(crawledDir, f), 'utf8')
      const arr = JSON.parse(raw)
      for (const it of Array.isArray(arr) ? arr : []) {
        if (it?.source_url) existingUrlSet.add(normalizeUrl(it.source_url))
        if (it?.name) existingNameSet.add(String(it.name).toLowerCase().trim())
      }
    } catch {}
  }
} catch {}

const payload = []
let totalResults = 0
let skippedByUrl = 0
let skippedByName = 0

async function handleSpec(spec) {
  const data = await search(spec.query)
  for (const item of data.results || []) {
    totalResults += 1
    const normUrl = normalizeUrl(item.url)
    const nameKey = String(item.title || '').toLowerCase().trim()
    if (normUrl && existingUrlSet.has(normUrl)) {
      skippedByUrl += 1
      continue
    }
    if (nameKey && existingNameSet.has(nameKey)) {
      skippedByName += 1
      continue
    }
    const id = stableId(`${spec.category}|${spec.template_kind}|${normUrl || nameKey}`)
    payload.push({
      seed_key: `${spec.category}-${spec.template_kind}-${id}`,
      name: item.title,
      category: spec.category,
      template_kind: spec.template_kind,
      content_md: (item.text || '').trim(),
      source_url: item.url,
      source_domain: normUrl ? new URL(normUrl).hostname.replace(/^www\./, '') : undefined,
      source_note: 'Crawled from web. Review manually before moving into templates/library/manifest.json.',
      source_type: 'web_crawled',
      crawled_at: new Date().toISOString(),
      query: spec.query,
    })
    if (normUrl) existingUrlSet.add(normUrl)
    if (nameKey) existingNameSet.add(nameKey)
  }
}

async function runWithConcurrency(items, limit, fn) {
  const queue = [...items]
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const next = queue.shift()
      try {
        await fn(next)
      } catch (err) {
        console.error('Search failed for', next?.query, '-', err?.message || err)
      }
    }
  })
  await Promise.all(workers)
}

console.log(`Running ${searches.length} searches with concurrency=${CONCURRENCY}, numResults=${NUM_RESULTS}${STRICT_DOMAINS ? `, includeDomains=${INCLUDE_DOMAINS.join(',')}` : ''}`)
await runWithConcurrency(searches, CONCURRENCY, handleSpec)

await writeFile(outputPath, JSON.stringify(payload, null, 2))
console.log(`Saved ${payload.length} new candidates to ${outputPath} (from ${totalResults} results, skipped ${skippedByUrl} by URL, ${skippedByName} by name)`) 
