import { useCallback, useEffect, useRef, useState } from 'react';
import { useLeaveGuardStore } from '@adapters/stores/useLeaveGuardStore';
import { HOME_ROUTE, parentOf, parsePath, toPath, type MobileRoute } from './routes';

/** 현재 브라우저 주소(경로+쿼리). */
function currentPath(): string {
  return window.location.pathname + window.location.search;
}

/**
 * history.state 에 심는 깊이. 앱 안에서 쌓은 항목이 있는지 판단하는 데 쓴다.
 * 딥링크로 바로 들어온 첫 화면은 0 이라, 여기서 뒤로가기를 누르면 앱을 벗어난다.
 */
interface HistoryDepth {
  depth: number;
}

function currentDepth(): number {
  const s = window.history.state as HistoryDepth | null;
  return typeof s?.depth === 'number' ? s.depth : 0;
}

export interface RouteApi {
  route: MobileRoute;
  /** 새 화면으로 이동. replace 면 히스토리를 쌓지 않고 현재 항목을 바꾼다. */
  navigate: (next: MobileRoute, opts?: { replace?: boolean }) => void;
  /**
   * 뒤로가기. 앱 안에서 쌓은 히스토리가 있으면 브라우저에 맡기고,
   * 없으면(딥링크 첫 진입) 한 단계 위로 올린다 — 앱이 종료되지 않게.
   */
  goBack: () => void;
}

/**
 * 주소 기반 화면 전환.
 *
 * 기존에는 화면 전환이 전부 useState 였다. 주소가 없으니 안드로이드 하드웨어
 * 뒤로가기가 "돌아갈 데가 없다"고 판단해 앱을 종료시켰다. 이 훅이 화면 상태를
 * 브라우저 히스토리에 실어 그 문제를 없앤다.
 *
 * 배포는 Vercel 정적 호스팅이고 vercel.json 에 `/(.*)` → `/mobile.html` 전면
 * rewrite 가 이미 있어, 딥링크를 새로고침해도 404 가 나지 않는다.
 */
export function useRoute(): RouteApi {
  const [route, setRoute] = useState<MobileRoute>(() => parsePath(currentPath()));
  // 마지막으로 보여 준 주소 — 휴대폰 뒤로 가기를 되돌려 놓고 물을 때 쓴다(ADR-139).
  const shownPathRef = useRef(currentPath());
  // 선생님이 [끄고 이동]을 고른 뒤의 뒤로 가기는 다시 묻지 않는다.
  const bypassGuardRef = useRef(false);

  useEffect(() => {
    const onPop = () => {
      const guarded = !bypassGuardRef.current && useLeaveGuardStore.getState().guards.length > 0;
      bypassGuardRef.current = false;
      if (!guarded) {
        shownPathRef.current = currentPath();
        setRoute(parsePath(currentPath()));
        return;
      }
      // 타이머가 진행 중이다 — 브라우저가 이미 주소를 바꿨으므로 한 칸을 다시 쌓아 되돌려 놓고 묻는다.
      window.history.pushState(
        { depth: currentDepth() + 1 } satisfies HistoryDepth,
        '',
        shownPathRef.current,
      );
      useLeaveGuardStore.getState().requestLeave('navigate', () => {
        bypassGuardRef.current = true;
        window.history.back();
      });
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  /**
   * 딥링크로 하위 화면에 바로 들어온 경우, 그 아래에 홈 항목을 하나 깔아둔다.
   *
   * 링크를 타고 `/more/settings` 로 바로 들어오면 히스토리에 우리 항목이 하나도
   * 없어서, 하드웨어 뒤로가기가 곧장 앱을 벗어난다. 홈을 깔아두면 한 번은 앱 안에서
   * 받아낸다. 홈으로 들어온 경우에는 깔지 않는다 — 홈에서 뒤로가기는 나가는 게 맞다.
   */
  useEffect(() => {
    const initial = parsePath(currentPath());
    if (initial.kind === 'home') return;
    if (currentDepth() > 0) return; // 이미 앱 안에서 쌓인 항목이 있다

    const here = currentPath();
    window.history.replaceState({ depth: 0 } satisfies HistoryDepth, '', toPath(HOME_ROUTE));
    window.history.pushState({ depth: 1 } satisfies HistoryDepth, '', here);
    // 주소·화면은 그대로다. 아래에 홈 한 칸이 생겼을 뿐이다.
  }, []);

  const navigate = useCallback<RouteApi['navigate']>((next, opts) => {
    const path = toPath(next);

    // 같은 주소로 다시 이동하는 것은 히스토리에 쌓지 않는다.
    // (탭을 두 번 눌렀다고 뒤로가기를 두 번 해야 하면 이상하다)
    if (path === currentPath()) {
      setRoute(next);
      return;
    }

    // 타이머가 진행 중이면 떠나기 전에 묻는다(ADR-139).
    useLeaveGuardStore.getState().requestLeave('navigate', () => {
      const nextState: HistoryDepth = {
        depth: opts?.replace ? currentDepth() : currentDepth() + 1,
      };
      if (opts?.replace) {
        window.history.replaceState(nextState, '', path);
      } else {
        window.history.pushState(nextState, '', path);
      }
      shownPathRef.current = path;
      setRoute(next);
    });
  }, []);

  const goBack = useCallback<RouteApi['goBack']>(() => {
    useLeaveGuardStore.getState().requestLeave('navigate', () => {
      if (currentDepth() > 0) {
        // 이미 물었으므로 뒤로 가기 처리에서 다시 묻지 않는다.
        bypassGuardRef.current = true;
        window.history.back();
        return;
      }
      // 딥링크로 바로 들어온 화면. 쌓인 항목이 없으니 브라우저에 맡기면 앱을 벗어난다.
      // 부모 화면으로 바꿔치기해서 앱 안에 머무르게 한다.
      const parent = parentOf(parsePath(currentPath())) ?? HOME_ROUTE;
      const path = toPath(parent);
      window.history.replaceState({ depth: 0 } satisfies HistoryDepth, '', path);
      shownPathRef.current = path;
      setRoute(parent);
    });
  }, []);

  return { route, navigate, goBack };
}
