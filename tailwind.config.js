/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  safelist: [
    'col-span-1', 'col-span-2', 'col-span-3', 'col-span-4',
    'md:col-span-1', 'md:col-span-2', 'md:col-span-3', 'md:col-span-4',
    // 라이트 모드 시간표 과목 텍스트 색상
    'text-yellow-700', 'text-green-700', 'text-blue-700', 'text-purple-700',
    'text-orange-700', 'text-red-700', 'text-pink-700', 'text-indigo-700',
    'text-teal-700', 'text-emerald-700', 'text-cyan-700', 'text-violet-700',
    'text-amber-700', 'text-lime-700', 'text-rose-700', 'text-slate-700',
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
        display: ['Pretendard Variable', 'Pretendard', 'Noto Sans KR', 'sans-serif'],
        body: ['Pretendard Variable', 'Pretendard', 'Noto Sans KR', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SF Mono', 'Menlo', 'monospace'],
      },
      fontWeight: {
        /* sp- prefix — Tailwind 기본 font-medium/semibold/bold는 건드리지 않음.
         * 신규 컴포넌트만 font-sp-medium 등으로 opt-in 사용. */
        'sp-normal':   'var(--sp-weight-normal)',     // 400
        'sp-medium':   'var(--sp-weight-medium)',     // 510 (Pretendard Variable axis)
        'sp-semibold': 'var(--sp-weight-semibold)',   // 590
        'sp-bold':     'var(--sp-weight-bold)',       // 680
      },
      borderRadius: {
        /* ⚠️ 신규 코드에서 rounded-sp-* 사용 금지(memory/feedback_rounding_policy.md).
         * 기존 37개 파일은 회귀 방지를 위해 유지. 신규는 Tailwind 기본 키 사용:
         * rounded-md(6) / rounded-lg(8) / rounded-xl(12, 카드 기본) /
         * rounded-2xl(16) / rounded-3xl(24). */
        'sp-xs':   'var(--sp-radius-xs)',     // 4px
        'sp-sm':   'var(--sp-radius-sm)',     // 6px
        'sp-md':   'var(--sp-radius-md)',     // 8px
        'sp-lg':   'var(--sp-radius-lg)',     // 12px
        'sp-xl':   'var(--sp-radius-xl)',     // 16px
        'sp-pill': 'var(--sp-radius-pill)',   // 9999px
      },
      boxShadow: {
        'sp-none':   'var(--sp-shadow-none)',
        'sp-sm':     'var(--sp-shadow-sm)',
        'sp-md':     'var(--sp-shadow-md)',
        'sp-lg':     'var(--sp-shadow-lg)',
        'sp-accent': 'var(--sp-shadow-accent)',
      },
      transitionDuration: {
        'sp-quick': 'var(--sp-duration-quick)',  // 120ms
        'sp-base':  'var(--sp-duration-base)',   // 160ms
        'sp-slow':  'var(--sp-duration-slow)',   // 200ms
      },
      transitionTimingFunction: {
        'sp-out':       'var(--sp-ease-out)',
        'sp-out-cubic': 'var(--sp-ease-out-cubic)',
        'sp-in-out':    'var(--sp-ease-in-out)',
      },
      zIndex: {
        /* 시맨틱 z-index 레이어 (2026-04-25 신설).
         * 신규 코드는 z-{layer} 사용. 기존 z-50/z-[60]/z-[110] 등은 점진 마이그레이션. */
        'sp-dropdown': '40',
        'sp-modal':    '50',
        'sp-toast':    '60',
        'sp-palette':  '70',
        'sp-tooltip':  '80',
      },
      animation: {
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        // v2.1 (Phase A-A1) — FAB 잠금 시 호버 진동 애니메이션
        'fab-jiggle': 'fabJiggle 0.5s ease-in-out',
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
        // v2.1 (Phase A-A1) — FAB 잠금 시 호버 진동
        fabJiggle: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '20%': { transform: 'rotate(-12deg)' },
          '40%': { transform: 'rotate(10deg)' },
          '60%': { transform: 'rotate(-8deg)' },
          '80%': { transform: 'rotate(6deg)' },
        },
      },
    },
  },
  plugins: [],
};
