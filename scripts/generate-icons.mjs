#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const svgPath = resolve(__dirname, 'icon.svg')
const svg = await readFile(svgPath)

const targets = [
  { out: 'apps/extension/public/icon', sizes: [16, 32, 48, 128] },
  { out: 'apps/web/app', sizes: [], single: { name: 'icon.png', size: 192 } },
  { out: 'apps/web/app', sizes: [], single: { name: 'apple-icon.png', size: 180 } },
]

for (const target of targets) {
  const outDir = resolve(root, target.out)
  await mkdir(outDir, { recursive: true })

  for (const size of target.sizes) {
    const buf = await sharp(svg).resize(size, size).png({ compressionLevel: 9 }).toBuffer()
    const file = resolve(outDir, `${size}.png`)
    await writeFile(file, buf)
    console.log(`wrote ${file} (${buf.byteLength} bytes)`)
  }

  if (target.single) {
    const { name, size } = target.single
    const buf = await sharp(svg).resize(size, size).png({ compressionLevel: 9 }).toBuffer()
    const file = resolve(outDir, name)
    await writeFile(file, buf)
    console.log(`wrote ${file} (${buf.byteLength} bytes)`)
  }
}

console.log('done')
