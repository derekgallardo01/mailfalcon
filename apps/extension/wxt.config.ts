import { defineConfig } from 'wxt'

export default defineConfig({
  manifest: {
    name: 'mailfalcon',
    description:
      'Email tracking for Gmail — opens, clicks, real-time notifications.',
    permissions: ['storage', 'notifications', 'alarms', 'scripting'],
    host_permissions: [
      'https://mail.google.com/*',
      'https://*.mailfalcon.app/*',
    ],
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
    action: {
      default_title: 'mailfalcon',
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
