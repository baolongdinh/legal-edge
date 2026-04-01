#!/usr/bin/env node

import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const rootDir = process.cwd()
const manifestPath = path.join(rootDir, 'templates', 'library', 'manifest.json')
const crawledDir = path.join(rootDir, 'templates', 'crawled')
const envCandidates = [
  path.join(rootDir, 'supabase', '.env'),
  path.join(rootDir, 'legalshield-web', '.env'),
  path.join(rootDir, '.env'),
]

function fail(message) {
  console.error(`Template init failed: ${message}`)
  process.exit(1)
}

function parseEnvFile(contents) {
  const parsed = {}
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (!match) continue
    const [, key, rawValue] = match
    const value = rawValue
      .trim()
      .replace(/^"(.*)"$/, '$1')
      .replace(/^'(.*)'$/, '$1')
    parsed[key] = value
  }
  return parsed
}

async function loadEnvDefaults() {
  for (const filePath of envCandidates) {
    try {
      const contents = await readFile(filePath, 'utf8')
      const parsed = parseEnvFile(contents)
      for (const [key, value] of Object.entries(parsed)) {
        if (!process.env[key]) {
          process.env[key] = value
        }
      }
    } catch {
      // Ignore missing env files
    }
  }
}

await loadEnvDefaults()

const derivedSupabaseUrl = process.env.SUPABASE_PROJECT_ID
  ? `https://${process.env.SUPABASE_PROJECT_ID}.supabase.co`
  : undefined

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || derivedSupabaseUrl
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl) fail('Missing SUPABASE_URL or VITE_SUPABASE_URL in environment.')
if (!serviceRoleKey) fail('Missing SUPABASE_SERVICE_ROLE_KEY in environment.')

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))

const libraryRows = await Promise.all(manifest.map(async (entry) => {
  const content = await readFile(path.join(path.dirname(manifestPath), entry.path), 'utf8')
  return {
    seed_key: entry.seed_key,
    name: entry.name,
    category: entry.category,
    template_kind: entry.template_kind,
    content_md: content.trim(),
    is_public: entry.is_public ?? true,
    source_url: entry.source_url ?? null,
    source_domain: entry.source_domain ?? null,
    source_note: entry.source_note ?? null,
    source_type: entry.source_type ?? null,
    source_artifact_path: entry.source_artifact_path ?? null,
    source_content_type: entry.source_content_type ?? null,
    source_capture_mode: entry.source_capture_mode ?? null,
    source_fetched_at: entry.source_fetched_at ?? null,
    source_page_path: entry.source_page_path ?? null,
    download_artifact_path: entry.download_artifact_path ?? null,
    download_artifact_url: entry.download_artifact_url ?? null,
    download_artifact_content_type: entry.download_artifact_content_type ?? null,
    rendered_pdf_path: entry.rendered_pdf_path ?? null,
    rendered_pdf_generated_at: entry.rendered_pdf_generated_at ?? null,
  }
}))

// Optionally include crawled templates
// INIT_INCLUDE_CRAWLED values: 'none' (default), 'today', 'all', or 'file:<filename.json>'
// INIT_CRAWLED_IS_PUBLIC: 'true' | 'false' (default true)
const includeMode = (process.env.INIT_INCLUDE_CRAWLED || 'none').toLowerCase()
const crawledIsPublic = String(process.env.INIT_CRAWLED_IS_PUBLIC || 'true').toLowerCase() === 'true'
const pruneMissing = String(process.env.INIT_PRUNE_MISSING || 'true').toLowerCase() === 'true'

