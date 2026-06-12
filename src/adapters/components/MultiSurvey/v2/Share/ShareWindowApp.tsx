/**
 * ShareWindowApp — MultiSurvey v2 교실 화면(Share view) BrowserWindow 루트 컴포넌트.
 *
 * App.tsx에서 ?mode=msShare 쿼리 파라미터 감지 시 렌더링된다.
 * 별도 BrowserWindow에서 동작하므로 Zustand store의 liveSession은 null —
 * 모든 데이터는 IPC 스냅샷(useShareSnapshot)으로 수신한다.
 *
 * - useThemeApplier: sp-* CSS 토큰 적용 필수 (없으면 색상 미표시)
 * - store import 금지: useSettingsStore / useModalCoordinatorStore 절대 금지
 * - cursor-none: 교실 모니터에 마우스 포인터 노출 방지
 */

import { useThemeApplier } from '@adapters/hooks/useThemeApplier';
import { ClassroomShareView } from './ClassroomShareView';
import { useShareSnapshot } from './useShareSnapshot';

export function ShareWindowApp(): JSX.Element {
  useThemeApplier();
  const snapshot = useShareSnapshot();

  if (!snapshot) {
    return (
      <main
        className="flex h-screen w-screen cursor-none items-center justify-center bg-sp-bg text-sp-text"
        aria-label="교실 모니터 대기"
      >
        <div className="flex flex-col items-center gap-6">
          <span className="font-sp-bold text-sp-accent" style={{ fontSize: 64 }}>
            쌤핀
          </span>
          <span className="font-sp-medium text-sp-text" style={{ fontSize: 32 }}>
            교사 콘솔에서 라이브를 시작하세요
          </span>
        </div>
      </main>
    );
  }

  return <ClassroomShareView snapshot={snapshot} entryUrl={snapshot.entryUrl} />;
}
