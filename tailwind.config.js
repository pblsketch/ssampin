/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        sp: {
          bg: 'var(--sp-bg)',
          surface: 'var(--sp-surface)',
          card: 'var(--sp-card)',
          border: 'var(--sp-border)',
          accent: 'var(--sp-accent)',
          highlight: 'var(--sp-highlight)',
          text: 'var(--sp-text)',
          muted: 'var(--sp-muted)',
        },
      },
      fontFamily: {
        display: ['Noto Sans KR', 'sans-serif'],
        body: ['Noto Sans KR', 'sans-serif'],
      },
      animation: {
        'slide-in-right': 'slideInRight 0.3s ease-out',
      },
      keyframes: {
        slideInRight: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
