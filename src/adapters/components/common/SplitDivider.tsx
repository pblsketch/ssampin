/**
 * SplitDivider — 좌우로 나뉜 두 영역의 폭을 드래그로 조절하는 손잡이.
 *
 * 왜 만들었나 (2026-08-18) — 일정 화면의 달력과 "이번 달 일정"이 60:40 으로 **고정**이라
 * 바꿀 수 없었다. 선생님마다 보는 방식이 달라서(달력을 크게 보고 싶은 분, 일정 목록을 넓게
 * 보고 싶은 분) 고정 비율이 맞지 않는다는 지적이 있었다.
 *
 * 설계 시 지킨 것 세 가지.
 *
 * 1. **드래그는 `window` 로 받는다.** 손잡이 요소에만 핸들러를 걸면 커서가 손잡이를
 *    벗어나는 순간(빠르게 끌면 반드시 벗어난다) 이동·놓기 이벤트를 놓쳐 **손을 뗐는데도
 *    영역이 커서를 따라다니는** 고착이 생긴다. 옆핀 작업에서 실제로 겪은 함정이다.
 * 2. **되돌릴 길을 둔다.** 더블클릭하면 기본 비율로 돌아간다. 잘못 끌어 놓고 원래대로
 *    못 돌아가는 것이 조절 기능의 가장 흔한 불만이다.
 * 3. **마우스 없이도 쓸 수 있다.** `role="separator"` + 좌우 방향키. 손잡이는 폭이 좁아
 *    조준이 어려운 대상이라 키보드 경로가 특히 중요하다.
 *
 * 값은 **왼쪽 영역이 차지하는 비율(%)** 이다. 부모가 그 값을 어떻게 쓸지는 부모가 정한다
 * (보통 CSS 변수로 내려 `w-[var(--...)]` 에 물린다).
 */
import { useCallback, useEffect, useRef, type RefObject } from 'react';

export interface SplitDividerProps {
  /** 왼쪽 영역 비율 (%) */
  readonly value: number;
  readonly onChange: (next: number) => void;
  /** 비율을 재는 기준이 되는 컨테이너 */
  readonly containerRef: RefObject<HTMLElement | null>;
  /** 최소·최대 비율 (%) — 한쪽이 못 쓸 만큼 좁아지는 것을 막는다 */
  readonly min?: number;
  readonly max?: number;
  /** 더블클릭 시 돌아갈 기본 비율 (%) */
  readonly defaultValue: number;
  /** 스크린리더용 이름 — 무엇과 무엇 사이인지 알려 준다 */
  readonly ariaLabel: string;
  readonly className?: string;
}

/** 방향키 한 번에 움직이는 폭 (%) */
const STEP = 2;

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function SplitDivider({
  value,
  onChange,
  containerRef,
  min = 30,
  max = 75,
  defaultValue,
  ariaLabel,
  className = '',
}: SplitDividerProps) {
  const draggingRef = useRef(false);

  /* 드래그 중에는 글자가 선택되지 않게 한다. 이게 없으면 끌 때마다 화면의 글자가
     파랗게 잡혀 조절이 아니라 "복사하려는 동작"처럼 보인다. */
  const setDragCursor = useCallback((on: boolean) => {
    document.body.style.userSelect = on ? 'none' : '';
    document.body.style.cursor = on ? 'col-resize' : '';
  }, []);

  useEffect(() => {
    function handleMove(e: PointerEvent) {
      if (!draggingRef.current) return;
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return;
      const percent = ((e.clientX - rect.left) / rect.width) * 100;
      onChange(clamp(Math.round(percent), min, max));
    }
    function handleUp() {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      setDragCursor(false);
    }
    // 요소가 아니라 window 에 건다 — 위 주석 ①
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
      setDragCursor(false);
    };
  }, [containerRef, max, min, onChange, setDragCursor]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title="드래그하여 폭 조절 · 더블클릭하면 기본값으로"
      onPointerDown={(e) => {
        e.preventDefault();
        draggingRef.current = true;
        setDragCursor(true);
      }}
      onDoubleClick={() => onChange(defaultValue)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          onChange(clamp(value - STEP, min, max));
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          onChange(clamp(value + STEP, min, max));
        } else if (e.key === 'Home') {
          e.preventDefault();
          onChange(defaultValue);
        }
      }}
      /* 손잡이 자체는 좁게, 잡는 영역은 넓게. 보이는 선을 두껍게 하면 화면이 답답해지고,
         잡는 영역이 좁으면 조준이 어렵다. 둘을 분리한다. */
      className={`group hidden w-2 shrink-0 cursor-col-resize touch-none items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent lg:flex ${className}`.trim()}
    >
      <span
        aria-hidden
        className="h-16 w-1 rounded-full bg-sp-border transition-colors group-hover:bg-sp-accent group-focus-visible:bg-sp-accent"
      />
    </div>
  );
}
