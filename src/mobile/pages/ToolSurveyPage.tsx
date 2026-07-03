import { useEffect, useState } from 'react';
import { useMobileSurveyToolStore } from '@mobile/stores/useMobileSurveyToolStore';
import { SurveyDetail } from './survey/SurveyDetail';

interface Props {
  onBack: () => void;
}

const COLOR_MAP: Record<string, string> = {
  yellow: 'bg-yellow-500/15 text-yellow-400',
  blue: 'bg-blue-500/15 text-blue-400',
  green: 'bg-green-500/15 text-green-400',
  purple: 'bg-purple-500/15 text-purple-400',
  pink: 'bg-pink-500/15 text-pink-400',
  red: 'bg-red-500/15 text-red-400',
  orange: 'bg-orange-500/15 text-orange-400',
  teal: 'bg-teal-500/15 text-teal-400',
};

function getColorClasses(color: string): string {
  return COLOR_MAP[color] ?? 'bg-sp-accent/15 text-sp-accent';
}

export function ToolSurveyPage({ onBack }: Props) {
  const { surveys, loaded, load } = useMobileSurveyToolStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const selected = selectedId ? surveys.find((s) => s.id === selectedId) : null;
  if (selected) {
    return <SurveyDetail survey={selected} onBack={() => setSelectedId(null)} />;
  }

  const activeSurveys = surveys.filter((s) => !s.isArchived);
  const archivedSurveys = surveys.filter((s) => s.isArchived);

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-sp-border/30">
        <button onClick={onBack} className="text-sp-muted active:scale-95 transition-transform">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="text-base font-bold text-sp-text">설문/체크리스트</h2>
      </header>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {surveys.length === 0 ? (
          <div className="text-center py-12">
            <span className="material-symbols-outlined text-sp-muted text-4xl">poll</span>
            <p className="text-sp-muted text-sm mt-2">등록된 설문이 없습니다</p>
            <p className="text-sp-muted text-xs mt-1">PC 앱에서 설문을 생성한 후 동기화하세요</p>
          </div>
        ) : (
          <>
            {activeSurveys.length > 0 && (
              <section>
                <h3 className="text-xs text-sp-muted font-semibold uppercase tracking-wider mb-2 px-1">
                  진행 중 ({activeSurveys.length})
                </h3>
                <div className="space-y-2">
                  {activeSurveys.map((s) => {
                    const colorCls = getColorClasses(s.categoryColor);
                    const bgCls = colorCls.split(' ')[0] ?? '';
                    const textCls = colorCls.split(' ')[1] ?? '';
                    return (
                      <button
                        key={s.id}
                        onClick={() => setSelectedId(s.id)}
                        className="w-full glass-card p-4 text-left active:scale-[0.98] transition-transform"
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`flex items-center justify-center w-10 h-10 rounded-xl shrink-0 mt-0.5 ${bgCls}`}
                          >
                            <span className={`material-symbols-outlined ${textCls}`}>
                              {s.mode === 'teacher' ? 'checklist' : 'poll'}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-sp-text truncate">{s.title}</p>
                            <p className="text-xs text-sp-muted mt-0.5">
                              {s.mode === 'teacher' ? '교사 체크' : '학생 응답'}
                              {s.questions.length > 0 && ` · ${s.questions.length}문항`}
                            </p>
                            {s.dueDate && (
                              <p className="text-xs text-sp-muted mt-0.5">
                                마감 {new Date(s.dueDate).toLocaleDateString('ko-KR')}
                              </p>
                            )}
                          </div>
                          <span className="material-symbols-outlined text-sp-muted text-lg shrink-0">
                            chevron_right
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {archivedSurveys.length > 0 && (
              <section>
                <h3 className="text-xs text-sp-muted font-semibold uppercase tracking-wider mb-2 px-1">
                  보관됨 ({archivedSurveys.length})
                </h3>
                <div className="space-y-2">
                  {archivedSurveys.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedId(s.id)}
                      className="w-full glass-card p-4 text-left active:scale-[0.98] transition-transform opacity-60"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gray-500/15 shrink-0 mt-0.5">
                          <span className="material-symbols-outlined text-gray-400">
                            inventory_2
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-sp-text truncate">{s.title}</p>
                          <p className="text-xs text-sp-muted mt-0.5">
                            {s.mode === 'teacher' ? '교사 체크' : '학생 응답'} · 보관됨
                          </p>
                        </div>
                        <span className="material-symbols-outlined text-sp-muted text-lg shrink-0">
                          chevron_right
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
