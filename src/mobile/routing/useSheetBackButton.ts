import { useEffect, useRef, type MutableRefObject } from 'react';

/**
 * 열려 있는 시트 스택. 맨 뒤가 가장 위에 있는 시트다.
 *
 * 시트마다 popstate 리스너를 달지 않고 모듈 하나만 단다. popstate 는 window 전역
 * 브로드캐스트라, 리스너가 여러 개면 "이 뒤로가기는 누가 처리할 것인가"를 각자
 * 판단하게 되어 중첩 시트가 한꺼번에 닫히거나 서로 어긋난다.
 */
interface OpenSheet {
  onCloseRef: MutableRefObject<() => void>;
  /** 뒤로가기로 닫혔는지. 정리 단계에서 히스토리를 되돌릴지 판단하는 데 쓴다. */
  closedByBackButton: boolean;
}

let openSheets: OpenSheet[] = [];

/**
 * 우리가 직접 부른 `history.back()` 이 아직 도착하지 않은 개수.
 *
 * 시트를 X·바깥클릭으로 닫으면 쌓아둔 항목을 되돌리려고 back() 을 부르는데, 그
 * popstate 까지 "사용자가 뒤로가기를 눌렀다"고 처리하면 시트가 하나 더 닫힌다.
 * 우리가 만든 것은 여기서 세었다가 그냥 삼킨다.
 *
 * ⚠️ 이 판단은 **이벤트당 한 번**이어야 한다. 시트마다 리스너를 달면 첫 리스너가
 * 카운터를 깎고 나머지는 삼키지 못해 어긋난다. 그래서 리스너가 하나뿐이다.
 */
let pendingSelfBacks = 0;

let listenerInstalled = false;

function handlePopState(): void {
  if (pendingSelfBacks > 0) {
    pendingSelfBacks -= 1;
    return;
  }
  const top = openSheets[openSheets.length - 1];
  if (!top) return;
  top.closedByBackButton = true;
  // 닫으라고 지시한 순간 더 이상 맨 위가 아니다. 여기서 빼지 않으면 컴포넌트가
  // 실제로 언마운트되기 전에 뒤로가기가 한 번 더 오면 같은 시트를 또 겨냥한다.
  openSheets = openSheets.slice(0, -1);
  top.onCloseRef.current();
}

function ensureListener(): void {
  if (listenerInstalled) return;
  window.addEventListener('popstate', handlePopState);
  listenerInstalled = true;
}

/** 테스트 전용 — 모듈 스택을 초기 상태로 되돌린다. */
export function __resetSheetStackForTest(): void {
  openSheets = [];
  pendingSelfBacks = 0;
}

/**
 * 바텀시트가 열려 있는 동안 히스토리 항목을 하나 쌓아, 뒤로가기가 화면 이동 대신
 * 시트만 닫게 한다.
 *
 * 안드로이드 사용자는 시트를 열고 뒤로가기를 누르면 시트가 닫히기를 기대한다.
 * 이게 없으면 시트는 그대로 있고 뒤쪽 화면이 바뀌어 버린다.
 *
 * 주소는 바꾸지 않는다(같은 URL 로 pushState). 시트는 "어디에 있는가"가 아니라
 * "지금 무엇을 하고 있는가"라서, 주소에 남기면 딥링크·새로고침 때 되살아나
 * 오히려 어색하다.
 *
 * 중첩 시트는 스택의 맨 위 하나만 닫힌다.
 *
 * StrictMode(개발 모드)에서 effect 가 마운트→정리→재마운트로 두 번 도는데,
 * 정리의 back() 이 **비동기**라 재마운트가 새 항목을 쌓은 뒤에 도착한다. 그 popstate 를
 * 사용자 조작으로 오해하면 시트가 열리자마자 닫힌다. pendingSelfBacks 가 그걸 삼킨다.
 */
export function useSheetBackButton(onClose: () => void): void {
  // onClose 가 매 렌더 새 함수로 와도 스택 항목을 갈아끼우지 않도록 최신값만 참조한다.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    ensureListener();

    const entry: OpenSheet = { onCloseRef, closedByBackButton: false };
    openSheets.push(entry);

    const state = (window.history.state ?? {}) as Record<string, unknown>;
    // depth 는 그대로 물려준다. 시트가 화면 이동 깊이를 흔들면 goBack 판단이 틀어진다.
    window.history.pushState({ ...state, sheet: openSheets.length }, '', window.location.href);

    return () => {
      openSheets = openSheets.filter((s) => s !== entry);

      // 뒤로가기가 아니라 X·바깥클릭·Esc 로 닫힌 경우, 쌓아둔 항목이 그대로 남는다.
      // 비워주지 않으면 다음 뒤로가기가 "아무 일도 안 일어나는" 한 번을 삼킨다.
      // 닫힘 경로가 무엇이든 "푸시 1회 = 백 1회" 수지가 맞아야 한다.
      if (!entry.closedByBackButton) {
        pendingSelfBacks += 1;
        window.history.back();
      }
    };
  }, []);
}
