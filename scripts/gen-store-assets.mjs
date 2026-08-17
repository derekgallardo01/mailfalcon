#!/usr/bin/env node
// Generates Chrome Web Store marketing assets (Store icon, promo tiles,
// and 5 high-res feature screenshots) as exact-dimension, no-alpha PNGs.
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
const CYAN = '#00d4ff'
const FONT = 'Arial, Helvetica, sans-serif'

// The Mail Falcon logo mark (branded tile) at an arbitrary position/size.
const logo = (x, y, size) => `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="mf-bg-${x}-${y}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a101f"/>
      <stop offset="50%" stop-color="#0b172e"/>
      <stop offset="100%" stop-color="#070c18"/>
    </linearGradient>
    <linearGradient id="mf-w1-${x}-${y}" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0284c7"/>
      <stop offset="40%" stop-color="#00d4ff"/>
      <stop offset="100%" stop-color="#e0f2fe"/>
    </linearGradient>
    <linearGradient id="mf-w2-${x}-${y}" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#0369a1"/>
      <stop offset="50%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#bae6fd"/>
    </linearGradient>
    <linearGradient id="mf-w3-${x}-${y}" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#1e40af"/>
      <stop offset="60%" stop-color="#0284c7"/>
      <stop offset="100%" stop-color="#7dd3fc"/>
    </linearGradient>
    <linearGradient id="mf-env-${x}-${y}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="50%" stop-color="#00d4ff"/>
      <stop offset="100%" stop-color="#0284c7"/>
    </linearGradient>
    <linearGradient id="mf-speed-${x}-${y}" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#00d4ff" stop-opacity="0"/>
      <stop offset="70%" stop-color="#00d4ff" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#e0f2fe" stop-opacity="1"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="28" fill="url(#mf-bg-${x}-${y})"/>
  <circle cx="68" cy="62" r="38" fill="#00d4ff" opacity="0.14"/>
  <line x1="42" y1="36" x2="68" y2="36" stroke="url(#mf-speed-${x}-${y})" stroke-width="2.5" stroke-linecap="round" opacity="0.5"/>
  <line x1="68" y1="68" x2="94" y2="68" stroke="url(#mf-speed-${x}-${y})" stroke-width="2.5" stroke-linecap="round" opacity="0.65"/>
  <line x1="38" y1="84" x2="70" y2="84" stroke="url(#mf-speed-${x}-${y})" stroke-width="2.5" stroke-linecap="round" opacity="0.7"/>
  <rect x="24" y="44" width="52" height="38" rx="5" fill="#091428" stroke="#00d4ff" stroke-width="2.5" stroke-linejoin="round" opacity="0.95"/>
  <path d="M 24 82 L 48 60 M 76 82 L 56 62" fill="none" stroke="#0284c7" stroke-width="2" stroke-linecap="round" opacity="0.7"/>
  <path d="M 24 45 L 50 67 L 68 53" fill="none" stroke="url(#mf-env-${x}-${y})" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 54 64 C 62 64, 76 68, 92 60 C 84 66, 72 70, 56 70 Z" fill="url(#mf-w3-${x}-${y})"/>
  <path d="M 50 67 C 62 63, 80 56, 102 44 C 92 53, 76 62, 52 69 Z" fill="url(#mf-w2-${x}-${y})"/>
  <path d="M 48 66 C 58 58, 72 40, 96 24 C 90 36, 80 48, 52 66 Z" fill="url(#mf-w1-${x}-${y})"/>
  <path d="M 68 45 C 80 34, 90 28, 96 24 C 94 30, 84 40, 72 48 Z" fill="#ffffff" opacity="0.75"/>
  <path d="M 38 56 L 50 67 L 78 44" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>
</svg>`

