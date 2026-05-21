/**
 * SampleRosterWarningBanner.tsx
 *
 * useStudentStore.load() 마이그레이션 판정이 `'banner'`(가드 A/B/C 통과 + D 또는 E
 * 실패 = 사용자 데이터와 얽힌 SAMPLE 의심 명단)일 때 메인 컨테이너의 PageHeader
 * 직하에 노출되는 경고 배너.
 *
 * 디자인: docs/02-design/features/roster-sample-data-removal.design.md §3.7 — v1.1
 * - amber(경고) 좌측 stripe + bg-sp-card + ring + rounded-lg
 * - "지금 등록하기" CTA + "✕" 닫기
 * - 닫기 시 settings.sampleRosterBannerDismissedAt 저장 + 세션 store hide()
 * - role="alert"
 *
 * 표시 조건 판정은 호출처(HomeroomPage)에서 useSampleBannerStore.shouldShow + 3일
 * dismissedAt 비교로 처리한다. 이 컴포넌트는 "표시되어야 할 때만" 마운트된다.
 */

import { useCallback } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useSampleBannerStore } from '@adapters/stores/useSampleBannerStore';

/** "지금 등록하기" 클릭 시 사이드바 라우팅으로 [담임 업무] 진입. */
function navigateToRosterManagement(): void {
  window.dispatchEvent(new CustomEvent<string>('ssampin:navigate', { detail: 'homeroom' }));
}

export function SampleRosterWarningBanner(): JSX.Element {
  const update = useSettingsStore((s) => s.update);
  const hideBanner = useSampleBannerStore((s) => s.hide);

  const handleDismiss = useCallback(() => {
    // 1) 세션 store 즉시 hide — UI는 바로 사라진다.
    hideBanner();
    // 2) 영속 저장: 3일 후 자동 재표시 판정 기준이 되는 ISO 타임스탬프.
    void update({ sampleRosterBannerDismissedAt: new Date().toISOString() });
  }, [hideBanner, update]);

  return (
    <div
      role="alert"
      className="flex items-start gap-3 px-4 py-3 rounded-lg bg-sp-card ring-1 ring-sp-border border-l-4 border-l-amber-400 mx-4 mb-3"
    >
      <span
        className="material-symbols-outlined text-amber-400 shrink-0"
        aria-hidden="true"
        style={{ fontSize: '20px' }}
      >
        warning
      </span>

      <p className="flex-1 text-sm text-sp-text leading-relaxed">
        이 명단이 샘플일 가능성이 있어요. 우리 반 명단을 직접 등록하시면 정리됩니다.
      </p>

      <button
        type="button"
        onClick={navigateToRosterManagement}
        className="shrink-0 text-sm font-medium text-sp-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent focus-visible:outline-offset-2 rounded"
      >
        지금 등록하기
      </button>

      <button
        type="button"
        onClick={handleDismiss}
        aria-label="샘플 명단 경고 배너 닫기"
        className="shrink-0 text-sp-muted hover:text-sp-text transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent focus-visible:outline-offset-2 rounded"
      >
        <span className="material-symbols-outlined text-base" aria-hidden="true">
          close
        </span>
      </button>
    </div>
  );
}
