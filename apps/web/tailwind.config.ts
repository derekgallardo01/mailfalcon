import type { Config } from 'tailwindcss'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const preset = require('@mailfalcon/ui/tailwind.preset')

const config: Config = {
  presets: [preset],
  content: ['./app/**/*.{ts,tsx}'],
}

export default config
