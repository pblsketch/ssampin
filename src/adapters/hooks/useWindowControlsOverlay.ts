/**
 * 창 조작 버튼(최소화·최대화·닫기)이 화면 위에 떠 있는 모드인지 알려 준다.
 *
 * 윈도우에서는 제목 표시줄을 없애고 창 버튼만 화면 오른쪽 위에 띄운다(main.ts titleBarStyle).
 * 이때 그 자리에 놓인 화면 요소는 창 버튼 밑에 깔려 눌리지 않는다. 이 값이 true 일 때
 * 그 자리를 비워 두어야 한다.
 *
 * 전체화면으로 바꾸면 창 버튼이 사라지므로 `geometrychange` 를 듣고 다시 판단한다.
 * macOS·리눅스·브라우저에서는 항상 false 다.
 */
import { useEffect, useState } from 'react';

interface WindowControlsOverlayLike {
  readonly visible: boolean;
  addEventListener?: (type: string, cb: () => void) => void;
  removeEventListener?: (type: string, cb: () => void) => void;
}

function getOverlay(): WindowControlsOverlayLike | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { windowControlsOverlay?: WindowControlsOverlayLike })
    .windowControlsOverlay;
}

export function useWindowControlsOverlay(): boolean {
  const [visible, setVisible] = useState(() => getOverlay()?.visible === true);

  useEffect(() => {
    const wco = getOverlay();
    if (!wco?.addEventListener) return;
    const onChange = () => setVisible(wco.visible === true);
    wco.addEventListener('geometrychange', onChange);
    return () => wco.removeEventListener?.('geometrychange', onChange);
  }, []);

  return visible;
}
