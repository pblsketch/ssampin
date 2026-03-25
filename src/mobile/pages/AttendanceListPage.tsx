import { useEffect, useState } from 'react';
import { useMobileTeachingClassStore } from '@mobile/stores/useMobileTeachingClassStore';
import { AttendanceCheckPage } from './AttendanceCheckPage';

export function AttendanceListPage() {
  const classes = useMobileTeachingClassStore((s) => s.classes);
  const loaded = useMobileTeachingClassStore((s) => s.loaded);
  const load = useMobileTeachingClassStore((s) => s.load);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="material-symbols-outlined text-sp-accent text-3xl animate-spin">progress_activity</span>
      </div>
    );
  }

  // 수업반 선택됨 → 출결 체크 페이지
  if (selectedClassId) {
    const cls = classes.find((c) => c.id === selectedClassId);
    return (
      <div className="flex flex-col h-full">
        <header className="flex items-center gap-3 px-4 py-3 border-b border-sp-border/30">
          <button onClick={() => setSelectedClassId(null)} className="text-sp-muted active:scale-95 transition-transform">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <h2 className="text-base font-bold text-sp-text">{cls?.name ?? ''} 수업 출결</h2>
        </header>
        <div className="flex-1 overflow-auto">
          <AttendanceCheckPage
            classId={selectedClassId}
            className={cls?.name ?? ''}
            period={1}
            type="class"
            onBack={() => setSelectedClassId(null)}
          />
        </div>
      </div>
    );
  }

  // 수업반 목록
  return (
    <div className="flex flex-col h-full">
      <header className="px-4 py-3 border-b border-sp-border/30">
        <h2 className="text-base font-bold text-sp-text">수업 출결 관리</h2>
        <p className="text-xs text-sp-muted mt-0.5">수업반을 선택하세요</p>
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
              onClick={() => setSelectedClassId(cls.id)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl glass-card active:scale-[0.98] transition-transform text-left"
            >
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-sp-accent/15 shrink-0">
                <span className="material-symbols-outlined text-sp-accent">school</span>
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-sp-text">{cls.name}</span>
                <span className="text-xs text-sp-muted ml-2">{cls.subject}</span>
              </div>
              <span className="material-symbols-outlined text-sp-muted text-lg shrink-0">chevron_right</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
