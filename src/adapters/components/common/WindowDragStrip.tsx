/**
 * 제목 표시줄을 없앤 창에서, 맨 위에 두는 드래그용 띠.
 *
 * 배경(2026-08-14): 윈도우 11 내장 유리는 창 전체에 입혀져서 제목 표시줄까지 비쳤다.
 * 표시줄만 불투명하게 남길 방법이 없어 표시줄 자체를 없앴는데(main.ts titleBarStyle),
 * 그러면 두 가지가 사라진다.
 *
 * 1. **창을 옮길 곳** — 표시줄이 곧 손잡이였다. 이 띠가 그 역할을 대신한다.
 *    없으면 창을 마우스로 움직일 수 없다.
 * 2. **위쪽 여백** — 내용이 창 맨 위로 올라붙어 오른쪽 창 조작 버튼과 겹친다.
 *    이 띠가 자리를 차지해 아래로 밀어 준다.
 *
 * 배경(2026-08-18) — 개별 페이지에서는 이 띠에 **제목줄과 같은 색**을 준다.
 *
 * 준일님 지적: "제목부가 여전히 별로인 건 최소화·복구·닫기 버튼이 있는 줄이 배경색으로
 * 처리되어서 그런 것 같다." 정확한 진단이었다. 개별 페이지는 바로 아래에 제목줄
 * (`PageHeader`, `bg-sp-surface`)이 오는데 이 띠만 배경색이라, 창 버튼 줄과 제목줄 사이에
 * 색이 한 번 끊긴다. 그래서 제목줄이 "떠 있는 판"처럼 보였다.
 *
 * 같은 색을 주면 창 맨 위부터 제목줄 끝까지가 **한 덩어리 껍데기**로 읽힌다. 왼쪽 사이드바와
 * 합쳐 ㄱ자 테두리를 이루는 것도 같은 의도다.
 *
 * 대시보드는 예외로 **투명하게 둔다.** 거기는 아래에 제목줄이 없고 배경 그라데이션이 창 맨
 * 위까지 이어져야 하기 때문이다. 유리를 켰을 때도 `[data-sp-glass-surface]` 규칙을 함께 받아
 * 제목줄과 같은 재질이 된다.
 *
 * 이 모드가 아닌 환경(macOS·리눅스·브라우저)에서는 아무것도 그리지 않는다.
 * 거기서는 원래 제목 표시줄이 그대로 있어서 띠를 두면 빈 공간만 생긴다.
 */
import { useEffect, useState } from 'react';

export interface WindowDragStripProps {
  /**
   * 제목줄과 같은 면으로 칠할지 여부.
   * 개별 페이지 = true, 대시보드 = false(배경이 창 맨 위까지 이어져야 한다).
   */
  readonly surface?: boolean;
}

/** 창 조작 버튼이 화면 위에 떠 있는 모드인가 */
function hasWindowControlsOverlay(): boolean {
  if (typeof navigator === 'undefined') return false;
  const wco = (navigator as Navigator & { windowControlsOverlay?: { visible: boolean } })
    .windowControlsOverlay;
  return wco?.visible === true;
}

export function WindowDragStrip({ surface = false }: WindowDragStripProps = {}) {
  const [visible, setVisible] = useState(hasWindowControlsOverlay);

  useEffect(() => {
    // 전체화면으로 바꾸면 창 버튼이 사라진다. 그때 띠도 같이 접어야 빈 줄이 남지 않는다.
    const wco = (
      navigator as Navigator & {
        windowControlsOverlay?: {
          visible: boolean;
          addEventListener?: (type: string, cb: () => void) => void;
          removeEventListener?: (type: string, cb: () => void) => void;
        };
      }
    ).windowControlsOverlay;
    if (!wco?.addEventListener) return;
    const onChange = () => setVisible(wco.visible === true);
    wco.addEventListener('geometrychange', onChange);
    return () => wco.removeEventListener?.('geometrychange', onChange);
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      {...(surface ? { 'data-sp-glass-surface': true } : {})}
      className={`shrink-0 ${surface ? 'bg-sp-surface' : ''}`.trim()}
      style={
        {
          // 창 버튼이 실제로 차지하는 높이를 OS 가 알려 준다. 못 받으면 윈도우 기본값 32px.
          height: 'env(titlebar-area-height, 32px)',
          WebkitAppRegion: 'drag',
        } as React.CSSProperties
      }
    />
  );
}
