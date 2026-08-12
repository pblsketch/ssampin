import { useCallback, useEffect, useState } from 'react';
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

  useEffect(() => {
    const onPop = () => setRoute(parsePath(currentPath()));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback<RouteApi['navigate']>((next, opts) => {
    const path = toPath(next);

    // 같은 주소로 다시 이동하는 것은 히스토리에 쌓지 않는다.
    // (탭을 두 번 눌렀다고 뒤로가기를 두 번 해야 하면 이상하다)
    if (path === currentPath()) {
      setRoute(next);
      return;
    }

    const nextState: HistoryDepth = {
      depth: opts?.replace ? currentDepth() : currentDepth() + 1,
    };
    if (opts?.replace) {
      window.history.replaceState(nextState, '', path);
    } else {
      window.history.pushState(nextState, '', path);
    }
    setRoute(next);
  }, []);

  const goBack = useCallback<RouteApi['goBack']>(() => {
    if (currentDepth() > 0) {
      window.history.back();
      return;
    }
    // 딥링크로 바로 들어온 화면. 쌓인 항목이 없으니 브라우저에 맡기면 앱을 벗어난다.
    // 부모 화면으로 바꿔치기해서 앱 안에 머무르게 한다.
    const parent = parentOf(parsePath(currentPath())) ?? HOME_ROUTE;
    const path = toPath(parent);
    window.history.replaceState({ depth: 0 } satisfies HistoryDepth, '', path);
    setRoute(parent);
  }, []);

  return { route, navigate, goBack };
}
