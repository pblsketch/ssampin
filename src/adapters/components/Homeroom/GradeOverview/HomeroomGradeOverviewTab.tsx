/**
 * 담임 업무 > 학급 성적 살펴보기 (읽기 전용).
 *
 * 계획서: docs/01-plan/features/grade-analysis.plan.md (§7.3, Phase 6)
 * - 담임이 상담·지원에 쓰는 화면. 과목 세부 채점/수정은 하지 않는다(수업 관리 담당).
 * - 데이터는 NEIS 전과목 성적 일람표(xlsx) 가져오기로 채운다. 기관 산출 성취도/석차등급을 그대로 표시.
 * - 학생 점수는 로컬 전용(네트워크 전송 없음). 등급제는 데이터(석차등급 최대값)로 자동 추론.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranscriptStore } from '@adapters/stores/useTranscriptStore';
import { parseTranscriptExcel } from '@adapters/di/container';
import {
  studentTranscriptSummary,
  nearMissSubjects,
  weakSubjects,
} from '@domain/services/transcriptAnalysis';

export function HomeroomGradeOverviewTab() {
  const students = useTranscriptStore((s) => s.students);
  const loaded = useTranscriptStore((s) => s.loaded);
  const load = useTranscriptStore((s) => s.load);
  const importStudents = useTranscriptStore((s) => s.importStudents);
  const clearAll = useTranscriptStore((s) => s.clearAll);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [importMsg, setImportMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const selected = useMemo(() => {
    if (students.length === 0) return null;
    return students.find((s) => s.studentKey === selectedKey) ?? students[0] ?? null;
  }, [students, selectedKey]);

  // 척도는 학급(전과목 일람표) 전체를 보고 결정한다(석차등급 6 이상이 하나라도 있으면 9등급).
  // 선택 학생만 보면 상위 고3 학생이 5등급으로 오분류될 수 있어 전체로 추론.
  const scale: 'rank5' | 'rank9' = useMemo(
    () =>
      students.some((st) => st.subjects.some((s) => (s.rankGrade ?? 0) > 5)) ? 'rank9' : 'rank5',
    [students],
  );

  // 학생별 약점(성취도 D·E) 보유 여부 — 명단에 신호 점 표시용.
  const weakKeys = useMemo(() => {
    const set = new Set<string>();
    for (const st of students) if (weakSubjects(st).length > 0) set.add(st.studentKey);
    return set;
  }, [students]);

  async function handleFile(file: File) {
    setImporting(true);
    setImportMsg(null);
    try {
      const buffer = await file.arrayBuffer();
      const result = await parseTranscriptExcel(buffer);
      if (result.students.length === 0) {
        setImportMsg({
          kind: 'error',
          text: '학생 성적을 인식하지 못했어요. NEIS 전과목 성적 일람표(번호·성명·과목별 원점수/성취도/석차등급)인지 확인해 주세요.',
        });
        return;
      }
      await importStudents(result.students);
      setSelectedKey(result.students[0]?.studentKey ?? null);
      const subjCount = result.students[0]?.subjects.length ?? 0;
      setImportMsg({
        kind: 'ok',
        text: `${result.students.length}명 · 과목 ${subjCount}개를 가져왔어요${result.term ? ` (${result.term})` : ''}.`,
      });
    } catch {
      setImportMsg({
        kind: 'error',
        text: '파일을 읽지 못했어요. 손상되지 않은 .xlsx 파일인지 확인해 주세요.',
      });
    } finally {
      setImporting(false);
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) void handleFile(file);
  }

  function isExcelFile(file: File): boolean {
    return /\.(xlsx|xls)$/i.test(file.name);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!isExcelFile(file)) {
      setImportMsg({ kind: 'error', text: '엑셀(.xlsx) 파일만 가져올 수 있어요.' });
      return;
    }
    void handleFile(file);
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (!dragOver) setDragOver(true);
  }

  function onDragLeave(e: React.DragEvent) {
    // 컨테이너 밖으로 완전히 나갔을 때만 해제
    if (e.currentTarget === e.target) setDragOver(false);
  }

  async function handleClear() {
    await clearAll();
    setSelectedKey(null);
    setImportMsg(null);
  }

  function gotoOffset(delta: number) {
    if (!selected) return;
    const idx = students.findIndex((s) => s.studentKey === selected.studentKey);
    const next = students[idx + delta];
    if (next) setSelectedKey(next.studentKey);
  }

  const hiddenInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept=".xlsx,.xls"
      className="hidden"
      onChange={onFileChange}
    />
  );

  const importButton = (
    <button
      type="button"
      onClick={() => fileInputRef.current?.click()}
      disabled={importing}
      className="flex items-center gap-1.5 bg-sp-accent text-white rounded-md px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-60"
    >
      <span className="material-symbols-outlined text-base">upload_file</span>
      {importing ? '가져오는 중...' : '엑셀 가져오기'}
    </button>
  );

  const messageBanner = importMsg && (
    <div
      className={`rounded-lg px-3 py-2 text-xs border ${
        importMsg.kind === 'ok'
          ? 'bg-green-500/10 border-green-500/30 text-sp-text'
          : 'bg-red-500/10 border-red-500/30 text-sp-text'
      }`}
    >
      {importMsg.text}
    </div>
  );

  /** 드래그앤드롭 오버레이 (영역 위로 파일을 끌어올 때) */
  const dropOverlay = dragOver && (
    <div className="absolute inset-0 z-10 rounded-xl border-2 border-dashed border-sp-accent bg-sp-accent/10 flex items-center justify-center pointer-events-none">
      <p className="text-sp-accent font-semibold text-sm flex items-center gap-2">
        <span className="material-symbols-outlined">download</span>
        여기에 엑셀 파일을 놓으세요
      </p>
    </div>
  );

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-16 text-sp-muted text-sm">
        불러오는 중...
      </div>
    );
  }

  if (students.length === 0 || selected === null) {
    return (
      <div
        className="relative flex flex-col items-center gap-4 mt-8"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {hiddenInput}
        {dropOverlay}
        <div
          className={`bg-sp-card ring-1 rounded-xl px-8 py-10 flex flex-col items-center text-center gap-3 max-w-[28rem] transition-colors ${
            dragOver ? 'ring-2 ring-sp-accent' : 'ring-sp-border'
          }`}
        >
          <span className="material-symbols-outlined text-sp-accent" style={{ fontSize: '32px' }}>
            insights
          </span>
          <h2 className="text-base font-bold text-sp-text">아직 가져온 전과목 성적이 없어요</h2>
          <p className="text-sm text-sp-muted leading-relaxed">
            담임은 다른 교과 점수를 직접 갖지 못하므로, NEIS 전과목 성적 일람표를 내려받아 가져오면
            학생별 성취도·석차·상담 신호를 볼 수 있어요.
          </p>
          {importButton}
          <p className="text-caption text-sp-muted">
            엑셀 파일을 이 영역에 끌어다 놓아도 됩니다. 점수는 이 PC에만 저장되며 외부로 전송되지
            않습니다.
          </p>
        </div>
        {messageBanner}
      </div>
    );
  }

  const summary = studentTranscriptSummary(selected);
  const nearMiss = nearMissSubjects(selected, scale);
  const weak = weakSubjects(selected);
  const distEntries = Object.entries(summary.achievementDistribution).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const selectedIdx = students.findIndex((s) => s.studentKey === selected.studentKey);

  return (
    <div
      className="relative flex flex-col gap-4"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {hiddenInput}
      {dropOverlay}

      {/* 헤더 + 가져오기 */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-bold text-sp-text flex items-center gap-2">
          <span className="material-symbols-outlined text-base">insights</span>학급 성적 살펴보기
          <span className="text-caption font-normal text-sp-muted">· 상담 참고용 (읽기 전용)</span>
        </h3>
        <div className="flex items-center gap-2">
          {importButton}
          <button
            type="button"
            onClick={() => void handleClear()}
            className="flex items-center gap-1 bg-sp-surface border border-sp-border rounded-md px-2.5 py-1.5 text-sp-muted text-sm hover:text-sp-text"
          >
            <span className="material-symbols-outlined text-base">delete</span>지우기
          </button>
        </div>
      </div>

      {messageBanner}

      <div className="bg-sp-highlight/10 border border-sp-highlight/30 rounded-lg px-3 py-2 text-xs text-sp-text/90">
        이 화면은 상담 참고용 읽기 전용입니다. 점수 수정·교과 세부 채점은 수업 관리에서 하세요.
        성취도·석차등급은 기관 산출값이며, 점수는 이 PC에만 저장됩니다.
      </div>

      {/* 본문: 좌측 학생 명단 + 우측 상세 */}
      <div className="flex gap-4 items-start">
        {/* 학생 명단 */}
        <aside className="w-40 shrink-0 bg-sp-card border border-sp-border rounded-xl p-2 max-h-[32rem] overflow-y-auto">
          <p className="text-[11px] text-sp-muted px-2 py-1">학생 {students.length}명</p>
          <ul className="flex flex-col gap-0.5">
            {students.map((s) => {
              const isSel = s.studentKey === selected.studentKey;
              return (
                <li key={s.studentKey}>
                  <button
                    type="button"
                    onClick={() => setSelectedKey(s.studentKey)}
                    aria-current={isSel ? 'true' : undefined}
                    className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-left transition-colors ${
                      isSel
                        ? 'bg-sp-accent/15 text-sp-text font-semibold'
                        : 'text-sp-muted hover:bg-sp-surface hover:text-sp-text'
                    }`}
                  >
                    <span className="text-xs text-sp-muted w-5 shrink-0 text-right">
                      {s.studentKey}
                    </span>
                    <span className="truncate flex-1">{s.studentName}</span>
                    {weakKeys.has(s.studentKey) && (
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0"
                        title="성취도 D·E 과목 있음"
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* 상세 */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          {/* 학생 헤더 + 이전/다음 */}
          <div className="flex items-center justify-between gap-2 bg-sp-card border border-sp-border rounded-xl px-4 py-2.5">
            <div className="min-w-0">
              <p className="text-base font-bold text-sp-text truncate">
                {selected.studentName}
                <span className="text-sp-muted text-xs font-normal ml-2">{selected.term}</span>
              </p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => gotoOffset(-1)}
                disabled={selectedIdx <= 0}
                aria-label="이전 학생"
                className="p-1.5 rounded-lg border border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-surface disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-base">chevron_left</span>
              </button>
              <span className="text-xs text-sp-muted tabular-nums w-12 text-center">
                {selectedIdx + 1} / {students.length}
              </span>
              <button
                type="button"
                onClick={() => gotoOffset(1)}
                disabled={selectedIdx >= students.length - 1}
                aria-label="다음 학생"
                className="p-1.5 rounded-lg border border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-surface disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-base">chevron_right</span>
              </button>
            </div>
          </div>

          {/* 요약 */}
          <div className="bg-sp-card border border-sp-border rounded-xl p-4">
            <p className="text-sm font-semibold text-sp-text mb-2">전과목 요약</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <span className="text-sp-muted">
                과목 <b className="text-sp-text">{summary.subjectCount}</b>
              </span>
              <span className="text-sp-muted">
                석차등급 평균 <b className="text-sp-text">{summary.avgRankGrade ?? '—'}</b>
              </span>
              {distEntries.length > 0 && (
                <span className="flex items-center gap-1.5">
                  {distEntries.map(([grade, count]) => (
                    <span
                      key={grade}
                      className="text-xs px-2 py-0.5 rounded-md bg-sp-surface border border-sp-border text-sp-text"
                    >
                      {grade} {count}
                    </span>
                  ))}
                </span>
              )}
            </div>
          </div>

          {/* 등급 경계 아쉬운 과목 */}
          <div className="bg-sp-card border border-sp-border rounded-xl p-4">
            <p className="text-sm font-semibold text-sp-text mb-1">조금만 더 올리면 되는 과목</p>
            <p className="text-xs text-sp-muted mb-2">
              석차에서 표시된 인원만큼만 더 앞서면 석차등급이 한 단계 오릅니다 (석차{' '}
              {scale === 'rank9' ? '9' : '5'}등급 기준 · 가까운 순).
            </p>
            {nearMiss.length === 0 ? (
              <p className="text-xs text-sp-muted">경계에 가까운 과목이 없어요.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {nearMiss.map((m) => (
                  <div key={m.subject} className="flex items-center justify-between text-sm">
                    <span className="text-sp-text">{m.subject}</span>
                    <span className="text-sp-muted">
                      현재 {m.rankGrade}등급 → <b className="text-sp-accent">{m.peopleToNext}명</b>
                      만 앞서면 <b className="text-sp-text">{m.rankGrade - 1}등급</b>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 취약 과목 신호 */}
          <div className="bg-sp-card border border-sp-border rounded-xl p-4">
            <p className="text-sm font-semibold text-sp-text mb-2">지원 필요 신호 (성취도 D·E)</p>
            {weak.length === 0 ? (
              <p className="text-xs text-sp-muted">성취도 D·E 과목이 없어요.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {weak.map((w) => (
                  <span
                    key={w.subject}
                    className="text-xs px-2 py-1 rounded-md bg-red-500/10 border border-red-500/30 text-sp-text"
                  >
                    {w.subject} {w.achievement}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 과목별 표 */}
          <div className="bg-sp-card border border-sp-border rounded-xl p-4">
            <p className="text-sm font-semibold text-sp-text mb-2">과목별 성적</p>
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-sp-card">
                  <tr className="text-sp-muted text-xs border-b border-sp-border">
                    <th className="text-left py-1.5">과목</th>
                    <th className="text-right py-1.5 w-20">원점수</th>
                    <th className="text-right py-1.5 w-16">성취도</th>
                    <th className="text-right py-1.5 w-20">석차등급</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.subjects.map((row) => (
                    <tr key={row.subject} className="border-b border-sp-border/50">
                      <td className="py-1 text-sp-text">{row.subject}</td>
                      <td className="py-1 text-right text-sp-text">{row.rawScore ?? '—'}</td>
                      <td className="py-1 text-right text-sp-text">{row.achievement ?? '—'}</td>
                      <td className="py-1 text-right text-sp-text">{row.rankGrade ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
