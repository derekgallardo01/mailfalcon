import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const sourcePath = 'C:/Users/Derek/.gemini/antigravity/brain/e6184403-8597-4d1d-9e77-4de50902256d/concept2_speed_envelope_1787003476009.jpg'
const root = 'I:/Projects/mailfalcon'
const storeDir = resolve(root, 'apps/extension/store-assets')
const extIconDir = resolve(root, 'apps/extension/public/icon')
const webAppDir = resolve(root, 'apps/web/app')
const webPublicDir = resolve(root, 'apps/web/public')

await mkdir(storeDir, { recursive: true })
await mkdir(extIconDir, { recursive: true })
await mkdir(webAppDir, { recursive: true })
await mkdir(webPublicDir, { recursive: true })

// 1. Extract the high-res 700x700 squircle tile from the original generation
// The squircle in concept2 is located from left: 162, top: 162, width: 700, height: 700
const rawTile = await sharp(sourcePath)
  .extract({ left: 162, top: 162, width: 700, height: 700 })
  .png()
  .toBuffer()

// 2. Create smooth rounded squircle mask for app icons
const maskSvg = `<svg width="700" height="700" viewBox="0 0 700 700">
  <rect width="700" height="700" rx="150" ry="150" fill="#ffffff"/>
</svg>`

const roundedTile = await sharp(rawTile)
  .composite([{ input: Buffer.from(maskSvg), blend: 'dest-in' }])
  .png({ compressionLevel: 9 })
  .toBuffer()

// Also make a version with the dark background for store icon (no alpha allowed by CWS)
const noAlphaStoreIcon128 = await sharp(rawTile)
  .resize(128, 128, { fit: 'cover' })
  .flatten({ background: '#0a0f1d' })
  .png({ compressionLevel: 9 })
  .toBuffer()

await writeFile(resolve(storeDir, 'store-icon-128x128.png'), noAlphaStoreIcon128)
console.log('✔ store-icon-128x128.png')

// Google OAuth Consent Screen App Logo (120x120 PNG required by Google Cloud Console)
const googleOAuthLogo120 = await sharp(roundedTile)
  .resize(120, 120)
  .png({ compressionLevel: 9 })
  .toBuffer()
await writeFile(resolve(storeDir, 'google-oauth-app-logo-120x120.png'), googleOAuthLogo120)
console.log('✔ google-oauth-app-logo-120x120.png')

const googleOAuthLogo512 = await sharp(roundedTile)
  .resize(512, 512)
  .png({ compressionLevel: 9 })
  .toBuffer()
await writeFile(resolve(storeDir, 'google-oauth-app-logo-512x512.png'), googleOAuthLogo512)
console.log('✔ google-oauth-app-logo-512x512.png')

// Write extension icons (16, 32, 48, 128)
for (const size of [16, 32, 48, 128]) {
  const buf = await sharp(roundedTile).resize(size, size).png({ compressionLevel: 9 }).toBuffer()
  await writeFile(resolve(extIconDir, `${size}.png`), buf)
  console.log(`✔ extension icon ${size}.png`)
}

// Write web app icons
const webIcon192 = await sharp(roundedTile).resize(192, 192).png({ compressionLevel: 9 }).toBuffer()
await writeFile(resolve(webAppDir, 'icon.png'), webIcon192)

const appleIcon180 = await sharp(rawTile).resize(180, 180).flatten({ background: '#0a0f1d' }).png({ compressionLevel: 9 }).toBuffer()
await writeFile(resolve(webAppDir, 'apple-icon.png'), appleIcon180)

// Update web public icons (replace old placeholder falcon.png)
const falconPng = await sharp(roundedTile).resize(512, 512).png({ compressionLevel: 9 }).toBuffer()
await writeFile(resolve(webPublicDir, 'falcon.png'), falconPng)
await writeFile(resolve(webPublicDir, 'logo.png'), falconPng)
console.log('✔ web public icons (falcon.png & logo.png)')
console.log('✔ web app icons')

