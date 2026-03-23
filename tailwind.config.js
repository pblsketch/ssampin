/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  safelist: [
    'col-span-1', 'col-span-2', 'col-span-3', 'col-span-4',
    'md:col-span-1', 'md:col-span-2', 'md:col-span-3', 'md:col-span-4',
  ],
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
          'accent-fg': 'var(--sp-accent-fg)',
          highlight: 'var(--sp-highlight)',
          text: 'var(--sp-text)',
          muted: 'var(--sp-muted)',
        },
      },
      fontSize: {
        'micro': ['0.5rem', { lineHeight: '0.75rem' }],         // 8px — 극소 라벨
        'tiny': ['0.5625rem', { lineHeight: '0.875rem' }],      // 9px — 컴팩트 뱃지
        'caption': ['0.625rem', { lineHeight: '1rem' }],        // 10px — 버전, 캡션
        'detail': ['0.6875rem', { lineHeight: '1rem' }],        // 11px — 상세 텍스트
        // text-xs(12px), text-sm(14px), text-base(16px), text-lg(18px) 등은 Tailwind 기본값 사용
        'icon-xs': ['0.625rem', { lineHeight: '1' }],           // 10px Material Symbol
        'icon-sm': ['0.875rem', { lineHeight: '1' }],           // 14px Material Symbol
        'icon': ['1rem', { lineHeight: '1' }],                  // 16px Material Symbol
        'icon-md': ['1.125rem', { lineHeight: '1' }],           // 18px Material Symbol
        'icon-lg': ['1.25rem', { lineHeight: '1' }],            // 20px Material Symbol
        'icon-xl': ['1.5rem', { lineHeight: '1' }],             // 24px Material Symbol
      },
      fontFamily: {
        display: ['Noto Sans KR', 'sans-serif'],
        body: ['Noto Sans KR', 'sans-serif'],
      },
      animation: {
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        slideInRight: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