const bgDefs = `<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${F[800]}"/>
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

// ---- Store Icon 128x128 (No Alpha) ----
await render('store-icon-128x128.png', 128, 128, logo(0, 0, 128))

// ---- Small promo tile 440x280 ----
await render('small-promo-440x280.png', 440, 280,
  logo(180, 36, 80) +
  text(220, 172, 38, '#ffffff', 'Mail Falcon', '700', 'middle') +
  text(220, 206, 16, CYAN, 'Double Checkmarks &amp; Real-Time Tracking', '600', 'middle') +
  text(220, 236, 14, F[300], 'Open &amp; click tracking for Gmail', '400', 'middle'))

// ---- Marquee promo tile 1400x560 ----
await render('marquee-promo-1400x560.png', 1400, 560,
  logo(110, 170, 220) +
  text(380, 235, 96, '#ffffff', 'Mail Falcon', '700') +
  text(384, 305, 34, CYAN, 'Know the exact second your email is opened.') +
  text(384, 375, 25, F[200], '✓✓ Double Blue Checkmarks in Gmail  ·  Live World Map  ·  Apple MPP Filter  ·  Drip Sequences') +
  // pill CTA
  `<rect x="384" y="425" width="260" height="58" rx="29" fill="${CYAN}"/>` +
  text(514, 463, 22, F[900], 'Add to Chrome — Free', '700', 'middle'))

// ---- Screenshot 1: Double Checkmarks in Gmail Sent Folder (1280x800) ----
await render('screenshot-1-checkmarks-1280x800.png', 1280, 800,
  text(640, 110, 46, '#ffffff', 'Double Blue Checkmarks (✓✓) Inside Gmail', '700', 'middle') +
  text(640, 160, 22, F[300], 'See open, click, and reply status directly in your Gmail Sent threads.', '400', 'middle') +
  // Gmail mock inbox
  `<rect x="220" y="240" width="840" height="420" rx="16" fill="#ffffff"/>` +
  `<rect x="220" y="240" width="840" height="56" rx="16" fill="#f8fafc"/>` +
  text(260, 276, 18, F[700], 'Sent Mail', '700') +
  // Row 1
  `<line x1="220" y1="296" x2="1060" y2="296" stroke="#e2e8f0" stroke-width="1"/>` +
  text(260, 340, 16, F[800], 'Sarah Connor', '600') +
  text(440, 340, 16, F[600], 'Q3 Strategic Partnership Agreement &amp; Pricing') +
  `<rect x="880" y="320" width="140" height="30" rx="15" fill="#dbeafe"/>` +
  text(950, 341, 13, '#1d4ed8', '✓✓ 4 opens · 1 click', '700', 'middle') +
  // Row 2
  `<line x1="220" y1="376" x2="1060" y2="376" stroke="#e2e8f0" stroke-width="1"/>` +
  text(260, 420, 16, F[800], 'David Miller', '600') +
  text(440, 420, 16, F[600], 'Updated design prototypes &amp; brand assets') +
  `<rect x="910" y="400" width="110" height="30" rx="15" fill="#dbeafe"/>` +
  text(965, 421, 13, '#1d4ed8', '✓✓ 2 opens', '700', 'middle') +
  // Row 3
  `<line x1="220" y1="456" x2="1060" y2="456" stroke="#e2e8f0" stroke-width="1"/>` +
  text(260, 500, 16, F[800], 'Elena Rostova', '600') +
  text(440, 500, 16, F[600], 'Quick sync on tomorrow schedule') +
  `<rect x="930" y="480" width="90" height="30" rx="15" fill="#f1f5f9"/>` +
  text(975, 501, 13, '#64748b', '✓ Sent', '600', 'middle') +
  // Row 4
  `<line x1="220" y1="536" x2="1060" y2="536" stroke="#e2e8f0" stroke-width="1"/>` +
  text(260, 580, 16, F[800], 'Alex Vance', '600') +
  text(440, 580, 16, F[600], 'Introduction to Mail Falcon tracking features') +
  `<rect x="900" y="560" width="120" height="30" rx="15" fill="#f3f4f6"/>` +
  text(960, 581, 13, '#4b5563', '✓  Cached', '600', 'middle') +
  logo(600, 690, 36) +
  text(646, 715, 20, F[200], 'Mail Falcon for Gmail', '700'))

// ---- Screenshot 2: Real-Time Live World Map (1280x800) ----
await render('screenshot-2-worldmap-1280x800.png', 1280, 800,
  text(640, 110, 46, '#ffffff', 'Live Real-Time World Activity Map', '700', 'middle') +
  text(640, 160, 22, F[300], 'Watch global recipient engagement stream in live via Server-Sent Events.', '400', 'middle') +
  `<rect x="220" y="240" width="840" height="420" rx="16" fill="#0b1329" stroke="#1e293b" stroke-width="2"/>` +
  // World map mock dots
  `<circle cx="420" cy="400" r="8" fill="${CYAN}" opacity="0.9"/>` +
  `<circle cx="420" cy="400" r="22" fill="${CYAN}" opacity="0.25"/>` +
  text(420, 436, 13, '#ffffff', 'New York (Just now)', '600', 'middle') +
  `<circle cx="680" cy="380" r="8" fill="${CYAN}" opacity="0.9"/>` +
  `<circle cx="680" cy="380" r="22" fill="${CYAN}" opacity="0.25"/>` +
  text(680, 416, 13, '#ffffff', 'London (1m ago)', '600', 'middle') +
  `<circle cx="890" cy="480" r="7" fill="#3b82f6" opacity="0.9"/>` +
  text(890, 510, 13, '#ffffff', 'Tokyo (5m ago)', '600', 'middle') +
  // stats badge
  `<rect x="250" y="270" width="220" height="46" rx="10" fill="#1e293b"/>` +
  `<circle cx="272" cy="293" r="5" fill="#22c55e"/>` +
  text(290, 298, 14, '#ffffff', 'Stream Active  ·  142 opens today', '600') +
  logo(600, 690, 36) +
  text(646, 715, 20, F[200], 'Mail Falcon Intelligence', '700'))

// ---- Screenshot 3: Interactive Desktop Push Notifications (1280x800) ----
await render('screenshot-3-notifications-1280x800.png', 1280, 800,
  text(640, 110, 46, '#ffffff', 'Interactive Instant Desktop Notifications', '700', 'middle') +
  text(640, 160, 22, F[300], 'Instant alerts with direct deep links and one-click thread muting.', '400', 'middle') +
  `<rect x="340" y="260" width="600" height="240" rx="18" fill="#ffffff" filter="drop-shadow(0 10px 20px rgba(0,0,0,0.3))"/>` +
  logo(376, 296, 56) +
  text(456, 320, 24, F[800], 'Email Opened Immediately', '700') +
  text(456, 354, 18, F[600], 'sarah@acme.corp · Chrome (macOS) · San Francisco, US') +
  text(456, 386, 15, F[400], 'Subject: “Enterprise License Proposal &amp; Terms”') +
  `<circle cx="890" cy="300" r="7" fill="#22c55e"/>` +
  // Interactive action buttons
  `<rect x="456" y="420" width="180" height="42" rx="8" fill="#00d4ff"/>` +
  text(546, 447, 15, F[900], '👁 View Details', '700', 'middle') +
  `<rect x="654" y="420" width="160" height="42" rx="8" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="1"/>` +
  text(734, 447, 15, F[700], '🔕 Mute Email', '600', 'middle') +
  logo(600, 690, 36) +
  text(646, 715, 20, F[200], 'Zero-Latency Push Engine', '700'))

// ---- Screenshot 4: Apple MPP & Proxy Protection (1280x800) ----
await render('screenshot-4-mpp-privacy-1280x800.png', 1280, 800,
  text(640, 110, 46, '#ffffff', 'Apple MPP &amp; Proxy Pre-Fetch Protection', '700', 'middle') +
  text(640, 160, 22, F[300], 'Accurately separates automated proxy pre-fetches from real human opens.', '400', 'middle') +
  `<rect x="300" y="250" width="680" height="340" rx="18" fill="#ffffff"/>` +
  text(340, 300, 22, F[800], 'Smart Heuristic Classification', '700') +
  `<line x1="340" y1="320" x2="940" y2="320" stroke="#e2e8f0" stroke-width="1"/>` +
  // Heuristic 1
  `<rect x="340" y="340" width="280" height="90" rx="10" fill="#f8fafc" stroke="#e2e8f0"/>` +
  text(360, 370, 16, '#0f766e', '✓ Apple Mail Privacy Protection', '700') +
  text(360, 400, 13, F[600], 'iCloud Private Relay &amp; Apple ASN') +
  // Heuristic 2
  `<rect x="640" y="340" width="280" height="90" rx="10" fill="#f8fafc" stroke="#e2e8f0"/>` +
  text(660, 370, 16, '#1d4ed8', '✓ Google Image Proxy Filter', '700') +
  text(660, 400, 13, F[600], 'Datacenter IP pre-load detection') +
  // Heuristic 3
  `<rect x="340" y="450" width="580" height="90" rx="10" fill="#f0fdf4" stroke="#86efac"/>` +
  text(360, 485, 16, '#15803d', '✓ Verified Human Opens Only', '700') +
  text(360, 515, 14, F[600], 'Desktop alerts only trigger on genuine recipient interaction') +
  logo(600, 690, 36) +
  text(646, 715, 20, F[200], 'Mail Falcon Deliverability Suite', '700'))

// ---- Screenshot 5: Automated Drip Sequences & Deliverability (1280x800) ----
await render('screenshot-5-sequences-1280x800.png', 1280, 800,
  text(640, 110, 46, '#ffffff', 'Multi-Stage Follow-Up Drip Sequences', '700', 'middle') +
  text(640, 160, 22, F[300], 'Automate gentle follow-ups that halt automatically the second a lead replies.', '400', 'middle') +
  `<rect x="280" y="240" width="720" height="360" rx="16" fill="#ffffff"/>` +
  text(320, 285, 22, F[800], 'Sequence: "Executive Inbound Follow-Up"', '700') +
  // Step 1
  `<rect x="320" y="315" width="640" height="65" rx="8" fill="#f8fafc" stroke="#e2e8f0"/>` +
  text(340, 345, 15, F[700], 'Step 1 · Initial Outreach', '700') +
  text(340, 365, 13, F[500], 'Immediately on enrollment · Template: Inbound Intro') +
  // Step 2
  `<rect x="320" y="395" width="640" height="65" rx="8" fill="#f8fafc" stroke="#e2e8f0"/>` +
  text(340, 425, 15, F[700], 'Step 2 · Bump if no reply (3 days)', '700') +
  text(340, 445, 13, F[500], 'Auto-pauses if recipient opens or replies') +
  // Step 3
  `<rect x="320" y="475" width="640" height="65" rx="8" fill="#f8fafc" stroke="#e2e8f0"/>` +
  text(340, 505, 15, F[700], 'Step 3 · Final Check-In (5 days)', '700') +
  text(340, 525, 13, F[500], 'Deliverability pre-flight spam check: 98/100 (Great)') +
  logo(600, 690, 36) +
  text(646, 715, 20, F[200], 'Mail Falcon Automation', '700'))

console.log('\nAll Chrome Web Store assets generated successfully in apps/extension/store-assets/!')
