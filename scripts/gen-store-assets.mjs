#!/usr/bin/env node
// Generates Chrome Web Store marketing assets (promo tiles + feature-slide
// screenshots) as exact-dimension, no-alpha PNGs using the MailFalcon brand.
// Output: apps/extension/store-assets/
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(root, 'apps/extension/store-assets')
await mkdir(outDir, { recursive: true })

const F = {
  50: '#f5f7fa', 100: '#e3e9f2', 200: '#c4d0e3', 300: '#9aaecd',
  400: '#6886b1', 500: '#3b6cb7', 600: '#2f558f', 700: '#264168',
  800: '#1a2e4a', 900: '#0f1a2e',
}
const FONT = 'Arial, Helvetica, sans-serif'

// The MailFalcon logo mark (branded tile) at an arbitrary position/size.
const logo = (x, y, size) => `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="22" fill="${F[500]}"/>
  <g fill="#ffffff">
    <path d="M 56 56 L 106 22 Q 114 22 112 30 L 90 52 L 74 64 Z"/>
    <ellipse cx="46" cy="66" rx="26" ry="11"/>
    <ellipse cx="22" cy="60" rx="12" ry="10"/>
    <path d="M 12 60 Q 4 58 4 64 Q 6 70 14 68 L 14 64 Z"/>
    <path d="M 70 72 L 104 92 Q 108 96 104 98 L 72 82 Z"/>
  </g>
  <circle cx="22" cy="58" r="2.5" fill="${F[500]}"/>
</svg>`

const bgDefs = `<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${F[700]}"/>
    <stop offset="1" stop-color="${F[900]}"/>
  </linearGradient>
</defs>`

const text = (x, y, size, fill, content, weight = '400', anchor = 'start') =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${content}</text>`

async function render(name, w, h, inner) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bgDefs}<rect width="${w}" height="${h}" fill="url(#bg)"/>${inner}</svg>`
  await sharp(Buffer.from(svg)).flatten({ background: F[900] }).png({ compressionLevel: 9 }).toFile(resolve(outDir, name))
  console.log('✔', name, `${w}x${h}`)
}

// ---- Small promo tile 440x280 ----
await render('small-promo-440x280.png', 440, 280,
  logo(180, 40, 80) +
  text(220, 178, 42, '#ffffff', 'MailFalcon', '700', 'middle') +
  text(220, 212, 17, F[300], 'Open &amp; click tracking for Gmail', '400', 'middle'))

// ---- Marquee promo tile 1400x560 ----
await render('marquee-promo-1400x560.png', 1400, 560,
  logo(110, 175, 210) +
  text(380, 240, 104, '#ffffff', 'MailFalcon', '700') +
  text(384, 312, 36, F[300], 'Know the moment your email is read.') +
  text(384, 388, 27, F[200], 'Real-time opens  ·  Click tracking  ·  Full device &amp; location') +
  // pill CTA
  `<rect x="384" y="430" width="250" height="58" rx="29" fill="${F[500]}"/>` +
  text(509, 468, 24, '#ffffff', 'Built for Gmail', '700', 'middle'))

// ---- Screenshot 1: real-time open notification (1280x800) ----
await render('screenshot-1-opens-1280x800.png', 1280, 800,
  text(640, 130, 52, '#ffffff', 'Know the moment your email is read', '700', 'middle') +
  text(640, 182, 26, F[300], 'A desktop notification the instant a recipient opens.', '400', 'middle') +
  // notification card
  `<rect x="360" y="300" width="560" height="170" rx="18" fill="#ffffff"/>` +
  logo(392, 334, 52) +
  text(468, 356, 25, F[700], 'Email opened', '700') +
  text(468, 392, 20, F[600], 'Chrome · macOS · New York, United States') +
  text(468, 424, 17, F[400], 'Just now · “Proposal follow-up”') +
  `<circle cx="884" cy="330" r="7" fill="#22c55e"/>` +
  logo(600, 560, 40) +
  text(650, 588, 22, F[200], 'MailFalcon', '700'))

// ---- Screenshot 2: full event detail (1280x800) ----
const row = (y, label, val, valColor) =>
  `<line x1="360" y1="${y + 34}" x2="920" y2="${y + 34}" stroke="${F[100]}" stroke-width="1"/>` +
  text(392, y + 24, 20, F[600], label) +
  text(888, y + 24, 20, valColor, val, '700', 'end')
await render('screenshot-2-detail-1280x800.png', 1280, 800,
  text(640, 130, 52, '#ffffff', 'Every open and click, in full detail', '700', 'middle') +
  text(640, 182, 26, F[300], 'Browser, device, city and timezone for each event.', '400', 'middle') +
  `<rect x="360" y="280" width="560" height="320" rx="18" fill="#ffffff"/>` +
  text(392, 322, 22, F[700], '“Proposal follow-up”', '700') +
  row(340, 'Opens', '4 human · 1 bot', F[700]) +
  row(390, 'Clicks', '2', F[500]) +
  row(440, 'Location', 'New York, US', F[700]) +
  row(490, 'Device', 'Chrome · macOS', F[700]) +
  row(540, 'First opened', '32s after send', F[700]) +
  logo(600, 660, 40) +
  text(650, 688, 22, F[200], 'MailFalcon', '700'))

// ---- Screenshot 3: privacy mode per email (1280x800) ----
await render('screenshot-3-privacy-1280x800.png', 1280, 800,
  text(640, 130, 52, '#ffffff', 'Privacy mode, per email', '700', 'middle') +
  text(640, 182, 26, F[300], 'One click to send untracked — no pixel, no rewrites.', '400', 'middle') +
  // compose bar mock
  `<rect x="340" y="320" width="600" height="150" rx="14" fill="#ffffff"/>` +
  `<rect x="340" y="320" width="600" height="46" rx="14" fill="${F[50]}"/>` +
  text(366, 350, 19, F[600], 'New Message', '700') +
  // checkbox
  `<rect x="366" y="398" width="26" height="26" rx="6" fill="#ffffff" stroke="${F[400]}" stroke-width="2"/>` +
  text(408, 419, 20, F[700], 'Privacy mode — don’t track this email') +
  text(366, 452, 15, F[400], 'Leave unchecked to see opens and clicks.') +
  logo(600, 560, 40) +
  text(650, 588, 22, F[200], 'MailFalcon', '700'))

console.log('\nAll assets written to apps/extension/store-assets/')
