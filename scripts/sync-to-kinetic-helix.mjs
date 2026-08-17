import sharp from 'sharp'
import { mkdir, copyFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const sourceTile = 'I:/Projects/mailfalcon/apps/extension/public/icon/128.png'
const rawOption2 = 'C:/Users/Derek/.gemini/antigravity/brain/e6184403-8597-4d1d-9e77-4de50902256d/concept2_speed_envelope_1787003476009.jpg'
const khDir = 'I:/Projects/kinetic-helix/public/work/mailfalcon'
const khShotsDir = resolve(khDir, 'shots')

await mkdir(khShotsDir, { recursive: true })

// 1. Generate high-res 1200x630 cover banner for Kinetic Helix
const logo300 = await sharp(rawOption2)
  .extract({ left: 162, top: 162, width: 700, height: 700 })
  .resize(320, 320)
  .png({ compressionLevel: 9 })
  .toBuffer()

const maskSvg = `<svg width="320" height="320" viewBox="0 0 320 320">
  <rect width="320" height="320" rx="70" ry="70" fill="#ffffff"/>
</svg>`

const roundedLogo320 = await sharp(logo300)
  .composite([{ input: Buffer.from(maskSvg), blend: 'dest-in' }])
  .png()
  .toBuffer()

const coverSvg = `<svg width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="60%" stop-color="#090e1a"/>
      <stop offset="100%" stop-color="#020617"/>
    </linearGradient>
    <radialGradient id="glow" cx="24%" cy="50%" r="45%">
      <stop offset="0%" stop-color="#00d4ff" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#00d4ff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <text x="440" y="260" font-family="Arial, Helvetica, sans-serif" font-size="78" font-weight="800" fill="#ffffff" letter-spacing="-1">Mail Falcon</text>
  <text x="444" y="325" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="600" fill="#00d4ff">Know the exact second your email is opened.</text>
  <text x="444" y="385" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="400" fill="#94a3b8">✓✓ Double Blue Checkmarks in Gmail  ·  Live World Map  ·  Drip Sequences</text>
  <rect x="444" y="430" width="230" height="52" rx="26" fill="#00d4ff"/>
  <text x="559" y="464" font-family="Arial, Helvetica, sans-serif" font-size="19" font-weight="700" fill="#0f172a" text-anchor="middle">Built for Gmail</text>
</svg>`

await sharp(Buffer.from(coverSvg))
  .composite([{ input: roundedLogo320, top: 155, left: 80 }])
  .flatten({ background: '#0a0f1d' })
  .png({ compressionLevel: 9 })
  .toFile(resolve(khDir, 'cover.png'))
console.log('✔ Kinetic Helix cover.png (1200x630)')

// 2. Copy the 5 screenshots to Kinetic Helix
const storeAssetsDir = 'I:/Projects/mailfalcon/apps/extension/store-assets'
const shots = [
  { src: 'screenshot-1-checkmarks-1280x800.png', dest: '01-gmail-checkmarks.png' },
  { src: 'screenshot-2-worldmap-1280x800.png', dest: '02-world-map.png' },
  { src: 'screenshot-3-notifications-1280x800.png', dest: '03-desktop-alerts.png' },
  { src: 'screenshot-4-mpp-privacy-1280x800.png', dest: '04-apple-mpp.png' },
  { src: 'screenshot-5-sequences-1280x800.png', dest: '05-sequences.png' },
]

for (const shot of shots) {
  await copyFile(resolve(storeAssetsDir, shot.src), resolve(khShotsDir, shot.dest))
  console.log(`✔ Copied shot -> ${shot.dest}`)
}

console.log('All Kinetic Helix assets synchronized successfully!')
