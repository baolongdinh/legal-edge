#!/usr/bin/env node

import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const EXA_API_KEY = process.env.EXA_API_KEY || process.env.EXA_API_KEYS?.split(',')[0]?.trim()
if (!EXA_API_KEY) {
  console.error('Missing EXA_API_KEY or EXA_API_KEYS in environment.')
  process.exit(1)
}

const rootDir = process.cwd()
const outputPath = path.join(rootDir, 'templates', 'crawled', `templates-${new Date().toISOString().slice(0, 10)}.json`)

const searches = [
  { category: 'chung', template_kind: 'full_template', query: 'mẫu hợp đồng dịch vụ file word việt nam' },
  { category: 'bảo mật', template_kind: 'full_template', query: 'mẫu thỏa thuận bảo mật nda file word việt nam' },
  { category: 'thanh toán', template_kind: 'clause_snippet', query: 'điều khoản thanh toán hợp đồng mẫu việt nam' },
  { category: 'tranh chấp', template_kind: 'clause_snippet', query: 'điều khoản giải quyết tranh chấp hợp đồng mẫu việt nam' }
]

async function search(query) {
  const res = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': EXA_API_KEY,
    },
    body: JSON.stringify({
      query,
      numResults: 5,
      useAutoprompt: true,
      includeDomains: ['thuvienphapluat.vn', 'luatvietnam.vn', 'lawnet.vn', 'moj.gov.vn', 'chinhphu.vn'],
      contents: {
        text: { maxCharacters: 4000 },
      },
    }),
  })

  if (!res.ok) {
    throw new Error(`Exa search failed (${res.status}) for query: ${query}`)
  }

  return res.json()
}

const payload = []

for (const spec of searches) {
  const data = await search(spec.query)
  for (const [index, item] of (data.results || []).entries()) {
    payload.push({
      seed_key: `${spec.category}-${spec.template_kind}-${index + 1}-${item.url.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40)}`,
      name: item.title,
      category: spec.category,
      template_kind: spec.template_kind,
      content_md: (item.text || '').trim(),
      source_url: item.url,
      source_domain: new URL(item.url).hostname.replace(/^www\./, ''),
      source_note: 'Crawled from web. Review manually before moving into templates/library/manifest.json.',
      source_type: 'web_crawled',
      crawled_at: new Date().toISOString(),
      query: spec.query,
    })
  }
}

await writeFile(outputPath, JSON.stringify(payload, null, 2))
console.log(`Saved ${payload.length} crawled template candidates to ${outputPath}`)
