import { useRef, useState } from 'react';
import { ClassAttendanceTab } from '@mobile/components/Class/ClassAttendanceTab';
import { ClassProgressTab } from '@mobile/components/Class/ClassProgressTab';

type ClassSubTab = 'attendance' | 'progress';

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
 * 좌우 스와이프(threshold 50px, 가로 우세) 지원.
 */
export function ClassDetailPage({
  classId,
  className,
  onBack,
  initialTab = 'attendance',
}: ClassDetailPageProps) {
  const [activeSubTab, setActiveSubTab] = useState<ClassSubTab>(initialTab);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    if (t) touchStartRef.current = { x: t.clientX, y: t.clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartRef.current;
    if (!start) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    // 수직 스크롤 우선 (UX) — 가로가 세로보다 1.5배 이상일 때만 서브탭 전환
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0 && activeSubTab === 'attendance') setActiveSubTab('progress');
      if (dx > 0 && activeSubTab === 'progress') setActiveSubTab('attendance');
    }
    touchStartRef.current = null;
  };

  return (
    <div className="flex flex-col h-full">
      {/* 학급 헤더 */}
      <header className="glass-header flex items-center gap-3 px-4 py-3 shrink-0">
        <button
          onClick={onBack}
          className="flex items-center justify-center w-10 h-10"
          style={{ minWidth: 44, minHeight: 44 }}
          aria-label="학급 리스트로 돌아가기"
        >
          <span className="material-symbols-outlined text-sp-text">arrow_back</span>
        </button>
        <h2 className="flex-1 text-sp-text font-bold text-base truncate">{className}</h2>
      </header>

      {/* 서브탭 바 */}
      <div
        className="flex border-b border-sp-border shrink-0"
        role="tablist"
        aria-label="학급 서브탭"
      >
        {(['attendance', 'progress'] as const).map((tab) => (
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
            {tab === 'attendance' ? '출결' : '진도'}
          </button>
        ))}
      </div>

      {/* 컨텐츠 슬롯 (스와이프 영역) */}
      <div
        id={`class-panel-${activeSubTab}`}
        role="tabpanel"
        aria-labelledby={`class-tab-${activeSubTab}`}
        className="flex-1 overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {activeSubTab === 'attendance' && (
          <ClassAttendanceTab classId={classId} className={className} />
        )}
        {activeSubTab === 'progress' && (
          <ClassProgressTab classId={classId} className={className} />
        )}
      </div>
    </div>
  );
}
