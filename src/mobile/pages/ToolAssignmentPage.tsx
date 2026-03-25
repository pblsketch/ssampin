import { useEffect, useState } from 'react';
import { useMobileAssignmentStore } from '@mobile/stores/useMobileAssignmentStore';
import type { Assignment } from '@domain/entities/Assignment';

interface Props {
  onBack: () => void;
}

function formatDeadline(deadline: string): string {
  const d = new Date(deadline);
  const now = new Date();
  const isPast = d < now;
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours();
  const mins = String(d.getMinutes()).padStart(2, '0');
  return `${isPast ? '마감됨 · ' : ''}${month}/${day} ${hours}:${mins}`;
}

function AssignmentDetail({ assignment, onBack }: { assignment: Assignment; onBack: () => void }) {
  const { submissionStatus, submissions, fetchSubmissions } = useMobileAssignmentStore();

  useEffect(() => {
    void fetchSubmissions(assignment.id, assignment.adminKey);
  }, [assignment.id, assignment.adminKey, fetchSubmissions]);

  const status = submissionStatus[assignment.id];
  const subs = submissions[assignment.id] ?? [];
  const submittedIds = new Set(subs.map((s) => s.studentNumber));

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-sp-border/30">
        <button onClick={onBack} className="text-sp-muted active:scale-95 transition-transform">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-sp-text truncate">{assignment.title}</h2>
          <p className="text-xs text-sp-muted">{assignment.target.name} · {formatDeadline(assignment.deadline)}</p>
        </div>
      </header>

      {/* 제출 현황 요약 */}
      <div className="px-4 py-3 border-b border-sp-border/20">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-sp-accent">{status?.submitted ?? 0}</span>
              <span className="text-sm text-sp-muted">/ {status?.total ?? 0}명 제출</span>
            </div>
            {status && status.total > 0 && (
              <div className="mt-2 h-2 rounded-full bg-sp-border/30 overflow-hidden">
                <div
                  className="h-full rounded-full bg-sp-accent transition-all duration-500"
                  style={{ width: `${Math.round((status.submitted / status.total) * 100)}%` }}
                />
              </div>
            )}
          </div>
          <button
            onClick={() => void fetchSubmissions(assignment.id, assignment.adminKey)}
            className="text-sp-muted active:scale-95 transition-transform p-2"
          >
            <span className={`material-symbols-outlined ${status?.loading ? 'animate-spin' : ''}`}>
              {status?.loading ? 'progress_activity' : 'refresh'}
            </span>
          </button>
        </div>
      </div>

      {/* 학생 목록 */}
      <div className="flex-1 overflow-auto p-4 space-y-1">
        {status?.loading && subs.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <span className="material-symbols-outlined text-sp-accent text-3xl animate-spin">progress_activity</span>
          </div>
        ) : (
          assignment.target.students
            .slice()
            .sort((a, b) => a.number - b.number)
            .map((student) => {
              const sub = subs.find((s) => s.studentNumber === student.number);
              const isSubmitted = submittedIds.has(student.number);
              return (
                <div
                  key={student.id}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${
                    isSubmitted ? 'bg-green-500/5' : 'bg-red-500/5'
                  }`}
                >
                  <span className={`material-symbols-outlined text-lg ${
                    isSubmitted ? 'text-green-500' : 'text-red-400'
                  }`}>
                    {isSubmitted ? 'check_circle' : 'cancel'}
                  </span>
                  <span className="text-xs text-sp-muted w-6 text-right">{student.number}</span>
                  <span className="text-sm text-sp-text flex-1">{student.name}</span>
                  {sub && (
                    <span className="text-xs text-sp-muted">
                      {sub.isLate && <span className="text-yellow-500 mr-1">지각</span>}
                      {new Date(sub.submittedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              );
            })
        )}
      </div>
    </div>
  );
}

export function ToolAssignmentPage({ onBack }: Props) {
  const { assignments, loaded, load } = useMobileAssignmentStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const selected = selectedId ? assignments.find((a) => a.id === selectedId) : null;
  if (selected) {
    return <AssignmentDetail assignment={selected} onBack={() => setSelectedId(null)} />;
  }

  const activeAssignments = assignments.filter((a) => new Date(a.deadline) >= new Date());
  const pastAssignments = assignments.filter((a) => new Date(a.deadline) < new Date());

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-sp-border/30">
        <button onClick={onBack} className="text-sp-muted active:scale-95 transition-transform">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="text-base font-bold text-sp-text">과제 수합</h2>
      </header>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {assignments.length === 0 ? (
          <div className="text-center py-12">
            <span className="material-symbols-outlined text-sp-muted text-4xl">assignment</span>
            <p className="text-sp-muted text-sm mt-2">등록된 과제가 없습니다</p>
            <p className="text-sp-muted text-xs mt-1">PC 앱에서 과제를 생성한 후 동기화하세요</p>
          </div>
        ) : (
          <>
            {activeAssignments.length > 0 && (
              <section>
                <h3 className="text-xs text-sp-muted font-semibold uppercase tracking-wider mb-2 px-1">
                  진행 중 ({activeAssignments.length})
                </h3>
                <div className="space-y-2">
                  {activeAssignments.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setSelectedId(a.id)}
                      className="w-full glass-card p-4 text-left active:scale-[0.98] transition-transform"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-500/15 shrink-0 mt-0.5">
                          <span className="material-symbols-outlined text-blue-400">assignment</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-sp-text truncate">{a.title}</p>
                          <p className="text-xs text-sp-muted mt-0.5">{a.target.name} · {a.target.students.length}명</p>
                          <p className="text-xs text-sp-muted mt-0.5">{formatDeadline(a.deadline)}</p>
                        </div>
                        <span className="material-symbols-outlined text-sp-muted text-lg shrink-0">chevron_right</span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {pastAssignments.length > 0 && (
              <section>
                <h3 className="text-xs text-sp-muted font-semibold uppercase tracking-wider mb-2 px-1">
                  마감됨 ({pastAssignments.length})
                </h3>
                <div className="space-y-2">
                  {pastAssignments.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setSelectedId(a.id)}
                      className="w-full glass-card p-4 text-left active:scale-[0.98] transition-transform opacity-60"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gray-500/15 shrink-0 mt-0.5">
                          <span className="material-symbols-outlined text-gray-400">assignment_turned_in</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-sp-text truncate">{a.title}</p>
                          <p className="text-xs text-sp-muted mt-0.5">{a.target.name} · {a.target.students.length}명</p>
                          <p className="text-xs text-sp-muted mt-0.5">{formatDeadline(a.deadline)}</p>
                        </div>
                        <span className="material-symbols-outlined text-sp-muted text-lg shrink-0">chevron_right</span>
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