// 3. Composite into Small Promo Tile 440x280
const smallLogo = await sharp(roundedTile).resize(120, 120).png().toBuffer()
const smallPromoBaseSvg = `<svg width="440" height="280" viewBox="0 0 440 280">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0e172a"/>
      <stop offset="100%" stop-color="#020617"/>
    </linearGradient>
  </defs>
  <rect width="440" height="280" fill="url(#bg)"/>
  <text x="220" y="195" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="700" fill="#ffffff" text-anchor="middle">Mail Falcon</text>
  <text x="220" y="226" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="600" fill="#00d4ff" text-anchor="middle">Double Checkmarks &amp; Real-Time Tracking</text>
  <text x="220" y="250" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="400" fill="#94a3b8" text-anchor="middle">Built for Gmail</text>
</svg>`

await sharp(Buffer.from(smallPromoBaseSvg))
  .composite([{ input: smallLogo, top: 30, left: 160 }])
  .flatten({ background: '#0a0f1d' })
  .png({ compressionLevel: 9 })
  .toFile(resolve(storeDir, 'small-promo-440x280.png'))
console.log('✔ small-promo-440x280.png')

// 4. Composite into Marquee Promo Tile 1400x560
const marqueeLogo = await sharp(roundedTile).resize(300, 300).png().toBuffer()
const marqueeBaseSvg = `<svg width="1400" height="560" viewBox="0 0 1400 560">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#020617"/>
    </linearGradient>
    <radialGradient id="glow" cx="20%" cy="50%" r="40%">
      <stop offset="0%" stop-color="#00d4ff" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#00d4ff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1400" height="560" fill="url(#bg)"/>
  <rect width="1400" height="560" fill="url(#glow)"/>
  <text x="470" y="225" font-family="Arial, Helvetica, sans-serif" font-size="92" font-weight="800" fill="#ffffff" letter-spacing="-1">Mail Falcon</text>
  <text x="474" y="295" font-family="Arial, Helvetica, sans-serif" font-size="34" font-weight="600" fill="#00d4ff">Know the exact second your email is opened.</text>
  <text x="474" y="365" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="400" fill="#94a3b8">✓✓ Double Blue Checkmarks in Gmail  ·  Live World Map  ·  Apple MPP Filter  ·  Drip Sequences</text>
  <rect x="474" y="415" width="260" height="56" rx="28" fill="#00d4ff"/>
  <text x="604" y="451" font-family="Arial, Helvetica, sans-serif" font-size="21" font-weight="700" fill="#0f172a" text-anchor="middle">Add to Chrome — Free</text>
</svg>`

await sharp(Buffer.from(marqueeBaseSvg))
  .composite([{ input: marqueeLogo, top: 130, left: 110 }])
  .flatten({ background: '#0a0f1d' })
  .png({ compressionLevel: 9 })
  .toFile(resolve(storeDir, 'marquee-promo-1400x560.png'))
console.log('✔ marquee-promo-1400x560.png')

// 5. Composite into the 5 Screenshots (1280x800)
const screenshotMiniLogo = await sharp(roundedTile).resize(48, 48).png().toBuffer()

const screenshotDefs = (title, subtitle) => `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#020617"/>
    </linearGradient>
  </defs>
  <rect width="1280" height="800" fill="url(#bg)"/>
  <text x="640" y="100" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="800" fill="#ffffff" text-anchor="middle">${title}</text>
  <text x="640" y="146" font-family="Arial, Helvetica, sans-serif" font-size="21" font-weight="400" fill="#94a3b8" text-anchor="middle">${subtitle}</text>
`

