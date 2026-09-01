import { useEffect, useState } from 'react';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { PageHeader } from '@adapters/components/common/PageHeader';
import type { SchoolDisclosureIdentity } from '@domain/services/schoolIdentify';
import { useSchoolIdentity } from './useSchoolDisclosure';
import { SchoolDisclosureProvider } from './SchoolDisclosureContext';
import { SchoolSearchModal } from './SchoolSearchModal';
import { OverviewTab } from './OverviewTab';
import { StaffTab } from './StaffTab';
import { ActivitiesTab } from './ActivitiesTab';
import { CurriculumTab } from './CurriculumTab';
import { CompareTab } from './CompareTab';
import { ScheduleTab } from './ScheduleTab';
import { EvaluationTab } from './EvaluationTab';

/**
 * 학교 알리미 — 쌤도구의 한 도구.
 *
 * 학교알리미 공시(OpenAPI) + NEIS 학사일정 + 평가계획을 탭으로 묶어 보여준다.
 *  - 기본은 우리 학교(설정), '다른 학교 검색'으로 전국 학교 공시도 조회(공시 3탭).
 *  - 학사일정·평가계획 탭은 우리 학교 기준(NEIS/평가계획 IPC).
 */

interface SchoolAnnouncementsPageProps {
  /** 쌤도구로 돌아가기 */
  onBack: () => void;
}

type TabId =
  | 'overview'
  | 'staff'
  | 'activities'
  | 'curriculum'
  | 'compare'
  | 'schedule'
  | 'evaluation';

interface TabConfig {
  readonly id: TabId;
  readonly label: string;
  readonly icon: string;
}

const TABS: readonly TabConfig[] = [
  { id: 'overview', label: '학교 현황', icon: 'school' },
  { id: 'staff', label: '교원·직원', icon: 'badge' },
  { id: 'activities', label: '동아리·방과후·상담', icon: 'diversity_3' },
  { id: 'curriculum', label: '교육과정', icon: 'auto_stories' },
  { id: 'compare', label: '옆 학교 비교', icon: 'compare_arrows' },
  { id: 'schedule', label: '학사일정', icon: 'calendar_month' },
  { id: 'evaluation', label: '평가계획', icon: 'grading' },
] as const;

export function SchoolAnnouncementsPage({ onBack }: SchoolAnnouncementsPageProps) {
  // 화면 방문(page_view)은 잡혔지만 "도구 사용"으로는 세지 않아, 도구 순위에서 통째로
  // 빠져 있었다. 다른 도구와 같은 방식으로 센다(2026-09-01).
  const { track } = useAnalytics();
  useEffect(() => {
    track('tool_use', { tool: 'school-announcements' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { settings } = useSettingsStore();
  const ourIdentity = useSchoolIdentity();
  const [selectedSchool, setSelectedSchool] = useState<SchoolDisclosureIdentity | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const isOtherSchool = selectedSchool !== null;
  const activeIdentity = selectedSchool ?? ourIdentity;
  const displayName =
    activeIdentity?.schoolName || settings.neis?.schoolName || settings.schoolName || '';

  return (
    <SchoolDisclosureProvider value={activeIdentity}>
      <div className="-m-8 flex flex-col h-[calc(100%+4rem)]">
        <PageHeader
          icon="campaign"
          iconIsMaterial
          title="학교 알리미"
          leftAddon={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onBack}
                aria-label="쌤도구로 돌아가기"
                className="flex items-center justify-center w-8 h-8 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-colors"
              >
                <span className="material-symbols-outlined text-icon-md">arrow_back</span>
              </button>
              {displayName && (
                <span className="text-sp-muted text-sm font-sp-medium">
                  {displayName}
                  {isOtherSchool && (
                    <span className="ml-1.5 text-caption text-sp-accent">검색한 학교</span>
                  )}
                </span>
              )}
            </div>
          }
          rightActions={
            <>
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="flex items-center gap-1.5 border border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-surface px-3 xl:px-4 py-2 xl:py-2.5 rounded-xl text-xs xl:text-sm font-sp-semibold transition-all duration-sp-base ease-sp-out active:scale-95"
              >
                <span className="material-symbols-outlined text-icon">search</span>
                <span className="hidden sm:inline">다른 학교 검색</span>
              </button>
              {isOtherSchool && (
                <button
                  type="button"
                  onClick={() => setSelectedSchool(null)}
                  className="flex items-center gap-1.5 border border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-surface px-3 xl:px-4 py-2 xl:py-2.5 rounded-xl text-xs xl:text-sm font-sp-semibold transition-all duration-sp-base ease-sp-out active:scale-95"
                >
                  <span className="material-symbols-outlined text-icon">home</span>
                  <span className="hidden sm:inline">우리 학교로</span>
                </button>
              )}
            </>
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

          {/* 검색한 학교일 때 학사일정·평가계획은 우리 학교 기준임을 안내 */}
          {isOtherSchool && (activeTab === 'schedule' || activeTab === 'evaluation') && (
            <div className="mb-4 rounded-lg bg-sp-card border border-sp-border px-3 py-2 text-xs text-sp-muted">
              이 탭은 우리 학교 기준이에요. 검색한 학교의 정보는 학교 현황·동아리·옆 학교 비교
              탭에서 볼 수 있어요.
            </div>
          )}

          {/* 탭 콘텐츠 */}
          {activeTab === 'overview' && <OverviewTab />}
          {activeTab === 'staff' && <StaffTab />}
          {activeTab === 'activities' && <ActivitiesTab />}
          {activeTab === 'curriculum' && <CurriculumTab />}
          {activeTab === 'compare' && <CompareTab />}
          {activeTab === 'schedule' && <ScheduleTab />}
          {activeTab === 'evaluation' && <EvaluationTab />}
        </div>
      </div>

      {searchOpen && (
        <SchoolSearchModal
          onSelect={(identity) => {
            setSelectedSchool(identity);
            setSearchOpen(false);
            setActiveTab('overview');
          }}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </SchoolDisclosureProvider>
  );
}
