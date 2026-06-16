/**
 * 학교 평가 운영계획에서 루브릭 초안 불러오기 모달.
 *
 * 계획서: docs/01-plan/features/evaluation-rubric-import.plan.md (§6 선택 UI 흐름)
 * 흐름: ① 학교 검색·선택 → ② 학년도/파일 선택(다운로드+파싱) → ③ 학년·과목·학기·평가영역 선택
 *       → 선택한 영역으로 루브릭 초안을 만들어 onImport 로 빌더에 prefill.
 *
 * - 이미지 문서/추출 실패는 원문 보기 폴백(AC4·AC7) — HTML 주입 방지 위해 markdown 을 텍스트로 표시.
 * - 점수는 평가계획에 없으므로 채우지 않는다(§14) — 초안의 배점은 빌더 기본값(교사 입력).
 */
import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import { IconButton } from '@adapters/components/common/IconButton';
import { useToastStore } from '@adapters/components/common/Toast';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { importEvaluationPlan } from '@adapters/di/container';
import { candidateToRubric } from '@domain/services/evaluationPlanMapping';
import { generateUUID } from '@infrastructure/utils/uuid';
import type { Rubric } from '@domain/entities/Rubric';
import type {
  EvaluationPlanDoc,
  EvaluationSchool,
  ParsedEvaluationPlan,
  RubricCandidate,
} from '@domain/entities/EvaluationPlan';

interface RubricImportFromPlanModalProps {
  classId: string;
  /** 수업반 과목 — 파일 검색 기본어 + 과목 기본 선택 */
  classSubject: string;
  onClose: () => void;
  /** 선택한 채점기준표로 만든 루브릭 초안 — 부모가 빌더에 prefill */
  onImport: (draft: Rubric) => void;
}

type Step = 'school' | 'docs' | 'review';

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];

