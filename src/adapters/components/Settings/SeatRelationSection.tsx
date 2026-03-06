import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSeatConstraintsStore } from '@adapters/stores/useSeatConstraintsStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import type { SeparationConstraint, AdjacencyConstraint } from '@domain/entities/SeatConstraints';

const SEPARATION_OPTIONS = [
  { value: 1, label: '인접 불가 (거리 1)' },
  { value: 2, label: '한 칸 이상 (거리 2)' },
  { value: 3, label: '두 칸 이상 (거리 3)' },
];

const ADJACENCY_OPTIONS = [
  { value: 1, label: '바로 옆 (거리 1)' },
  { value: 2, label: '한 칸 이내 (거리 2)' },
];

export function SeatRelationSection() {
  const {
    constraints,
    loaded,
    load,
    addSeparation,
    removeSeparation,
    addAdjacency,
    removeAdjacency,
  } = useSeatConstraintsStore();

  const studentsLoaded = useStudentStore((s) => s.loaded);
  const loadStudents = useStudentStore((s) => s.load);
  const activeStudents = useStudentStore((s) => s.activeStudents);

  const students = useMemo(() => activeStudents(), [activeStudents]);

  useEffect(() => {
    if (!loaded) void load();
    if (!studentsLoaded) void loadStudents();
  }, [loaded, load, studentsLoaded, loadStudents]);

  // 분리 조건 폼
  const [sepA, setSepA] = useState('');
  const [sepB, setSepB] = useState('');
  const [sepDist, setSepDist] = useState(1);

  // 인접 조건 폼
  const [adjA, setAdjA] = useState('');
  const [adjB, setAdjB] = useState('');
  const [adjDist, setAdjDist] = useState(1);

  const getStudentName = useCallback(
    (id: string) => {
      const s = students.find((st) => st.id === id);
      return s ? `${s.studentNumber ?? ''}번 ${s.name}` : id;
    },
    [students],
  );

  // 충돌 감지: 같은 쌍이 분리 + 인접 동시 설정
  const conflicts = useMemo(() => {
    const result: string[] = [];
    for (const sep of constraints.separations) {
      for (const adj of constraints.adjacencies) {
        const sameAB =
          (sep.studentA === adj.studentA && sep.studentB === adj.studentB) ||
          (sep.studentA === adj.studentB && sep.studentB === adj.studentA);
        if (sameAB) {
          if (sep.minDistance > adj.maxDistance) {
            result.push(
              `${getStudentName(sep.studentA)} ↔ ${getStudentName(sep.studentB)}: 분리 거리(${sep.minDistance}) > 인접 거리(${adj.maxDistance}) — 동시에 만족할 수 없습니다`,
            );
          } else {
            result.push(
              `${getStudentName(sep.studentA)} ↔ ${getStudentName(sep.studentB)}: 분리와 인접이 동시에 설정되어 있습니다`,
            );
          }
        }
      }
    }
    return result;
  }, [constraints.separations, constraints.adjacencies, getStudentName]);

  const handleAddSeparation = useCallback(async () => {
    if (!sepA || !sepB || sepA === sepB) return;
    const c: SeparationConstraint = {
      studentA: sepA,
      studentB: sepB,
      minDistance: sepDist,
    };
    await addSeparation(c);
    setSepA('');
    setSepB('');
    setSepDist(1);
  }, [sepA, sepB, sepDist, addSeparation]);

  const handleAddAdjacency = useCallback(async () => {
    if (!adjA || !adjB || adjA === adjB) return;
    const c: AdjacencyConstraint = {
      studentA: adjA,
      studentB: adjB,
      maxDistance: adjDist,
    };
    await addAdjacency(c);
    setAdjA('');
    setAdjB('');
    setAdjDist(1);
  }, [adjA, adjB, adjDist, addAdjacency]);

  return (
    <section className="bg-sp-card rounded-xl ring-1 ring-sp-border p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
          <span className="material-symbols-outlined">airline_seat_recline_normal</span>
        </div>
        <h3 className="text-lg font-bold text-sp-text">좌석 관계 설정</h3>
      </div>

      {/* 안내 배너 */}
      <div className="mb-5 px-3 py-2 rounded-lg bg-sp-accent/10 border border-sp-accent/20 text-xs text-sp-accent">
        이 설정은 학생에게 표시되지 않습니다. 자리 바꾸기 시 자동 반영됩니다.
      </div>

      {/* 충돌 경고 */}
      {conflicts.length > 0 && (
        <div className="mb-5 space-y-1">
          {conflicts.map((msg, i) => (
            <div
              key={i}
              className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400"
            >
              ⚠️ {msg}
            </div>
          ))}
        </div>
      )}

      {/* ── 분리 조건 ── */}
      <div className="mb-6">
        <h4 className="text-sm font-semibold text-sp-text mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-base text-red-400">block</span>
          분리 조건
        </h4>

        <div className="space-y-2 mb-3">
          <div className="flex gap-2">
            <select
              value={sepA}
              onChange={(e) => setSepA(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg bg-sp-bg border border-sp-border text-sm text-sp-text"
            >
              <option value="">학생 A</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.studentNumber ?? ''}번 {s.name}
                </option>
              ))}
            </select>
            <select
              value={sepB}
              onChange={(e) => setSepB(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg bg-sp-bg border border-sp-border text-sm text-sp-text"
            >
              <option value="">학생 B</option>
              {students
                .filter((s) => s.id !== sepA)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.studentNumber ?? ''}번 {s.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="flex gap-2">
            <select
              value={sepDist}
              onChange={(e) => setSepDist(Number(e.target.value))}
              className="flex-1 px-3 py-2 rounded-lg bg-sp-bg border border-sp-border text-sm text-sp-text"
            >
              {SEPARATION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button
              onClick={() => void handleAddSeparation()}
              disabled={!sepA || !sepB || sepA === sepB}
              className="px-4 py-2 rounded-lg bg-sp-accent hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
            >
              추가
            </button>
          </div>
        </div>

        {/* 분리 조건 목록 */}
        {constraints.separations.length > 0 ? (
          <div className="space-y-1.5">
            {constraints.separations.map((s) => (
              <div
                key={`${s.studentA}-${s.studentB}`}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-sp-bg border border-sp-border"
              >
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-sp-text">{getStudentName(s.studentA)}</span>
                  <span className="text-red-400 text-xs">↔</span>
                  <span className="text-sp-text">{getStudentName(s.studentB)}</span>
                  <span className="text-sp-muted text-xs">
                    (최소 거리 {s.minDistance})
                  </span>
                </div>
                <button
                  onClick={() => void removeSeparation(s.studentA, s.studentB)}
                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-500/20 text-sp-muted hover:text-red-400 transition-colors"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-sp-muted">분리 조건이 없습니다.</p>
        )}
      </div>

      {/* ── 인접 조건 ── */}
      <div>
        <h4 className="text-sm font-semibold text-sp-text mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-base text-green-400">group</span>
          인접 조건
        </h4>

        <div className="space-y-2 mb-3">
          <div className="flex gap-2">
            <select
              value={adjA}
              onChange={(e) => setAdjA(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg bg-sp-bg border border-sp-border text-sm text-sp-text"
            >
              <option value="">학생 A</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.studentNumber ?? ''}번 {s.name}
                </option>
              ))}
            </select>
            <select
              value={adjB}
              onChange={(e) => setAdjB(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg bg-sp-bg border border-sp-border text-sm text-sp-text"
            >
              <option value="">학생 B</option>
              {students
                .filter((s) => s.id !== adjA)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.studentNumber ?? ''}번 {s.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="flex gap-2">
            <select
              value={adjDist}
              onChange={(e) => setAdjDist(Number(e.target.value))}
              className="flex-1 px-3 py-2 rounded-lg bg-sp-bg border border-sp-border text-sm text-sp-text"
            >
              {ADJACENCY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button
              onClick={() => void handleAddAdjacency()}
              disabled={!adjA || !adjB || adjA === adjB}
              className="px-4 py-2 rounded-lg bg-sp-accent hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
            >
              추가
            </button>
          </div>
        </div>

        {/* 인접 조건 목록 */}
        {constraints.adjacencies.length > 0 ? (
          <div className="space-y-1.5">
            {constraints.adjacencies.map((a) => (
              <div
                key={`${a.studentA}-${a.studentB}`}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-sp-bg border border-sp-border"
              >
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-sp-text">{getStudentName(a.studentA)}</span>
                  <span className="text-green-400 text-xs">↔</span>
                  <span className="text-sp-text">{getStudentName(a.studentB)}</span>
                  <span className="text-sp-muted text-xs">
                    (최대 거리 {a.maxDistance})
                  </span>
                </div>
                <button
                  onClick={() => void removeAdjacency(a.studentA, a.studentB)}
                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-500/20 text-sp-muted hover:text-red-400 transition-colors"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-sp-muted">인접 조건이 없습니다.</p>
        )}
      </div>
    </section>
  );
}
