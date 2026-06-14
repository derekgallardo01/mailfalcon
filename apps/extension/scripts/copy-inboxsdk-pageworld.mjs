#!/usr/bin/env node
// Copy @inboxsdk/core/pageWorld.js into public/ so WXT bundles it.
// The file MUST live at the extension root (referenced as 'pageWorld.js')
// because chrome.scripting.executeScript({world: 'MAIN', files: ['pageWorld.js']}).
// Re-runs on every dev/build to stay aligned with the installed SDK version.

import { copyFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const here = dirname(fileURLToPath(import.meta.url))
const appRoot = resolve(here, '..')
const require = createRequire(import.meta.url)

const pkgPath = require.resolve('@inboxsdk/core/package.json')
const src = resolve(dirname(pkgPath), 'pageWorld.js')
const dst = resolve(appRoot, 'public', 'pageWorld.js')

await copyFile(src, dst)
console.log(`copied ${src}\n     → ${dst}`)
