/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        gold: {
          DEFAULT: '#c9a84c',
          light: '#e0c068',
          dark: '#a07830',
        },
        cream: {
          DEFAULT: '#f0ece3',
          dark: '#d8d0c0',
          muted: '#a09880',
        },
        ink: {
          DEFAULT: '#0a0908',
          mid: '#1e1c18',
          card: '#141210',
          border: 'rgba(255,255,255,0.07)',
          light: '#a09880',
          muted: '#5a5448',
          faint: '#2e2a24',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
        display: ['var(--font-display)'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.4s ease forwards',
        'slide-up': 'slideUp 0.4s ease forwards',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      backdropBlur: {
        xs: '4px',
      },
    },
  },
  plugins: [],
}