// Screenshot 1: Double Checkmarks in Gmail
const s1Svg = `<svg width="1280" height="800" viewBox="0 0 1280 800">
  ${screenshotDefs('Double Blue Checkmarks (✓✓) Inside Gmail', 'See open, click, and reply status directly in your Gmail Sent mail folder.')}
  <rect x="180" y="210" width="920" height="460" rx="16" fill="#ffffff" filter="drop-shadow(0 12px 28px rgba(0,0,0,0.4))"/>
  <rect x="180" y="210" width="920" height="60" rx="16" fill="#f8fafc"/>
  <text x="220" y="248" font-family="Arial" font-size="18" font-weight="700" fill="#0f172a">Sent Mail</text>
  <line x1="180" y1="270" x2="1100" y2="270" stroke="#e2e8f0" stroke-width="1"/>
  
  <text x="220" y="320" font-family="Arial" font-size="16" font-weight="700" fill="#0f172a">Sarah Connor</text>
  <text x="410" y="320" font-family="Arial" font-size="15" fill="#334155">Q3 Strategic Partnership Agreement &amp; Pricing</text>
  <rect x="910" y="298" width="150" height="32" rx="16" fill="#dbeafe"/>
  <text x="985" y="320" font-family="Arial" font-size="13" font-weight="700" fill="#1d4ed8" text-anchor="middle">✓✓ 4 opens · 1 click</text>
  
  <line x1="180" y1="355" x2="1100" y2="355" stroke="#f1f5f9" stroke-width="1"/>
  <text x="220" y="405" font-family="Arial" font-size="16" font-weight="700" fill="#0f172a">David Miller</text>
  <text x="410" y="405" font-family="Arial" font-size="15" fill="#334155">Updated design prototypes &amp; brand assets</text>
  <rect x="940" y="383" width="120" height="32" rx="16" fill="#dbeafe"/>
  <text x="1000" y="405" font-family="Arial" font-size="13" font-weight="700" fill="#1d4ed8" text-anchor="middle">✓✓ 2 opens</text>
  
  <line x1="180" y1="440" x2="1100" y2="440" stroke="#f1f5f9" stroke-width="1"/>
  <text x="220" y="490" font-family="Arial" font-size="16" font-weight="700" fill="#0f172a">Elena Rostova</text>
  <text x="410" y="490" font-family="Arial" font-size="15" fill="#334155">Quick sync on tomorrow schedule</text>
  <rect x="960" y="468" width="100" height="32" rx="16" fill="#f1f5f9"/>
  <text x="1010" y="490" font-family="Arial" font-size="13" font-weight="600" fill="#64748b" text-anchor="middle">✓ Sent</text>
  
  <line x1="180" y1="525" x2="1100" y2="525" stroke="#f1f5f9" stroke-width="1"/>
  <text x="220" y="575" font-family="Arial" font-size="16" font-weight="700" fill="#0f172a">Alex Vance</text>
  <text x="410" y="575" font-family="Arial" font-size="15" fill="#334155">Introduction to Mail Falcon tracking features</text>
  <rect x="930" y="553" width="130" height="32" rx="16" fill="#f3f4f6"/>
  <text x="995" y="575" font-family="Arial" font-size="13" font-weight="600" fill="#4b5563" text-anchor="middle">✓  Cached</text>

  <text x="640" y="730" font-family="Arial" font-size="20" font-weight="700" fill="#94a3b8" text-anchor="middle">Mail Falcon for Gmail</text>
</svg>`

await sharp(Buffer.from(s1Svg))
  .composite([{ input: screenshotMiniLogo, top: 706, left: 470 }])
  .flatten({ background: '#0a0f1d' })
  .png({ compressionLevel: 9 })
  .toFile(resolve(storeDir, 'screenshot-1-checkmarks-1280x800.png'))
console.log('✔ screenshot-1-checkmarks-1280x800.png')

// Screenshot 2: Real-time Live World Map
const s2Svg = `<svg width="1280" height="800" viewBox="0 0 1280 800">
  ${screenshotDefs('Live Real-Time Global Activity Feed', 'Watch recipient opens and clicks stream in globally via Server-Sent Events.')}
  <rect x="180" y="210" width="920" height="460" rx="16" fill="#090e1a" stroke="#1e293b" stroke-width="2"/>
  <circle cx="380" cy="380" r="10" fill="#00d4ff"/>
  <circle cx="380" cy="380" r="26" fill="#00d4ff" opacity="0.25"/>
  <text x="380" y="424" font-family="Arial" font-size="14" font-weight="700" fill="#ffffff" text-anchor="middle">New York (Just now)</text>
  
  <circle cx="670" cy="360" r="10" fill="#00d4ff"/>
  <circle cx="670" cy="360" r="26" fill="#00d4ff" opacity="0.25"/>
  <text x="670" y="404" font-family="Arial" font-size="14" font-weight="700" fill="#ffffff" text-anchor="middle">London (2m ago)</text>

  <circle cx="910" cy="460" r="8" fill="#38bdf8"/>
  <text x="910" y="495" font-family="Arial" font-size="14" font-weight="700" fill="#ffffff" text-anchor="middle">Tokyo (6m ago)</text>

  <rect x="220" y="245" width="240" height="48" rx="12" fill="#1e293b"/>
  <circle cx="245" cy="269" r="6" fill="#22c55e"/>
  <text x="262" y="275" font-family="Arial" font-size="14" font-weight="700" fill="#ffffff">Live Stream Connected</text>

  <text x="640" y="730" font-family="Arial" font-size="20" font-weight="700" fill="#94a3b8" text-anchor="middle">Real-Time Intelligence Engine</text>
</svg>`