async function loadCrawledRows() {
  try {
    if (includeMode === 'none') return []
    if (includeMode.startsWith('file:')) {
      const fileName = includeMode.slice('file:'.length)
      const raw = await readFile(path.join(crawledDir, fileName), 'utf8')
      const arr = JSON.parse(raw)
      return (Array.isArray(arr) ? arr : []).map((it) => ({
        seed_key: it.seed_key,
        name: it.name,
        category: it.category,
        template_kind: it.template_kind,
        content_md: String(it.content_md || '').trim(),
        is_public: crawledIsPublic,
        source_url: it.source_url || null,
        source_domain: it.source_domain || null,
        source_note: it.source_note || 'Crawled from web',
        source_type: it.source_type || 'web_crawled',
        source_artifact_path: it.source_artifact_path || null,
        source_content_type: it.source_content_type || null,
        source_capture_mode: it.source_capture_mode || null,
        source_fetched_at: it.source_fetched_at || null,
        source_page_path: it.source_page_path || null,
        download_artifact_path: it.download_artifact_path || null,
        download_artifact_url: it.download_artifact_url || null,
        download_artifact_content_type: it.download_artifact_content_type || null,
        rendered_pdf_path: it.rendered_pdf_path || null,
        rendered_pdf_generated_at: it.rendered_pdf_generated_at || null,
      }))
    }

    const files = await readdir(crawledDir)
    const today = new Date().toISOString().slice(0, 10)
    const targets = files
      .filter(f => f.endsWith('.json'))
      .filter(f => includeMode === 'all' ? true : f.includes(today))

    const rows = []
    for (const f of targets) {
      try {
        const raw = await readFile(path.join(crawledDir, f), 'utf8')
        const arr = JSON.parse(raw)
        for (const it of Array.isArray(arr) ? arr : []) {
          rows.push({
            seed_key: it.seed_key,
            name: it.name,
            category: it.category,
            template_kind: it.template_kind,
            content_md: String(it.content_md || '').trim(),
            is_public: crawledIsPublic,
            source_url: it.source_url || null,
            source_domain: it.source_domain || null,
            source_note: it.source_note || 'Crawled from web',
            source_type: it.source_type || 'web_crawled',
            source_artifact_path: it.source_artifact_path || null,
            source_content_type: it.source_content_type || null,
            source_capture_mode: it.source_capture_mode || null,
            source_fetched_at: it.source_fetched_at || null,
            source_page_path: it.source_page_path || null,
            download_artifact_path: it.download_artifact_path || null,
            download_artifact_url: it.download_artifact_url || null,
            download_artifact_content_type: it.download_artifact_content_type || null,
            rendered_pdf_path: it.rendered_pdf_path || null,
            rendered_pdf_generated_at: it.rendered_pdf_generated_at || null,
          })
        }
      } catch {}
    }
    return rows
  } catch {
    return []
  }
}

const crawledRows = await loadCrawledRows()

// Merge with hard preference for curated library when seed_key collides.
// Library rows are the repo source of truth after crawl candidates are promoted.
const bySeed = new Map()
for (const row of crawledRows) {
  if (!row.seed_key || bySeed.has(row.seed_key)) continue
  bySeed.set(row.seed_key, row)
}
for (const row of libraryRows) {
  if (!row.seed_key) continue
  bySeed.set(row.seed_key, row)
}

const rows = Array.from(bySeed.values())

async function fetchExistingTemplates() {
  const response = await fetch(`${supabaseUrl}/rest/v1/templates?select=id,seed_key,name,category,template_kind,content_md,is_public,source_url,source_domain,source_note,source_type,source_artifact_path,source_content_type,source_capture_mode,source_fetched_at,source_page_path,download_artifact_path,download_artifact_url,download_artifact_content_type,rendered_pdf_path,rendered_pdf_generated_at`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  })

  if (!response.ok) {
    fail(`Unable to fetch existing template keys: ${await response.text()}`)
  }

  const existingRows = await response.json()
  const bySeedKey = new Map()
  for (const row of Array.isArray(existingRows) ? existingRows : []) {
    if (row?.seed_key) bySeedKey.set(row.seed_key, row)
  }
  return bySeedKey
}

function normalizeComparable(value) {
  if (value === undefined || value === null) return null
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'boolean') return value
  return String(value)
}

