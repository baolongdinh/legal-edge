#!/usr/bin/env node

import { cp, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const rootDir = process.cwd()
const sourceDir = path.join(rootDir, 'templates', 'library')
const publicDir = path.join(rootDir, 'legalshield-web', 'public', 'template-assets')

await rm(publicDir, { recursive: true, force: true })
await mkdir(publicDir, { recursive: true })

for (const folder of ['downloads', 'rendered']) {
  const from = path.join(sourceDir, folder)
  const to = path.join(publicDir, folder)
  try {
    await cp(from, to, { recursive: true })
  } catch {
    // Ignore missing asset folders.
  }
}

console.log(`Published template assets into ${publicDir}`)
