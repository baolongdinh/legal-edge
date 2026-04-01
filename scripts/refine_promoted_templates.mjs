#!/usr/bin/env node

import { readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const rootDir = process.cwd()
const libraryDir = path.join(rootDir, 'templates', 'library')
const manifestPath = path.join(libraryDir, 'manifest.json')

function decodeHtmlEntities(input) {
  return String(input || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number.parseInt(dec, 10)))
}

function stripHtml(input) {
  return decodeHtmlEntities(
    String(input || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<li[^>]*>/gi, '- ')
      .replace(/<h1[^>]*>/gi, '# ')
      .replace(/<h2[^>]*>/gi, '## ')
      .replace(/<h3[^>]*>/gi, '### ')
      .replace(/<h4[^>]*>/gi, '#### ')
      .replace(/<h5[^>]*>/gi, '##### ')
      .replace(/<h6[^>]*>/gi, '###### ')
      .replace(/<[^>]+>/g, ' ')
  )
}

function cleanMarkdown(input) {
  return String(input || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => ![
      'Đăng nhập / Đăng ký',
      'Nội dung chính',
      'Đánh giá bài viết:',
    ].includes(line))
    .filter((line) => !/^-\s*(Giá Vàng|Lịch Âm|Chủ đề Pháp luật|Lĩnh vực Pháp luật|Pháp luật vừa ban hành)/i.test(line))
    .filter((line) => !/^1900\s*6192/.test(line))
    .filter((line) => !/^090\s*222/.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function extractBetween(html, startPattern, endPattern) {
  const start = html.search(startPattern)
  if (start === -1) return null
  const sliced = html.slice(start)
  const end = sliced.search(endPattern)
  return end === -1 ? sliced : sliced.slice(0, end)
}

function extractMainHtml(html, sourceDomain) {
  if (sourceDomain.includes('thuvienphapluat.vn')) {
    return (
      extractBetween(html, /<section[^>]+id="news-content"[^>]*>/i, /<\/section>/i)
      || extractBetween(html, /<article[^>]*>/i, /<div class="fb-like"/i)
      || extractBetween(html, /<article[^>]*>/i, /<\/article>/i)
    )
  }

  if (sourceDomain.includes('luatvietnam.vn')) {
    return (
      extractBetween(html, /<div[^>]+class="the-article-body"[^>]*>/i, /<div class="section-hotline"/i)
      || extractBetween(html, /<article[^>]*>/i, /<div class="article-rating"/i)
      || extractBetween(html, /<article[^>]*>/i, /<\/article>/i)
    )
  }

  if (sourceDomain.includes('luatduonggia.vn')) {
    return (
      extractBetween(html, /<article[^>]*>/i, /<div[^>]+class="[^"]*(related|lien-quan|comment)[^"]*"/i)
      || extractBetween(html, /<main[^>]*>/i, /<\/main>/i)
      || extractBetween(html, /<article[^>]*>/i, /<\/article>/i)
    )
  }

  return extractBetween(html, /<article[^>]*>/i, /<\/article>/i) || html
}

function removeNoiseBlocks(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<div[^>]+class="accordion[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi, '')
    .replace(/<div[^>]+class="[^"]*(muc-luc|toc|section-hotline|article-rating|adv-slot-wrapper|box-hotline)[^"]*"[\s\S]*?<\/div>/gi, '')
    .replace(/<strong[^>]*>\s*Xem thêm:[\s\S]*?<\/strong>/gi, '')
    .replace(/<a[^>]*>[\s\S]*?<\/a>/gi, (_, link) => stripHtml(link))
}

function normalizeTitle(fallback) {
  return String(fallback || '')
    .replace(/^#+\s*/g, '')
    .replace(/^\d+[\.\)]\s*/g, '')
    .replace(/^Tải về\s+/i, '')
    .replace(/^Tải\s+/i, '')
    .replace(/thế nào/gi, '')
    .replace(/dùng làm gì/gi, '')
    .replace(/ở đâu/gi, '')
    .replace(/\b(được dùng phổ biến nhất|thường dùng)\b/gi, '')
    .replace(/\b(mới và chuẩn nhất|mới nhất|chuẩn, chuyên nghiệp)\b/gi, '')
    .split('?')[0]
    .replace(/\s+/g, ' ')
    .trim()
}

function shouldKeepRefinedEntry(entry, markdown) {
  const title = normalizeTitle(entry.name).toLowerCase()
  const normalizedMarkdown = String(markdown || '').toLowerCase()
  const rejectPatterns = [
    'top ',
    'top+',
    'hướng dẫn',
    'huong dan',
    'cách điền',
    'cach dien',
    'thế nào',
    'the nao',
    'dùng làm gì',
    'dung lam gi',
    'phổ biến nhất',
    'pho bien nhat',
    'thường dùng',
    'thuong dung',
  ]

  if (rejectPatterns.some((pattern) => title.includes(pattern) || normalizedMarkdown.includes(pattern))) {
    return false
  }

  if (/^\d+\s*mẫu\b/i.test(entry.name) || /^\d+\s*mau\b/i.test(title)) {
    return false
  }

  return true
}

function extractSuggestedTitle(markdown, fallback) {
  const headingMatch = markdown.match(/^#{1,3}\s+(.+)$/m)
  if (headingMatch) {
    const heading = headingMatch[1].trim()
    if (
      heading.length >= 12
      && heading.length <= 120
      && !heading.includes('?')
      && /(mẫu|hợp đồng|thỏa thuận|điều khoản|cam kết)/i.test(heading)
    ) {
      return heading
    }
  }

  return normalizeTitle(fallback)
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
const nextManifest = []

let refinedCount = 0
let skippedCount = 0

for (const entry of manifest) {
  const pageSourcePath = entry.source_page_path || entry.source_artifact_path
  if (!pageSourcePath || !entry.path) {
    skippedCount += 1
    continue
  }

  const sourcePath = path.join(libraryDir, pageSourcePath)
  const targetPath = path.join(libraryDir, entry.path)
  const sourceHtml = await readFile(sourcePath, 'utf8')
  const mainHtml = extractMainHtml(sourceHtml, String(entry.source_domain || ''))
  const cleanedHtml = removeNoiseBlocks(mainHtml)
  const markdown = cleanMarkdown(stripHtml(cleanedHtml))

  if (!markdown || markdown.length < 200) {
    skippedCount += 1
    continue
  }

  if (!shouldKeepRefinedEntry(entry, markdown)) {
    skippedCount += 1
    continue
  }

  await writeFile(targetPath, `${markdown}\n`, 'utf8')
  entry.name = normalizeTitle(extractSuggestedTitle(markdown, entry.name))
  entry.source_note = `Refined from captured source artifact on ${new Date().toISOString().slice(0, 10)}.`
  nextManifest.push(entry)
  refinedCount += 1
}

await writeJsonAtomic(manifestPath, nextManifest)

console.log(`Refined promoted templates (refined=${refinedCount}, skipped=${skippedCount}, total=${manifest.length}, kept=${nextManifest.length})`)
