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
 * 배경색을 주지 않는다. 그래야 뒤에 깔린 유리·배경이 창 맨 위까지 이어져 보인다.
 *
 * 이 모드가 아닌 환경(macOS·리눅스·브라우저)에서는 아무것도 그리지 않는다.
 * 거기서는 원래 제목 표시줄이 그대로 있어서 띠를 두면 빈 공간만 생긴다.
 */
import { useEffect, useState } from 'react';

/** 창 조작 버튼이 화면 위에 떠 있는 모드인가 */
function hasWindowControlsOverlay(): boolean {
  if (typeof navigator === 'undefined') return false;
  const wco = (navigator as Navigator & { windowControlsOverlay?: { visible: boolean } })
    .windowControlsOverlay;
  return wco?.visible === true;
}

export function WindowDragStrip() {
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
      className="shrink-0"
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