function rowsDiffer(nextRow, existingRow) {
  const comparableKeys = [
    'name',
    'category',
    'template_kind',
    'content_md',
    'is_public',
    'source_url',
    'source_domain',
    'source_note',
    'source_type',
    'source_artifact_path',
    'source_content_type',
    'source_capture_mode',
    'source_fetched_at',
    'source_page_path',
    'download_artifact_path',
    'download_artifact_url',
    'download_artifact_content_type',
    'rendered_pdf_path',
    'rendered_pdf_generated_at',
  ]
  return comparableKeys.some((key) => normalizeComparable(nextRow[key]) !== normalizeComparable(existingRow[key]))
}

const existingTemplates = await fetchExistingTemplates()
const rowsToInsert = []
const rowsToUpdate = []
const rowsToDelete = []
let skippedExisting = 0
const nextSeedKeys = new Set(rows.map((row) => row.seed_key).filter(Boolean))

for (const row of rows) {
  const existing = existingTemplates.get(row.seed_key)
  if (!existing) {
    rowsToInsert.push(row)
    continue
  }

  if (rowsDiffer(row, existing)) {
    rowsToUpdate.push(row)
  } else {
    skippedExisting += 1
  }
}

if (pruneMissing) {
  for (const [seedKey, existing] of existingTemplates.entries()) {
    if (!seedKey || nextSeedKeys.has(seedKey)) continue
    if (!existing?.id) continue
    rowsToDelete.push(existing.id)
  }
}

if (rowsToInsert.length > 0) {
  const insertResponse = await fetch(`${supabaseUrl}/rest/v1/templates`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(rowsToInsert),
  })

  if (!insertResponse.ok) {
    fail(await insertResponse.text())
  }
}

for (const row of rowsToUpdate) {
  const updateResponse = await fetch(`${supabaseUrl}/rest/v1/templates?seed_key=eq.${encodeURIComponent(row.seed_key)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      name: row.name,
      category: row.category,
      template_kind: row.template_kind,
      content_md: row.content_md,
      is_public: row.is_public,
      source_url: row.source_url,
      source_domain: row.source_domain,
      source_note: row.source_note,
      source_type: row.source_type,
      source_artifact_path: row.source_artifact_path,
      source_content_type: row.source_content_type,
      source_capture_mode: row.source_capture_mode,
      source_fetched_at: row.source_fetched_at,
      source_page_path: row.source_page_path,
      download_artifact_path: row.download_artifact_path,
      download_artifact_url: row.download_artifact_url,
      download_artifact_content_type: row.download_artifact_content_type,
      rendered_pdf_path: row.rendered_pdf_path,
      rendered_pdf_generated_at: row.rendered_pdf_generated_at,
    }),
  })

  if (!updateResponse.ok) {
    fail(`Failed to update seed_key=${row.seed_key}: ${await updateResponse.text()}`)
  }
}

if (rowsToDelete.length > 0) {
  const batchSize = 50
  for (let index = 0; index < rowsToDelete.length; index += batchSize) {
    const batch = rowsToDelete.slice(index, index + batchSize)
    const deleteFilter = batch.join(',')
    const deleteResponse = await fetch(`${supabaseUrl}/rest/v1/templates?id=in.(${deleteFilter})`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Prefer: 'return=minimal',
      },
    })

    if (!deleteResponse.ok) {
      fail(`Failed to delete missing templates: ${await deleteResponse.text()}`)
    }
  }
}

if (rowsToInsert.length === 0 && rowsToUpdate.length === 0 && rowsToDelete.length === 0) {
  console.log(
    `Templates already synchronized (total=${rows.length}, skipped_existing=${skippedExisting}, deleted_missing=0, library=${libraryRows.length}, crawled=${crawledRows.length}, crawled_public=${crawledIsPublic})`
  )
  process.exit(0)
}

console.log(
  `Templates synchronized (inserted=${rowsToInsert.length}, updated=${rowsToUpdate.length}, deleted_missing=${rowsToDelete.length}, skipped_existing=${skippedExisting}, total=${rows.length}, library=${libraryRows.length}, crawled=${crawledRows.length}, crawled_public=${crawledIsPublic})`
)
