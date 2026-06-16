import { useState, useCallback, useEffect } from 'react';
import type { CounselingMethod } from '@domain/entities/StudentRecord';
import { HomeroomTabBar, type HomeroomTab } from './HomeroomTabBar';
import { HOMEROOM_OPEN_TAB_EVENT, consumePendingHomeroomTab } from './homeroomTabIntent';
import { RecordsTab } from './Records/RecordsTab';
import { SurveyTab } from './Survey/SurveyTab';
import { AssignmentTab } from './Assignment/AssignmentTab';
import { ConsultationTab } from './Consultation/ConsultationTab';
import { Seating } from '@adapters/components/Seating/Seating';
import { RosterManagementTab } from './RosterManagementTab';
import { PageHeader } from '@adapters/components/common/PageHeader';
import { SampleRosterWarningBanner } from '@adapters/components/common/SampleRosterWarningBanner';
import { useSampleBannerStore } from '@adapters/stores/useSampleBannerStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';

export interface RecordPrefill {
  studentId: string;
  category: string; // 'counseling'
  subcategory: string; // '학부모상담' | '학생상담'
  method?: CounselingMethod;
  date: string;
}

export function HomeroomPage() {
  const [activeTab, setActiveTab] = useState<HomeroomTab>('records');
  const [prefillRecord, setPrefillRecord] = useState<RecordPrefill | null>(null);

  // roster-sample-data-removal Phase 2 — 샘플 의심 배너 노출 판정.
  // 세션 store가 'banner' 결과를 보유하고, 사용자가 3일 안에 닫지 않았으면 표시.
  const bannerShouldShow = useSampleBannerStore((s) => s.shouldShow);
  const dismissedAt = useSettingsStore((s) => s.settings.sampleRosterBannerDismissedAt);
  const showBanner = (() => {
    if (!bannerShouldShow) return false;
    if (!dismissedAt) return true;
    const dismissedMs = new Date(dismissedAt).getTime();
    if (Number.isNaN(dismissedMs)) return true;
    const threeDaysAgoMs = Date.now() - 3 * 24 * 60 * 60 * 1000;
    return dismissedMs < threeDaysAgoMs;
  })();

  const handleWriteRecord = useCallback((prefill: RecordPrefill) => {
    setPrefillRecord(prefill);
    setActiveTab('records');
  }, []);

  // 외부(명령 팔레트·RosterEmptyState CTA 등) → 담임 업무 하위 탭 전환 리스너.
  // - 이미 담임 업무에 떠 있을 때: 이벤트로 즉시 전환(대기열도 비움).
  // - 다른 페이지 → 담임 업무로 막 진입할 때: 마운트 시 대기 요청(consume)으로 보강.
  useEffect(() => {
    const validTabs: readonly HomeroomTab[] = [
      'roster',
      'records',
      'survey',
      'assignment',
      'consultation',
      'seating',
    ];

    // 마운트 직전에 들어온 탭 요청 반영 (이벤트를 놓친 경우 대비)
    const pending = consumePendingHomeroomTab();
    if (pending && validTabs.includes(pending)) {
      setActiveTab(pending);
    }

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      consumePendingHomeroomTab(); // 이벤트로 처리하므로 대기열 비움(stale 방지)
      if (validTabs.includes(detail as HomeroomTab)) {
        setActiveTab(detail as HomeroomTab);
      }
    };
    window.addEventListener(HOMEROOM_OPEN_TAB_EVENT, handler);
    return () => window.removeEventListener(HOMEROOM_OPEN_TAB_EVENT, handler);
  }, []);

  return (
    <div className="h-full flex flex-col -m-8">
      <PageHeader
        icon="school"
        iconIsMaterial
        title="담임 업무"
        rightActions={<HomeroomTabBar activeTab={activeTab} onChange={setActiveTab} />}
      />
      {showBanner && <SampleRosterWarningBanner />}
      <div className="flex-1 min-h-0 p-8 overflow-y-auto">
        {activeTab === 'roster' && <RosterManagementTab />}
        {activeTab === 'records' && (
          <RecordsTab prefill={prefillRecord} onPrefillConsumed={() => setPrefillRecord(null)} />
        )}
        {activeTab === 'survey' && <SurveyTab />}
        {activeTab === 'assignment' && <AssignmentTab />}
        {activeTab === 'consultation' && <ConsultationTab onWriteRecord={handleWriteRecord} />}
        {activeTab === 'seating' && <Seating embedded />}
      </div>
    </div>
  );
}
