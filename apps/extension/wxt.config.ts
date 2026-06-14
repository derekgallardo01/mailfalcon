import { defineConfig } from 'wxt'

export default defineConfig({
  manifest: {
    name: 'mailfalcon',
    description:
      'Email tracking for Gmail — opens, clicks, real-time notifications.',
    permissions: ['storage', 'notifications', 'alarms'],
    host_permissions: [
      'https://mail.google.com/*',
      'https://*.mailfalcon.app/*',
    ],
    action: {
      default_title: 'mailfalcon',
    },
  },
})
