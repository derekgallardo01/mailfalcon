/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        falcon: {
          50: '#070c18', // Deep canvas background
          100: '#0d172e', // Card / Header / Elevated surface
          200: '#1e293b', // Slate border
          300: '#334155', // Active border / Divider
          400: '#94a3b8', // Muted text / helper (high-contrast slate-400)
          500: '#cbd5e1', // Secondary text (crisp slate-300)
          600: '#e2e8f0', // Primary body text (bright slate-200)
          700: '#f8fafc', // High contrast text / headings (slate-50)
          800: '#ffffff', // Pure white heading
          900: '#ffffff', // Pure white
        },
        electric: {
          cyan: '#00d4ff',
          blue: '#0284c7',
          sky: '#38bdf8',
          teal: '#14b8a6',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

