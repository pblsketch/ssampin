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

/**
 * 정리는 됐지만 아직 되돌리지 않은 항목.
 *
 * 왜 필요한가 — 정리 단계의 `history.back()` 은 **비동기**다. StrictMode(개발 모드)는
 * 마운트 → 정리 → 재마운트를 같은 커밋에서 연달아 도는데, 재마운트의 pushState 가
 * 먼저 실행되고 back() 이 뒤늦게 도착한다. 그러면 이렇게 된다.
 *
 *   push {sheet:1} → back() 예약 → push {sheet:1} → (뒤늦게) popstate
 *   결과: 시트는 열려 있는데 **현재 항목은 시트 이전 것** → 뒤로가기가 화면을 넘겨버린다
 *
 * 그래서 되돌리기를 마이크로태스크로 미루고, 그 사이에 새 시트가 마운트되면
 * **되돌리지 않고 그 항목을 그대로 물려준다**(푸시도 생략). 열려 있는 시트 1개당
 * 항목 1개라는 수지는 그대로 유지된다.
 */
let pendingRelease: OpenSheet | null = null;

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
  pendingRelease = null;
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
 * StrictMode(개발 모드)에서 effect 가 마운트→정리→재마운트로 두 번 도는데, 정리의
 * back() 이 **비동기**라 재마운트가 새 항목을 쌓은 뒤에 도착한다. 방어가 두 겹이다.
 *  - `pendingRelease`: 되돌리기를 한 박자 미뤄, 곧바로 재마운트되면 항목을 물려준다
 *    (푸시 1회로 끝나 "시트는 열렸는데 현재 항목은 시트 이전"이 생기지 않는다)
 *  - `pendingSelfBacks`: 그래도 나간 자체 back 의 popstate 를 사용자 조작으로 오해하지 않는다
 */
export function useSheetBackButton(onClose: () => void, enabled: boolean = true): void {
  // onClose 가 매 렌더 새 함수로 와도 스택 항목을 갈아끼우지 않도록 최신값만 참조한다.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    // `열렸을 때만 렌더되는` 시트는 enabled 를 생략하면 된다. 페이지가 열림 상태를
    // boolean 으로 들고 있는 시트는 그 값을 넘겨야 닫힌 동안 히스토리를 쌓지 않는다.
    if (!enabled) return;
    ensureListener();

    const entry: OpenSheet = { onCloseRef, closedByBackButton: false };
    openSheets.push(entry);

    if (pendingRelease !== null) {
      // 방금 정리된 시트가 아직 되돌려지지 않았다 — 그 항목을 물려받는다.
      // 새로 푸시하면 항목이 하나 더 생기고, 뒤늦게 도착할 back() 이 그걸 도로 까서
      // "시트는 열려 있는데 현재 항목은 시트 이전" 상태가 된다.
      pendingRelease = null;
    } else {
      const state = (window.history.state ?? {}) as Record<string, unknown>;
      // depth 는 그대로 물려준다. 시트가 화면 이동 깊이를 흔들면 goBack 판단이 틀어진다.
      window.history.pushState({ ...state, sheet: openSheets.length }, '', window.location.href);
    }

    return () => {
      openSheets = openSheets.filter((s) => s !== entry);

      // 뒤로가기로 닫혔으면 항목은 이미 사라졌다. 되돌릴 것이 없다.
      if (entry.closedByBackButton) return;

      // 뒤로가기가 아니라 X·바깥클릭·Esc 로 닫힌 경우, 쌓아둔 항목이 그대로 남는다.
      // 비워주지 않으면 다음 뒤로가기가 "아무 일도 안 일어나는" 한 번을 삼킨다.
      // 닫힘 경로가 무엇이든 "푸시 1회 = 백 1회" 수지가 맞아야 한다.
      //
      // 다만 **한 박자 미룬다.** 곧바로 다른 시트가 마운트되면(StrictMode 재마운트,
      // 시트 교체) 위쪽에서 이 항목을 물려받으므로 되돌리면 안 된다.
      pendingRelease = entry;
      queueMicrotask(() => {
        if (pendingRelease !== entry) return; // 물려받았다 — 되돌리지 않는다
        pendingRelease = null;
        pendingSelfBacks += 1;
        window.history.back();
      });
    };
  }, [enabled]);
}
