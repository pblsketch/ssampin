import { forwardRef, type InputHTMLAttributes } from 'react';

interface StickerSearchBarProps extends InputHTMLAttributes<HTMLInputElement> {
  /** 결과 개수 (스크린리더용 라이브 영역 — 검색 시 announce) */
  resultCount?: number;
  hasQuery?: boolean;
}

/**
 * 피커 상단 검색 입력.
 * - role="searchbox" + aria-live="polite"로 결과 개수 알림
 * - 검색 아이콘은 leading slot (Material Symbols)
 * - debounce는 부모 컴포넌트에서 setTimeout으로 처리 (단순화)
 */
export const StickerSearchBar = forwardRef<HTMLInputElement, StickerSearchBarProps>(
  function StickerSearchBar({ resultCount, hasQuery, className = '', ...rest }, ref) {
    return (
      <div className="relative flex-1 min-w-0">
        <span
          aria-hidden="true"
          className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 icon-md text-sp-muted pointer-events-none"
        >
          search
        </span>
        <input
          ref={ref}
          type="search"
          role="searchbox"
          autoComplete="off"
          spellCheck={false}
          placeholder="이름이나 태그로 찾기"
          className={[
            'w-full pl-10 pr-3 py-2.5 rounded-lg',
            'bg-sp-bg ring-1 ring-sp-border text-sp-text placeholder:text-sp-muted',
            'transition-shadow duration-sp-base ease-sp-out',
            'focus:outline-none focus:ring-2 focus:ring-sp-accent',
            'text-sm',
            className,
          ].filter(Boolean).join(' ')}
          {...rest}
        />
        {hasQuery && resultCount !== undefined && (
          <p
            role="status"
            aria-live="polite"
            className="sr-only"
          >
            {`검색 결과 ${resultCount}개`}
          </p>
        )}
      </div>
    );
  },
);
