#!/usr/bin/env node
// Renders 1920x1080 promo-video scene frames (no alpha) for MailFalcon.
// Usage: node scripts/gen-promo-frames.mjs <outDir>
import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const outDir = resolve(process.argv[2] || 'promo-frames')
await mkdir(outDir, { recursive: true })

const F = {
  50: '#f5f7fa', 100: '#e3e9f2', 200: '#c4d0e3', 300: '#9aaecd',
  400: '#6886b1', 500: '#3b6cb7', 600: '#2f558f', 700: '#264168',
  800: '#1a2e4a', 900: '#0f1a2e',
}
const FONT = 'Arial, Helvetica, sans-serif'

const logo = (x, y, s) => `<svg x="${x}" y="${y}" width="${s}" height="${s}" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="22" fill="${F[500]}"/>
  <g fill="#ffffff">
    <path d="M 56 56 L 106 22 Q 114 22 112 30 L 90 52 L 74 64 Z"/>
    <ellipse cx="46" cy="66" rx="26" ry="11"/><ellipse cx="22" cy="60" rx="12" ry="10"/>
    <path d="M 12 60 Q 4 58 4 64 Q 6 70 14 68 L 14 64 Z"/>
    <path d="M 70 72 L 104 92 Q 108 96 104 98 L 72 82 Z"/>
  </g><circle cx="22" cy="58" r="2.5" fill="${F[500]}"/></svg>`

const t = (x, y, s, fill, c, w = '400', a = 'start') =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${s}" font-weight="${w}" fill="${fill}" text-anchor="${a}">${c}</text>`

const footer = t(960, 1010, 30, F[300], 'app.mailfalcon.app', '700', 'middle')

async function frame(name, inner) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${F[700]}"/><stop offset="1" stop-color="${F[900]}"/>
  </linearGradient></defs>
  <rect width="1920" height="1080" fill="url(#bg)"/>${inner}</svg>`
  await sharp(Buffer.from(svg)).flatten({ background: F[900] }).png().toFile(resolve(outDir, name))
  console.log('✔', name)
}

// 0 — intro
await frame('f0.png',
  logo(830, 300, 260) +
  t(960, 700, 128, '#ffffff', 'MailFalcon', '700', 'middle') +
  t(960, 772, 40, F[300], 'Open &amp; click tracking for Gmail', '400', 'middle'))

// 1 — opens
await frame('f1.png',
  t(960, 210, 74, '#ffffff', 'Know the moment your email is read', '700', 'middle') +
  t(960, 278, 36, F[300], 'A desktop notification the instant a recipient opens.', '400', 'middle') +
  `<rect x="560" y="430" width="800" height="240" rx="24" fill="#ffffff"/>` +
  logo(600, 478, 76) +
  t(716, 528, 36, F[700], 'Email opened', '700') +
  t(716, 578, 28, F[600], 'Chrome · macOS · New York, United States') +
  t(716, 622, 24, F[400], '“Proposal follow-up” · just now') +
  `<circle cx="1300" cy="478" r="11" fill="#22c55e"/>` + footer)

// 2 — detail
const row = (y, l, v, vc) =>
  `<line x1="560" y1="${y + 44}" x2="1360" y2="${y + 44}" stroke="${F[100]}" stroke-width="1.5"/>` +
  t(600, y + 30, 30, F[600], l) + t(1320, y + 30, 30, vc, v, '700', 'end')
await frame('f2.png',
  t(960, 210, 74, '#ffffff', 'Every open and click, in full detail', '700', 'middle') +
  t(960, 278, 36, F[300], 'Browser, device, city and timezone for each event.', '400', 'middle') +
  `<rect x="560" y="370" width="800" height="430" rx="24" fill="#ffffff"/>` +
  t(600, 425, 32, F[700], '“Proposal follow-up”', '700') +
  row(445, 'Opens', '4 human · 1 bot', F[700]) +
  row(515, 'Clicks', '2', F[500]) +
  row(585, 'Location', 'New York, US', F[700]) +
  row(655, 'Device', 'Chrome · macOS', F[700]) +
  row(715, 'First opened', '32s after send', F[700]) + footer)

// 3 — privacy
await frame('f3.png',
  t(960, 210, 74, '#ffffff', 'Privacy mode, per email', '700', 'middle') +
  t(960, 278, 36, F[300], 'One click to send untracked — no pixel, no rewrites.', '400', 'middle') +
  `<rect x="510" y="420" width="900" height="230" rx="20" fill="#ffffff"/>` +
  `<rect x="510" y="420" width="900" height="66" rx="20" fill="${F[50]}"/>` +
  t(548, 462, 28, F[600], 'New Message', '700') +
  `<rect x="548" y="524" width="34" height="34" rx="8" fill="#ffffff" stroke="${F[400]}" stroke-width="2.5"/>` +
  t(602, 550, 30, F[700], 'Privacy mode — don’t track this email') +
  t(548, 600, 22, F[400], 'Leave unchecked to see opens and clicks.') + footer)

// 4 — outro
await frame('f4.png',
  logo(860, 300, 200) +
  t(960, 640, 96, '#ffffff', 'MailFalcon', '700', 'middle') +
  t(960, 706, 36, F[300], 'Free tier included · Built for Gmail', '400', 'middle') +
  `<rect x="760" y="770" width="400" height="82" rx="41" fill="${F[500]}"/>` +
  t(960, 823, 34, '#ffffff', 'Add to Chrome', '700', 'middle') +
  footer)

console.log('\nFrames written to', outDir)
