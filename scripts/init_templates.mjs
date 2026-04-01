#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const rootDir = process.cwd()
const manifestPath = path.join(rootDir, 'templates', 'library', 'manifest.json')

function fail(message) {
  console.error(`Template init failed: ${message}`)
  process.exit(1)
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl) fail('Missing SUPABASE_URL or VITE_SUPABASE_URL in environment.')
if (!serviceRoleKey) fail('Missing SUPABASE_SERVICE_ROLE_KEY in environment.')

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))

const rows = await Promise.all(manifest.map(async (entry) => {
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
  }
}))

const response = await fetch(`${supabaseUrl}/rest/v1/templates?on_conflict=seed_key`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Prefer: 'resolution=merge-duplicates,return=minimal',
  },
  body: JSON.stringify(rows),
})

if (!response.ok) {
  fail(await response.text())
}

console.log(`Seeded ${rows.length} templates into public.templates`)