await sharp(Buffer.from(s2Svg))
  .composite([{ input: screenshotMiniLogo, top: 706, left: 440 }])
  .flatten({ background: '#0a0f1d' })
  .png({ compressionLevel: 9 })
  .toFile(resolve(storeDir, 'screenshot-2-worldmap-1280x800.png'))
console.log('✔ screenshot-2-worldmap-1280x800.png')

// Screenshot 3: Interactive Notifications
const notifIcon = await sharp(roundedTile).resize(72, 72).png().toBuffer()
const s3Svg = `<svg width="1280" height="800" viewBox="0 0 1280 800">
  ${screenshotDefs('Instant Desktop Push Alerts with Quick Actions', 'Immediate notifications the moment an email is opened, with direct actions.')}
  <rect x="290" y="240" width="700" height="280" rx="20" fill="#ffffff" filter="drop-shadow(0 16px 36px rgba(0,0,0,0.4))"/>
  
  <text x="420" y="305" font-family="Arial" font-size="24" font-weight="800" fill="#0f172a">Email Opened Immediately</text>
  <text x="420" y="342" font-family="Arial" font-size="17" font-weight="600" fill="#334155">sarah@acme.corp · Chrome (macOS) · San Francisco, US</text>
  <text x="420" y="375" font-family="Arial" font-size="15" fill="#64748b">Subject: “Enterprise License Proposal &amp; Terms”</text>
  <circle cx="940" cy="285" r="8" fill="#22c55e"/>

  <rect x="420" y="420" width="190" height="46" rx="10" fill="#00d4ff"/>
  <text x="515" y="450" font-family="Arial" font-size="15" font-weight="700" fill="#0f172a" text-anchor="middle">👁 View Details</text>
  
  <rect x="630" y="420" width="170" height="46" rx="10" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="1"/>
  <text x="715" y="450" font-family="Arial" font-size="15" font-weight="700" fill="#334155" text-anchor="middle">🔕 Mute Email</text>

  <text x="640" y="730" font-family="Arial" font-size="20" font-weight="700" fill="#94a3b8" text-anchor="middle">Zero-Latency Push Alerts</text>
</svg>`

await sharp(Buffer.from(s3Svg))
  .composite([
    { input: notifIcon, top: 275, left: 325 },
    { input: screenshotMiniLogo, top: 706, left: 470 }
  ])
  .flatten({ background: '#0a0f1d' })
  .png({ compressionLevel: 9 })
  .toFile(resolve(storeDir, 'screenshot-3-notifications-1280x800.png'))
console.log('✔ screenshot-3-notifications-1280x800.png')

