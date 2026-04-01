#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const rootDir = process.cwd()
const libraryDir = path.join(rootDir, 'templates', 'library')
const manifestPath = path.join(libraryDir, 'manifest.json')
const renderedDir = path.join(libraryDir, 'rendered')
const chromePath = process.env.GOOGLE_CHROME_BIN || '/usr/bin/google-chrome'

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

function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function markdownToHtml(title, markdown) {
  const lines = String(markdown || '').split('\n')
  const parts = []
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    if (line.startsWith('### ')) {
      parts.push(`<h3>${escapeHtml(line.slice(4))}</h3>`)
      continue
    }
    if (line.startsWith('## ')) {
      parts.push(`<h2>${escapeHtml(line.slice(3))}</h2>`)
      continue
    }
    if (line.startsWith('# ')) {
      parts.push(`<h1>${escapeHtml(line.slice(2))}</h1>`)
      continue
    }
    if (line.startsWith('- ')) {
      parts.push(`<li>${escapeHtml(line.slice(2))}</li>`)
      continue
    }
    parts.push(`<p>${escapeHtml(line)}</p>`)
  }

  const normalized = parts.join('\n').replace(/(<li>[\s\S]*?<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`)
  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4; margin: 22mm 18mm; }
    body { font-family: "Times New Roman", serif; color: #111827; line-height: 1.55; font-size: 13.5pt; }
    h1 { text-align: center; font-size: 22pt; margin: 0 0 18pt; text-transform: uppercase; }
    h2 { font-size: 15pt; margin: 18pt 0 8pt; }
    h3 { font-size: 13.5pt; margin: 14pt 0 6pt; }
    p { margin: 0 0 8pt; text-align: justify; }
    ul { margin: 0 0 10pt 18pt; }
    li { margin: 0 0 4pt; }
  </style>
</head>
<body>
${normalized}
</body>
</html>`
}

async function loadManifest() {
  const raw = await readFile(manifestPath, 'utf8')
  const parsed = JSON.parse(raw)
  return Array.isArray(parsed) ? parsed : []
}

async function writeJsonAtomic(filePath, value) {
  const tempPath = `${filePath}.tmp`
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(tempPath, filePath)
}

const manifest = await loadManifest()
await mkdir(renderedDir, { recursive: true })

let renderedCount = 0
let skippedCount = 0

for (const entry of manifest) {
  if (!entry.path) {
    skippedCount += 1
    continue
  }

  const markdownPath = path.join(libraryDir, entry.path)
  const markdown = await readFile(markdownPath, 'utf8')
  if (!markdown.trim()) {
    skippedCount += 1
    continue
  }

  const baseName = slugify(entry.name || entry.seed_key || 'template') || 'template'
  const htmlPath = path.join(renderedDir, `${baseName}.html`)
  const pdfPath = path.join(renderedDir, `${baseName}.pdf`)
  const html = markdownToHtml(entry.name || 'Mẫu hợp đồng', markdown)
  await writeFile(htmlPath, html, 'utf8')

  const { spawnSync } = await import('node:child_process')
  const result = spawnSync(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    `--print-to-pdf=${pdfPath}`,
    `file://${htmlPath}`,
  ], { stdio: 'pipe', encoding: 'utf8' })

  if (result.status !== 0) {
    console.error(`PDF render failed for ${entry.seed_key}: ${result.stderr || result.stdout}`)
    skippedCount += 1
    continue
  }

  entry.rendered_pdf_path = path.posix.join('rendered', `${baseName}.pdf`)
  entry.rendered_pdf_generated_at = new Date().toISOString()
  renderedCount += 1
}

await writeJsonAtomic(manifestPath, manifest)

console.log(`Rendered template PDFs (rendered=${renderedCount}, skipped=${skippedCount}, total=${manifest.length})`)
