import type { ReactNode } from 'react';

/**
 * 모바일 헤더 변형.
 * - `app`: 앱 전역 상단바. 상태바 안전영역과 --header-height 를 책임진다. 앱에 하나뿐.
 * - `page`: 탭 안쪽 화면의 제목줄. 뒤로가기 없음.
 * - `fullscreen`: 탭 밖 전체화면의 제목줄. 왼쪽에 뒤로가기가 붙는다.
 */
type HeaderVariant = 'app' | 'page' | 'fullscreen';

interface MobileHeaderProps {
  variant?: HeaderVariant;
  /** 제목. 문자열이면 표준 스타일로, 노드면 그대로 렌더(부제목 두 줄 등). */
  title: ReactNode;
  /** fullscreen 에서 뒤로가기를 눌렀을 때. variant='fullscreen' 이면 필수. */
  onBack?: () => void;
  /** 뒤로가기 버튼의 스크린리더 이름. 어디로 돌아가는지 알려준다. */
  backLabel?: string;
  /** 제목 오른쪽 영역(아이콘 버튼 등). */
  actions?: ReactNode;
  /** 헤더 아래에 붙는 추가 줄(세그먼트·날짜바 등). 같은 유리 배경 안에 들어간다. */
  children?: ReactNode;
}

/** 최소 터치 대상 44×44 (Apple HIG). 화면마다 제각각이던 것을 여기로 모은다. */
const TOUCH_TARGET = { minWidth: 44, minHeight: 44 } as const;

/**
 * 모바일 공용 헤더.
 *
 * 이전에는 세 가지 헤더가 화면마다 따로 쓰여 있었고, 그 과정에서 어긋난 것들이 있었다.
 * 예를 들어 설정 화면의 뒤로가기 버튼만 최소 터치 크기와 aria-label 이 빠져 있었다.
 * 이 컴포넌트를 쓰면 그런 편차가 생기지 않는다.
 */
export function MobileHeader({
  variant = 'page',
  title,
  onBack,
  backLabel = '뒤로가기',
  actions,
  children,
}: MobileHeaderProps) {
  const isApp = variant === 'app';

  return (
    <header
      className={
        isApp
          ? 'glass-header shrink-0 flex items-center justify-between px-4'
          : 'glass-header shrink-0 flex flex-col'
      }
      style={
        isApp
          ? { height: 'var(--header-height)', paddingTop: 'env(safe-area-inset-top)' }
          : undefined
      }
    >
      {isApp ? (
        <>
          {typeof title === 'string' ? (
            <h1 className="text-lg font-bold text-sp-text">{title}</h1>
          ) : (
            title
          )}
          {actions}
        </>
      ) : (
        <>
          <div className="flex items-center gap-3 px-4 py-3">
            {variant === 'fullscreen' && onBack && (
              <button
                onClick={onBack}
                aria-label={backLabel}
                style={TOUCH_TARGET}
                className="flex items-center justify-center -ml-2 rounded-lg text-sp-text active:scale-95 transition-transform"
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  arrow_back
                </span>
              </button>
            )}
            {typeof title === 'string' ? (
              <h2 className="flex-1 min-w-0 truncate text-sp-text font-bold text-base">{title}</h2>
            ) : (
              <div className="flex-1 min-w-0">{title}</div>
            )}
            {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
          </div>
          {children}
        </>
      )}
    </header>
  );
}
