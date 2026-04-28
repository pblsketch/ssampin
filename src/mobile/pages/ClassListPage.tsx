import { useEffect, useState } from 'react';
import { useMobileTeachingClassStore } from '@mobile/stores/useMobileTeachingClassStore';
import { ClassDetailPage } from './ClassDetailPage';

interface SelectedClass {
  classId: string;
  className: string;
}

interface ClassListPageProps {
  /** 상위 메뉴로 복귀 (예: 더보기 진입로 등) — 하단탭 진입 시에는 미전달 */
  onBack?: () => void;
}

/**
 * 모바일 "수업" 탭 진입점.
 * - 학급 리스트 → 학급 카드 탭 → ClassDetailPage([출결][진도] 서브탭) 진입.
 *
 * Plan §3.2 + Design §3.1 — 기존 `AttendanceListPage`에서 rename.
 * 라우팅 컴포넌트만 ClassDetailPage로 교체, 학급 리스트 디자인은 동일 유지.
 */
export function ClassListPage({ onBack }: ClassListPageProps = {}) {
  const classes = useMobileTeachingClassStore((s) => s.classes);
  const loaded = useMobileTeachingClassStore((s) => s.loaded);
  const load = useMobileTeachingClassStore((s) => s.load);
  const [selected, setSelected] = useState<SelectedClass | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="material-symbols-outlined text-sp-accent text-3xl animate-spin">
          progress_activity
        </span>
      </div>
    );
  }

  // 학급 선택됨 → 상세 페이지
  if (selected) {
    return (
      <ClassDetailPage
        classId={selected.classId}
        className={selected.className}
        onBack={() => setSelected(null)}
      />
    );
  }

  // 학급 리스트
  return (
    <div className="flex flex-col h-full">
      <header className="glass-header flex items-center gap-3 px-4 py-3 shrink-0">
        {onBack && (
          <button
            onClick={onBack}
            className="text-sp-muted active:scale-95 transition-transform"
            style={{ minWidth: 44, minHeight: 44, marginLeft: -8 }}
            aria-label="뒤로가기"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-sp-text">수업</h2>
          <p className="text-xs text-sp-muted mt-0.5">수업할 학급을 선택하세요</p>
        </div>
      </header>
      <div className="flex-1 overflow-auto p-4 space-y-2">
        {classes.length === 0 ? (
          <div className="text-center py-12">
            <span className="material-symbols-outlined text-sp-muted text-4xl mb-2">school</span>
            <p className="text-sp-muted text-sm">등록된 수업반이 없습니다</p>
            <p className="text-sp-muted text-xs mt-1">PC 앱에서 수업반을 추가한 후 동기화하세요</p>
          </div>
        ) : (
          classes.map((cls) => (
            <button
              key={cls.id}
              onClick={() => setSelected({ classId: cls.id, className: cls.name })}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl glass-card active:scale-[0.98] transition-transform text-left"
              style={{ minHeight: 56 }}
            >
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sp-accent/15 shrink-0">
                <span className="material-symbols-outlined text-sp-accent">school</span>
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-sp-text">{cls.name}</span>
                <span className="text-xs text-sp-muted ml-2">{cls.subject}</span>
              </div>
              <span className="material-symbols-outlined text-sp-muted text-lg shrink-0">
                chevron_right
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
