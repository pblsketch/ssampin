import { useState } from 'react';
import { ClassAttendanceTab } from '@mobile/components/Class/ClassAttendanceTab';
import { ClassProgressTab } from '@mobile/components/Class/ClassProgressTab';
import { ClassObservationTab } from '@mobile/components/Class/ClassObservationTab';
import { MobileHeader } from '@mobile/components/common/MobileHeader';

type ClassSubTab = 'attendance' | 'progress' | 'observation';

interface ClassDetailPageProps {
  classId: string;
  className: string;
  onBack: () => void;
  /** 초기 서브탭 (default: 'attendance' — Design §2.1 결정) */
  initialTab?: ClassSubTab;
}

/**
 * 학급 상세 페이지 — 헤더 + [출결][진도] 서브탭 + 컨텐츠 슬롯.
 * Design §3.2.
 *
 * 서브탭 전환은 상단 [출결]/[진도] 탭 버튼 클릭만으로 (좌우 스와이프 제거,
 * PR #48 의 글로벌 스와이프 제거와 일관 — 사용자 요청, 2026-05-14).
 */
export function ClassDetailPage({
  classId,
  className,
  onBack,
  initialTab = 'attendance',
}: ClassDetailPageProps) {
  const [activeSubTab, setActiveSubTab] = useState<ClassSubTab>(initialTab);

  return (
    <div className="flex flex-col h-full">
      {/* 학급 헤더 */}
      <MobileHeader
        variant="fullscreen"
        title={className}
        onBack={onBack}
        backLabel="학급 리스트로 돌아가기"
      />

      {/* 서브탭 바 */}
      <div
        className="flex border-b border-sp-border shrink-0"
        role="tablist"
        aria-label="학급 서브탭"
      >
        {(['attendance', 'progress', 'observation'] as const).map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeSubTab === tab}
            aria-controls={`class-panel-${tab}`}
            id={`class-tab-${tab}`}
            onClick={() => setActiveSubTab(tab)}
            className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeSubTab === tab
                ? 'text-sp-accent border-sp-accent'
                : 'text-sp-muted border-transparent'
            }`}
            style={{ minHeight: 44 }}
          >
            {tab === 'attendance' ? '출결' : tab === 'progress' ? '진도' : '특기사항'}
          </button>
        ))}
      </div>

      {/* 컨텐츠 슬롯 */}
      <div
        id={`class-panel-${activeSubTab}`}
        role="tabpanel"
        aria-labelledby={`class-tab-${activeSubTab}`}
        className="flex-1 overflow-hidden"
      >
        {activeSubTab === 'attendance' && (
          <ClassAttendanceTab classId={classId} className={className} />
        )}
        {activeSubTab === 'progress' && (
          <ClassProgressTab classId={classId} className={className} />
        )}
        {activeSubTab === 'observation' && (
          <ClassObservationTab classId={classId} className={className} />
        )}
      </div>
    </div>
  );
}