// Screenshot 4: Apple MPP Filter
const s4Svg = `<svg width="1280" height="800" viewBox="0 0 1280 800">
  ${screenshotDefs('Apple MPP &amp; Proxy Pre-Fetch Protection', 'Eliminates false open notifications caused by Apple iCloud Relay and automated bots.')}
  <rect x="240" y="220" width="800" height="380" rx="18" fill="#ffffff" filter="drop-shadow(0 12px 28px rgba(0,0,0,0.3))"/>
  <text x="280" y="275" font-family="Arial" font-size="22" font-weight="800" fill="#0f172a">Intelligent Pre-Fetch Heuristics</text>
  <line x1="280" y1="298" x2="1000" y2="298" stroke="#e2e8f0" stroke-width="1"/>

  <rect x="280" y="325" width="340" height="100" rx="12" fill="#f8fafc" stroke="#e2e8f0"/>
  <text x="305" y="360" font-family="Arial" font-size="16" font-weight="700" fill="#0f766e">✓ Apple Mail Privacy Protection</text>
  <text x="305" y="390" font-family="Arial" font-size="13" fill="#475569">Identifies iCloud Relay &amp; Apple ASNs</text>

  <rect x="660" y="325" width="340" height="100" rx="12" fill="#f8fafc" stroke="#e2e8f0"/>
  <text x="685" y="360" font-family="Arial" font-size="16" font-weight="700" fill="#1d4ed8">✓ Google Image Proxy Filter</text>
  <text x="685" y="390" font-family="Arial" font-size="13" fill="#475569">Suppresses datacenter pre-load bots</text>

  <rect x="280" y="450" width="720" height="100" rx="12" fill="#f0fdf4" stroke="#86efac"/>
  <text x="305" y="490" font-family="Arial" font-size="17" font-weight="700" fill="#15803d">✓ Verified Human Engagement Only</text>
  <text x="305" y="520" font-family="Arial" font-size="14" fill="#334155">Only alerts you when a real human recipient opens or clicks your message.</text>

  <text x="640" y="730" font-family="Arial" font-size="20" font-weight="700" fill="#94a3b8" text-anchor="middle">Enterprise Deliverability Suite</text>
</svg>`

await sharp(Buffer.from(s4Svg))
  .composite([{ input: screenshotMiniLogo, top: 706, left: 450 }])
  .flatten({ background: '#0a0f1d' })
  .png({ compressionLevel: 9 })
  .toFile(resolve(storeDir, 'screenshot-4-mpp-privacy-1280x800.png'))
console.log('✔ screenshot-4-mpp-privacy-1280x800.png')

// Screenshot 5: Automated Sequences
const s5Svg = `<svg width="1280" height="800" viewBox="0 0 1280 800">
  ${screenshotDefs('Multi-Stage Automated Follow-Up Sequences', 'Build automated drip campaigns that pause the exact moment a prospect responds.')}
  <rect x="220" y="210" width="840" height="420" rx="16" fill="#ffffff" filter="drop-shadow(0 12px 28px rgba(0,0,0,0.3))"/>
  <text x="260" y="260" font-family="Arial" font-size="22" font-weight="800" fill="#0f172a">Sequence: "Enterprise Outbound Warm-Up"</text>
  
  <rect x="260" y="290" width="760" height="75" rx="10" fill="#f8fafc" stroke="#e2e8f0"/>
  <text x="285" y="325" font-family="Arial" font-size="16" font-weight="700" fill="#0f172a">Step 1 · Initial Outreach</text>
  <text x="285" y="348" font-family="Arial" font-size="13" fill="#64748b">Sent immediately on enrollment · Template: Intro &amp; Case Study</text>

  <rect x="260" y="380" width="760" height="75" rx="10" fill="#f8fafc" stroke="#e2e8f0"/>
  <text x="285" y="415" font-family="Arial" font-size="16" font-weight="700" fill="#0f172a">Step 2 · Gentle Bump (Wait 3 days)</text>
  <text x="285" y="438" font-family="Arial" font-size="13" fill="#64748b">Auto-pauses if recipient opens or replies</text>

  <rect x="260" y="470" width="760" height="75" rx="10" fill="#f8fafc" stroke="#e2e8f0"/>
  <text x="285" y="505" font-family="Arial" font-size="16" font-weight="700" fill="#0f172a">Step 3 · Final Check-In (Wait 5 days)</text>
  <text x="285" y="528" font-family="Arial" font-size="13" fill="#64748b">Deliverability Pre-Flight Score: 98/100 (Great rating)</text>

  <text x="640" y="730" font-family="Arial" font-size="20" font-weight="700" fill="#94a3b8" text-anchor="middle">Mail Falcon Automation</text>
</svg>`

await sharp(Buffer.from(s5Svg))
  .composite([{ input: screenshotMiniLogo, top: 706, left: 470 }])
  .flatten({ background: '#0a0f1d' })
  .png({ compressionLevel: 9 })
  .toFile(resolve(storeDir, 'screenshot-5-sequences-1280x800.png'))
console.log('✔ screenshot-5-sequences-1280x800.png')

console.log('\nAll assets generated with exact original Option 2 logo!')