export function RubricImportFromPlanModal({
  classId,
  classSubject,
  onClose,
  onImport,
}: RubricImportFromPlanModalProps) {
  const showToast = useToastStore((s) => s.show);

  // ②-B: 온보딩/설정에서 학교알리미 식별자(shlIdfCd)를 미리 확보해 뒀으면
  // 학교 검색 단계를 건너뛰고 바로 연도/파일 목록으로 시작한다(없으면 기존 수동검색).
  const savedSchoolInfo = useSettingsStore((s) => s.settings.schoolInfo);
  const prefilledSchool: EvaluationSchool | null = savedSchoolInfo?.shlIdfCd
    ? {
        shlIdfCd: savedSchoolInfo.shlIdfCd,
        name: savedSchoolInfo.matchedName,
        address: '',
        kind: '',
      }
    : null;

  const [step, setStep] = useState<Step>(prefilledSchool ? 'docs' : 'school');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ① 학교
  const [schoolQuery, setSchoolQuery] = useState('');
  const [schools, setSchools] = useState<readonly EvaluationSchool[]>([]);
  const [school, setSchool] = useState<EvaluationSchool | null>(prefilledSchool);

  // ② 문서
  const [year, setYear] = useState(CURRENT_YEAR);
  const [docs, setDocs] = useState<readonly EvaluationPlanDoc[]>([]);
  const [docSearch, setDocSearch] = useState(classSubject ?? '');

  // ③ 파싱 결과 + 선택 (과목 → 수행평가 과제(후보) → 미리보기)
  const [parsed, setParsed] = useState<ParsedEvaluationPlan | null>(null);
  const [subject, setSubject] = useState('');
  const [candidateIdx, setCandidateIdx] = useState(0);
  // 'select' = 과목·수행평가 과제 고르기, 'preview' = 고른 과제의 채점기준표 미리보기
  const [reviewMode, setReviewMode] = useState<'select' | 'preview'>('select');

  // ②-B 자동 스킵: 저장된 학교(shlIdfCd)가 있으면 첫 진입 시 곧장 평가계획 목록을 불러온다.
  // 목록이 없거나 사용자가 '이전'을 누르면 학교 검색('school' 단계)으로 폴백한다(차단 없음).
  useEffect(() => {
    if (prefilledSchool) void loadDocs(prefilledSchool, CURRENT_YEAR);
    // 최초 1회만 — 이후엔 사용자가 직접 학교/연도를 조작한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── ① 학교 검색 ── */
  async function handleSearchSchools() {
    const q = schoolQuery.trim();
    if (q.length < 2) {
      setError('학교 이름을 2글자 이상 입력해 주세요.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const hits = await importEvaluationPlan.searchSchools(q);
      setSchools(hits);
      if (hits.length === 0) setError('검색 결과가 없어요. 학교 이름을 다시 확인해 주세요.');
    } catch (e) {
      setError(e instanceof Error ? e.message : '학교 검색에 실패했어요.');
    } finally {
      setBusy(false);
    }
  }

  async function pickSchool(s: EvaluationSchool) {
    setSchool(s);
    setStep('docs');
    await loadDocs(s, year);
  }

  /* ── ② 문서 목록 ── */
  async function loadDocs(s: EvaluationSchool, y: number) {
    setBusy(true);
    setError(null);
    setDocs([]);
    try {
      const list = await importEvaluationPlan.listDocs(s.shlIdfCd, s.name, y);
      setDocs(list);
      if (list.length === 0)
        setError(`${y}년도 평가계획 파일을 찾지 못했어요. 다른 연도를 골라보세요.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '평가계획 목록을 불러오지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  async function changeYear(y: number) {
    setYear(y);
    if (school) await loadDocs(school, y);
  }

  async function pickDoc(doc: EvaluationPlanDoc) {
    if (!school) return;
    setBusy(true);
    setError(null);
    try {
      const result = await importEvaluationPlan.downloadAndParse(
        school.shlIdfCd,
        school.name,
        year,
        doc,
        school.kind,
      );
      setParsed(result);
      // 기본 선택: 수업반 과목과 매칭되는 과목 우선. 과제 선택 단계(select)부터 시작.
      const subs = distinctSubjects(result.candidates);
      setSubject(pickDefaultSubject(subs, classSubject));
      setCandidateIdx(0);
      setReviewMode('select');
      setStep('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : '파일을 불러오지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  const filteredDocs = useMemo(() => {
    const q = docSearch.trim().replace(/\s/g, '');
    if (q.length === 0) return docs;
    return docs.filter((d) => d.filename.replace(/\s/g, '').includes(q));
  }, [docs, docSearch]);

  /* ── ③ 과목 → 수행평가 항목(후보) → 루브릭 ── */
  const candidates = useMemo(() => parsed?.candidates ?? [], [parsed]);
  const subjects = useMemo(() => distinctSubjects(candidates), [candidates]);
  const subjectCandidates = useMemo(
    () => candidates.filter((c) => (c.subject ?? '과목 미상') === subject),
    [candidates, subject],
  );
  const selectedCandidate: RubricCandidate | undefined = subjectCandidates[candidateIdx];

  function selectSubject(subj: string) {
    setSubject(subj);
    setCandidateIdx(0);
    setReviewMode('select');
  }

  /** 수행평가 과제 선택 → 그 과제의 채점기준표 미리보기로 이동 */
  function pickTask(i: number) {
    setCandidateIdx(i);
    setReviewMode('preview');
  }

  function handleImport() {
    if (!selectedCandidate) return;
    const rubric = candidateToRubric(
      selectedCandidate,
      classId,
      generateUUID,
      new Date().toISOString(),
    );
    onImport(rubric);
  }

  const showViewerFallback = parsed !== null && (parsed.needsOcr || candidates.length === 0);

  return (
    <Modal isOpen onClose={onClose} title="평가계획에서 불러오기" srOnlyTitle size="lg">
      <div className="flex flex-col flex-1 min-h-0 max-h-[80vh]">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-sp-border shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-sp-text flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-sp-accent">
                cloud_download
              </span>
              평가계획에서 불러오기
            </h3>
            <p className="text-xs text-sp-muted mt-0.5 truncate">
              {step === 'school' && '학교를 검색해 평가 운영계획 파일을 가져옵니다'}
              {step === 'docs' && school && `${school.name} · ${year}년도 평가계획`}
              {step === 'review' && parsed && parsed.filename}
            </p>
          </div>
          <IconButton icon="close" label="닫기" variant="ghost" size="sm" onClick={onClose} />
        </div>

        {/* 본문 */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3">
          {error !== null && (
            <div className="rounded-lg bg-red-500/10 border border-red-400/30 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}

          {/* ① 학교 검색 */}
          {step === 'school' && (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-sp-muted leading-relaxed">
                학교알리미에 공시된 우리 학교 평가 운영계획을 자동으로 찾아 평가영역을 루브릭
                초안으로 채워줘요. (데이터 출처: 학교알리미 · 공공누리 제1유형)
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={schoolQuery}
                  onChange={(e) => setSchoolQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleSearchSchools();
                  }}
                  placeholder="학교 이름 (예: 한울중학교)"
                  aria-label="학교 이름 검색"
                  className="flex-1 min-w-0 bg-sp-card border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted outline-none focus:border-sp-accent transition-colors"
                />
                <button
                  type="button"
                  onClick={() => void handleSearchSchools()}
                  disabled={busy}
                  className="px-4 py-2 bg-sp-accent text-white rounded-lg hover:brightness-110 text-sm font-medium disabled:opacity-40 transition-all shrink-0"
                >
                  {busy ? '검색 중...' : '검색'}
                </button>
              </div>
              <div className="flex flex-col gap-2">
                {schools.map((s) => (
                  <button
                    key={s.shlIdfCd}
                    type="button"
                    onClick={() => void pickSchool(s)}
                    disabled={busy}
                    className="text-left px-3 py-2.5 rounded-lg bg-sp-surface border border-sp-border hover:border-sp-accent transition-colors disabled:opacity-40"
                  >
                    <p className="text-sm text-sp-text font-medium">{s.name}</p>
                    <p className="text-xs text-sp-muted mt-0.5 truncate">
                      {[s.kind, s.address].filter((x) => x.length > 0).join(' · ')}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ② 연도 + 파일 목록 */}
          {step === 'docs' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-xs text-sp-muted">학년도</label>
                <select
                  value={year}
                  onChange={(e) => void changeYear(Number(e.target.value))}
                  disabled={busy}
                  className="bg-sp-card border border-sp-border rounded-lg px-2.5 py-1.5 text-sm text-sp-text outline-none focus:border-sp-accent"
                >
                  {YEAR_OPTIONS.map((y) => (
                    <option key={y} value={y}>
                      {y}년
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={docSearch}
                  onChange={(e) => setDocSearch(e.target.value)}
                  placeholder="파일명 검색 (예: 국어)"
                  aria-label="파일명 검색"
                  className="flex-1 min-w-[8rem] bg-sp-card border border-sp-border rounded-lg px-3 py-1.5 text-sm text-sp-text placeholder:text-sp-muted outline-none focus:border-sp-accent transition-colors"
                />
              </div>
              {busy ? (
                <p className="text-sm text-sp-muted py-6 text-center">불러오는 중...</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {filteredDocs.map((d) => (
                    <button
                      key={d.seq}
                      type="button"
                      onClick={() => void pickDoc(d)}
                      className="text-left px-3 py-2.5 rounded-lg bg-sp-surface border border-sp-border hover:border-sp-accent transition-colors flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined text-base text-sp-muted shrink-0">
                        description
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-sp-text truncate">{d.filename}</span>
                        {d.sizeKB !== undefined && (
                          <span className="block text-xs text-sp-muted mt-0.5">{d.sizeKB} KB</span>
                        )}
                      </span>
                    </button>
                  ))}
                  {filteredDocs.length === 0 && docs.length > 0 && (
                    <p className="text-xs text-sp-muted py-4 text-center">
                      검색어와 맞는 파일이 없어요.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ③ 파싱 결과: 뷰어 폴백 또는 선택 */}
          {step === 'review' && parsed && (
            <div className="flex flex-col gap-3">
              {showViewerFallback ? (
                <div className="flex flex-col gap-2">
                  <div className="rounded-lg bg-sp-card border border-sp-border border-l-4 border-l-amber-400 px-3 py-2 text-xs text-sp-text">
                    {parsed.needsOcr
                      ? '이미지로 된 문서라 평가영역을 자동으로 읽지 못했어요. 아래 원문을 보고 직접 입력해 주세요.'
                      : '평가영역을 자동으로 찾지 못했어요. 아래 원문을 확인해 주세요.'}
                  </div>
                  <pre className="text-xs text-sp-text bg-sp-card border border-sp-border rounded-lg p-3 max-h-[40vh] overflow-auto whitespace-pre-wrap break-words">
                    {parsed.markdown.slice(0, 20000) || '(표시할 내용이 없습니다)'}
                  </pre>
                </div>
              ) : reviewMode === 'select' ? (
                <>
                  {/* 과목 선택 (직접 선택 — 자동 확정 안 함) */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-sp-muted">과목</span>
                    {subjects.length > 1 ? (
                      <select
                        value={subject}
                        onChange={(e) => selectSubject(e.target.value)}
                        aria-label="과목 선택"
                        className="bg-sp-card border border-sp-border rounded-lg px-2.5 py-1.5 text-sm text-sp-text outline-none focus:border-sp-accent"
                      >
                        {subjects.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-sm font-semibold text-sp-accent">
                        {subject || subjects[0]}
                      </span>
                    )}
                  </div>

                  {/* 수행평가 과제 선택 — 과제마다 채점기준표가 따로 있다 */}
                  <div className="flex flex-col gap-2">
                    <span className="text-xs text-sp-muted">
                      불러올 수행평가 과제를 선택하세요 ({subjectCandidates.length}개)
                    </span>
                    {subjectCandidates.map((c, i) => (
                      <button
                        key={`${c.title}-${i}`}
                        type="button"
                        onClick={() => pickTask(i)}
                        className="text-left px-3 py-2.5 rounded-lg bg-sp-surface border border-sp-border hover:border-sp-accent transition-colors flex items-center gap-2"
                      >
                        <span className="material-symbols-outlined text-base text-sp-muted shrink-0">
                          grading
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-sp-text truncate">{c.title}</span>
                          <span className="block text-caption text-sp-muted mt-0.5">
                            평가요소 {c.criteria.length}개 ·{' '}
                            {c.hasScores ? '배점 포함' : '배점은 직접 입력'}
                          </span>
                        </span>
                        <span className="material-symbols-outlined text-base text-sp-muted shrink-0">
                          chevron_right
                        </span>
                      </button>
                    ))}
                    {subjectCandidates.length === 0 && (
                      <p className="text-xs text-sp-muted py-4 text-center">
                        이 과목에서 가져올 수행평가 과제가 없어요.
                      </p>
                    )}
                  </div>
                </>
              ) : (
                selectedCandidate && (
                  <div className="flex flex-col gap-2">
                    {/* 선택한 과제의 채점기준표 미리보기 */}
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-sp-text">
                        {selectedCandidate.title}
                      </span>
                      <span className="text-caption text-sp-muted">
                        {subject} · 평가요소 {selectedCandidate.criteria.length}개 ·{' '}
                        {selectedCandidate.hasScores ? '배점 포함' : '배점은 직접 입력'}
                      </span>
                    </div>
                    {selectedCandidate.criteria.map((cri, ci) => (
                      <div
                        key={`${cri.name}-${ci}`}
                        className="rounded-lg border border-sp-border bg-sp-surface p-3"
                      >
                        <p className="text-sm font-semibold text-sp-text">{cri.name}</p>
                        <div className="flex flex-col gap-1 mt-1.5">
                          {cri.levels.map((lv, li) => (
                            <div key={li} className="flex items-start gap-2 text-xs">
                              <span className="shrink-0 text-sp-accent font-semibold tabular-nums w-10 text-right">
                                {lv.score}점
                              </span>
                              <span className="text-sp-muted">
                                {lv.description && lv.description.length > 0
                                  ? lv.description
                                  : lv.name}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="p-4 border-t border-sp-border shrink-0 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              setError(null);
              if (step === 'docs') setStep('school');
              else if (step === 'review' && reviewMode === 'preview') setReviewMode('select');
              else if (step === 'review') setStep('docs');
              else onClose();
            }}
            className="px-3 py-2 text-sm text-sp-muted hover:text-sp-text rounded-lg hover:bg-sp-surface transition-colors"
          >
            {step === 'school' ? '취소' : '이전'}
          </button>

          {step === 'review' && reviewMode === 'preview' && !showViewerFallback && (
            <button
              type="button"
              onClick={handleImport}
              disabled={!selectedCandidate}
              className="px-4 py-2 bg-sp-accent text-white rounded-lg hover:brightness-110 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {selectedCandidate
                ? `이 루브릭 불러오기 (평가요소 ${selectedCandidate.criteria.length}개)`
                : '과제를 선택하세요'}
            </button>
          )}
          {step === 'review' && showViewerFallback && (
            <button
              type="button"
              onClick={() => {
                showToast('원문을 참고해 직접 루브릭을 만들어 주세요', 'info');
                onClose();
              }}
              className="px-4 py-2 bg-sp-surface border border-sp-border text-sp-text rounded-lg hover:border-sp-accent text-sm font-medium transition-all"
            >
              닫기
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ──────────────── 기본 선택 헬퍼 ──────────────── */

/** 후보들의 과목 목록(등장 순서, 중복 제거) */
function distinctSubjects(candidates: readonly RubricCandidate[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of candidates) {
    const s = c.subject ?? '과목 미상';
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

/** 수업반 과목과 일치하는 과목 우선, 없으면 첫 과목 */
function pickDefaultSubject(subjects: readonly string[], classSubject: string): string {
  if (subjects.length === 0) return '';
  const norm = (s: string) => s.replace(/\s/g, '');
  const match = subjects.find((s) => norm(s) === norm(classSubject));
  return match ?? subjects[0]!;
}
