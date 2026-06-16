import { useState } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { PageHeader } from '@adapters/components/common/PageHeader';
import { OverviewTab } from './OverviewTab';
import { ActivitiesTab } from './ActivitiesTab';
import { CompareTab } from './CompareTab';
import { ScheduleTab } from './ScheduleTab';
import { EvaluationTab } from './EvaluationTab';

/**
 * 학교 알리미 — 사이드바 최상위 페이지 (쌤도구 동급).
 *
 * 학교알리미 공시(OpenAPI) + NEIS 학사일정 + 평가계획을 탭으로 묶어 보여준다.
 * 계획: docs/01-plan/features/school-announcements.plan.md
 *  - 학교현황/동아리·방과후·상담/옆학교비교: 학교알리미 OpenAPI (SCHOOLINFO_API_KEY)
 *  - 학사일정: NEIS 개방포털 (키 보유) · 평가계획: hwp 스크래핑 (키 불필요)
 */

type TabId = 'overview' | 'activities' | 'compare' | 'schedule' | 'evaluation';

interface TabConfig {
  readonly id: TabId;
  readonly label: string;
  readonly icon: string;
}

const TABS: readonly TabConfig[] = [
  { id: 'overview', label: '학교 현황', icon: 'school' },
  { id: 'activities', label: '동아리·방과후·상담', icon: 'diversity_3' },
  { id: 'compare', label: '옆 학교 비교', icon: 'compare_arrows' },
  { id: 'schedule', label: '학사일정', icon: 'calendar_month' },
  { id: 'evaluation', label: '평가계획', icon: 'grading' },
] as const;

export function SchoolAnnouncementsPage() {
  const { settings } = useSettingsStore();
  const schoolName = settings.neis?.schoolName || settings.schoolName || '';
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  return (
    <div className="-m-8 flex flex-col h-[calc(100%+4rem)]">
      <PageHeader
        icon="campaign"
        iconIsMaterial
        title="학교 알리미"
        sticky
        leftAddon={
          schoolName ? (
            <span className="text-sp-muted text-sm font-sp-medium">{schoolName}</span>
          ) : undefined
        }
      />

      <div className="flex-1 min-h-0 overflow-y-auto p-8">
        {/* 탭 버튼 */}
        <div className="flex flex-wrap gap-2 mb-6" role="tablist" aria-label="학교 알리미 탭">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent ${
                activeTab === tab.id
                  ? 'bg-sp-accent text-white'
                  : 'text-sp-muted hover:text-sp-text hover:bg-sp-text/5'
              }`}
            >
              <span className="material-symbols-outlined text-lg">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* 탭 콘텐츠 */}
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'activities' && <ActivitiesTab />}
        {activeTab === 'compare' && <CompareTab />}
        {activeTab === 'schedule' && <ScheduleTab />}
        {activeTab === 'evaluation' && <EvaluationTab />}
      </div>
    </div>
  );
}
