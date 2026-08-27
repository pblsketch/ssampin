/**
 * AttendanceDocumentNoticeBanner.tsx
 *
 * 증빙서류 기본 대상이 '출석인정만' → '출석인정+질병'으로 넓어진 것을 알리는 1회 안내 배너.
 *
 * 왜 필요한가 — 정책은 기록에 저장되지 않고 화면을 열 때마다 계산된다(`requiresDocument`).
 * 그래서 날짜로 끊어 "앞으로 만드는 기록만" 적용할 수 없고, 업데이트 즉시 **과거 질병 출결이
 * 전부 '미제출'로 재계산**된다. 의도된 결과지만 예고 없이 터지면 사고로 보인다.
 * 데이터가 아니라 안내로 푸는 이유가 여기 있다.
 * (설계: docs/02-design/features/attendance-document-discoverability.design.md §4-4)
 *
 * 표시 조건 — 정책을 **한 번도 설정하지 않았고**(`attendanceDocumentPolicy === undefined`)
 * 아직 닫지 않은 경우에만. 직접 설정한 사용자는 기본값 변경의 영향을 받지 않으므로 띄우지 않는다.
 *
 * 디자인 — `SampleRosterWarningBanner`와 같은 언어(색조 면 + 아이콘 칩 + CTA + 닫기).
 * ⚠️ sp-* 토큰에는 Tailwind 투명도 수식(`bg-sp-accent/10`)이 **무효**다(클래스가 생성되지 않아
 * 조용히 투명 렌더). 반투명 배경은 반드시 inline `color-mix`로 만든다.
 */

import { useCallback } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { openSettingsTab } from '@adapters/utils/openSettingsTab';

export function AttendanceDocumentNoticeBanner(): JSX.Element | null {
  const policy = useSettingsStore((s) => s.settings.attendanceDocumentPolicy);
  const dismissedAt = useSettingsStore((s) => s.settings.attendanceDocumentNoticeDismissedAt);
  const update = useSettingsStore((s) => s.update);

  const handleDismiss = useCallback(() => {
    void update({ attendanceDocumentNoticeDismissedAt: new Date().toISOString() });
  }, [update]);

  // 직접 설정한 사용자는 영향 없음 · 이미 닫았으면 다시 띄우지 않는다(1회성).
  if (policy !== undefined || dismissedAt) return null;

  return (
    <div
      role="status"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--sp-accent) 7%, var(--sp-card))',
        borderColor: 'color-mix(in srgb, var(--sp-accent) 22%, transparent)',
      }}
      className="flex items-start gap-3 px-4 py-3 rounded-lg border mb-2"
    >
      <span
        className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center"
        aria-hidden="true"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--sp-accent) 16%, transparent)',
          color: 'color-mix(in srgb, var(--sp-accent) 78%, var(--sp-text))',
        }}
      >
        <span className="material-symbols-outlined text-[16px] leading-none">description</span>
      </span>

      <p className="flex-1 text-sm text-sp-text leading-relaxed">
        이번 업데이트부터 <strong className="font-semibold">질병 출결도 증빙서류 대상</strong>
        이에요. 지난 기록도 함께 다시 계산돼 미제출 건수가 늘어 보일 수 있어요. 학교 방침이 다르면
        설정에서 끄실 수 있습니다.
      </p>

      <button
        type="button"
        onClick={() => openSettingsTab('record-reminder')}
        className="shrink-0 text-sm font-medium text-sp-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent focus-visible:outline-offset-2 rounded"
      >
        설정 열기
      </button>

      <button
        type="button"
        onClick={handleDismiss}
        aria-label="증빙서류 기본값 안내 배너 닫기"
        className="shrink-0 text-sp-muted hover:text-sp-text transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent focus-visible:outline-offset-2 rounded"
      >
        <span className="material-symbols-outlined text-base" aria-hidden="true">
          close
        </span>
      </button>
    </div>
  );
}
