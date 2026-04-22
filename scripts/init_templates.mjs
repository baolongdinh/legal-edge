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

if (!serviceRoleKey) fail('Missing SUPABASE_SERVICE_ROLE_KEY in environment.')
const EMBEDDING_PROVIDER = (process.env.EMBEDDING_PROVIDER || 'jina').toLowerCase()
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEYS?.split(',')[0]?.trim()
const JINA_API_KEY = process.env.JINA_API_KEY || process.env.JINA_API_KEYS?.split(',')[0]?.trim()
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY || process.env.VOYAGE_API_KEYS?.split(',')[0]?.trim()

async function embedText(text, dims = 768) {
  // Try Jina first if enabled
  if ((EMBEDDING_PROVIDER === 'jina' || !EMBEDDING_PROVIDER) && JINA_API_KEY) {
    try {
      const res = await fetch('https://api.jina.ai/v1/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${JINA_API_KEY}` },
        body: JSON.stringify({
          model: 'jina-embeddings-v3',
          task: 'retrieval.passage',
          dimensions: dims,
          late_chunking: false,
          input: [text]
        })
      })
      const data = await res.json()
      return data.data[0].embedding
    } catch (e) { console.warn('Jina embed failed, falling back...') }
  }

  // Try Voyage
  if ((EMBEDDING_PROVIDER === 'voyage' || EMBEDDING_PROVIDER === 'jina') && VOYAGE_API_KEY) {
    try {
      const res = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${VOYAGE_API_KEY}` },
        body: JSON.stringify({ model: 'voyage-3', input: [text], output_dimension: dims })
      })
      const data = await res.json()
      return data.data[0].embedding
    } catch (e) { console.warn('Voyage embed failed, falling back...') }
  }

  // Final fallback to Gemini
  if (GEMINI_API_KEY) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'models/text-embedding-004', content: { parts: [{ text }] }, outputDimensionality: dims })
      })
      const data = await res.json()
      return data.embedding?.values || null
    } catch (e) { console.error('Gemini fallback failed:', e.message) }
  }
  return null
}

function semanticChunk(text) {
  // Enhanced regex to match at start of string or after newline
  const semanticRegex = /(?:^|\n)\s*(?:Điều|Chương|Phần|Mục)\s+(?:\d+|[IVXLCDM]+)[\.\:\s]/gi

  // Use a different approach: split by parts but keep the delimiters
  const rawChunks = text.split(/(?=(?:^|\n)\s*(?:Điều|Chương|Phần|Mục)\s+(?:\d+|[IVXLCDM]+)[\.\:\s])/gi)

  const chunks = []
  let current = ''
  for (const raw of rawChunks) {
    const s = raw.trim()
    if (!s) continue
    if (current.length + s.length > 2000 && current.length > 500) {
      chunks.push(current.trim())
      current = s
    } else {
      current += (current ? '\n\n' : '') + s
    }
  }
  if (current.trim()) chunks.push(current.trim())

  // If still empty but text exists, return full text as one chunk
  if (chunks.length === 0 && text.trim().length > 20) {
    chunks.push(text.trim())
  }

  return chunks.filter(c => c.length > 30)
}

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
const includeMode = (process.env.INIT_INCLUDE_CRAWLED || 'today').toLowerCase()
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
      } catch { }
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
  // Skip legal intelligence types from the 'templates' table sync - they go to document_chunks only
  if (row.template_kind?.startsWith('legal_')) continue

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

// --- Phase 2: Handle Legal RAG Ingestion (Document Chunks) ---
const legalRows = rows.filter(r => r.template_kind === 'legal_doc')
if (legalRows.length > 0) {
  console.log(`\nIndexing ${legalRows.length} legal documents into document_chunks...`)

  // 1. Ensure we have a "System" user or use the first user
  const userRes = await fetch(`${supabaseUrl}/rest/v1/users?select=id&limit=1`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }
  })
  if (!userRes.ok) console.error(' !! Failed to fetch users:', await userRes.text())
  const users = await userRes.json()
  const systemUserId = users[0]?.id
  if (!systemUserId) console.warn(' !! No user found in public.users. Ingestion will likely fail.')
  else console.log(` ++ Using user_id: ${systemUserId}`)

  for (const doc of legalRows) {
    console.log(` - Processing: ${doc.name}`)

    // a. Create a document entry if not exists
    const docEntryRes = await fetch(`${supabaseUrl}/rest/v1/documents?filename=eq.${encodeURIComponent(doc.name)}&select=id`, {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }
    })
    let docId = (await docEntryRes.json())[0]?.id

    if (!docId) {
      const newDocRes = await fetch(`${supabaseUrl}/rest/v1/documents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          Prefer: 'return=representation'
        },
        body: JSON.stringify({
          user_id: systemUserId,
          filename: doc.name,
          storage_path: doc.source_url || 'crawled_legal',
          file_url: doc.source_url || 'crawled_legal', // Added to satisfy NOT NULL constraint
          text_content: doc.content_md
        })
      })
      if (!newDocRes.ok) {
        console.error(`   !! Document creation failed for ${doc.name}:`, await newDocRes.text())
        continue
      }
      const newDocs = await newDocRes.json()
      docId = newDocs[0]?.id
    }

    if (docId) {
      // Check if chunks already exist to avoid re-embedding (very slow/expensive)
      const chunkCountRes = await fetch(`${supabaseUrl}/rest/v1/document_chunks?document_id=eq.${docId}&select=id&limit=1`, {
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, Prefer: 'count=exact' }
      })
      const countHeader = chunkCountRes.headers.get('content-range')
      if (countHeader && !countHeader.endsWith('/0')) {
        console.log(`   ++ Already indexed. Skipping.`)
        continue
      }
    }

    if (!docId) continue

    // b. Semantic Chunking
    const chunks = semanticChunk(doc.content_md)
    console.log(`   -> Found ${chunks.length} semantic chunks.`)

    // c. Embedding & Ingest
    const chunkToInsert = []
    for (let i = 0; i < chunks.length; i++) {
      const text = chunks[i]
      const embedding = await embedText(text)
      if (!embedding) continue

      chunkToInsert.push({
        document_id: docId,
        chunk_index: i,
        content: text,
        embedding,
        source_url: doc.source_url,
        law_article: doc.name // fallback to title as law_article precursor
      })
    }

    if (chunkToInsert.length > 0) {
      // Simple UPSERT via delete old chunks first to keep it clean
      await fetch(`${supabaseUrl}/rest/v1/document_chunks?document_id=eq.${docId}`, {
        method: 'DELETE',
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }
      })

      const ingestRes = await fetch(`${supabaseUrl}/rest/v1/document_chunks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`
        },
        body: JSON.stringify(chunkToInsert)
      })
      if (!ingestRes.ok) console.error(`   !! Ingest failed for ${doc.name}:`, await ingestRes.text())
      else console.log(`   ++ Successfully indexed ${chunkToInsert.length} chunks.`)
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
