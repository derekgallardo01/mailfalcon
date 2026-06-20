import { defineConfig } from 'wxt'

export default defineConfig({
  manifest: {
    name: 'MailFalcon',
    description:
      'Email tracking for Gmail — opens, clicks, real-time notifications.',
    homepage_url: 'https://app.mailfalcon.app',
    // Pinned public key so unpacked / dev / pre-CWS builds load with a
    // stable extension ID (flimjkffmcjdmbppckejndmihbnflldm). The
    // matching private key lives at .local/extension-key.pem and is
    // gitignored. CWS overrides this on the published build.
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApWuuwvsEWexo739A6cZd9EJhmMQIgxJx5U0rIKt2pCJzf8FPcwb+yTftC7DEvXpbC3v1fpD6Zi63qT3FDo0pKg+5huURm/bxlQz1AVtv4MhfMkPWqMBZ0t8Ds35r3J296Emll3pvx0Z0RR6G44wVAsEhr53zeSohatSuEU+BYE3Qk+v3xP87D9ZxM3+NKBfiVCPNTX28YkqgZyD2nF4YjVrX+g2gsAm9tONHKzUsg9VtYt6OpHDYRJrySlfgiksHqqEcq15QhawKEEiJx/RsVramAsThCFkEBfhKjivjiA9d9gI/o/LVPpSJita2N87aZ3dojvuoBep31shjJLhREQIDAQAB',
    permissions: ['storage', 'notifications', 'alarms', 'scripting', 'identity'],
    host_permissions: [
      'https://mail.google.com/*',
      'https://*.mailfalcon.app/*',
      'https://gmail.googleapis.com/*',
    ],
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
    action: {
      default_title: 'MailFalcon',
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
      },
    },
    web_accessible_resources: [
      {
        resources: ['icon/*.png'],
        matches: ['<all_urls>'],
      },
      {
        // InboxSDK page-world bootstrap. Must live at extension root.
        resources: ['pageWorld.js'],
        matches: ['https://mail.google.com/*'],
      },
    ],
  },
})
