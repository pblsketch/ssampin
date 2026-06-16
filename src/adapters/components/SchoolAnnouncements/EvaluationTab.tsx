import { useEffect, useState } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { importEvaluationPlan } from '@adapters/di/container';
import { EmptyNotice } from './EmptyNotice';
import type {
  EvaluationPlanDoc,
  EvaluationSchool,
  ParsedEvaluationPlan,
} from '@domain/entities/EvaluationPlan';

/**
 * 학교 알리미 — 평가계획 탭(조회 전용).
 * 기존 평가계획 IPC(importEvaluationPlan: searchSchools→listDocs→downloadAndParse)를
 * 재사용해 학교알리미 공시 수행평가 운영계획을 불러와 원문(markdown)으로 보여준다.
 * 루브릭 변환은 [수업 관리 > 수행평가]의 RubricImportFromPlanModal 담당(중복 구현 안 함).
 */

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];

type Step = 'school' | 'docs' | 'view';

export function EvaluationTab() {
  const savedSchoolInfo = useSettingsStore((s) => s.settings.schoolInfo);
  const neisSchoolName = useSettingsStore((s) => s.settings.neis?.schoolName ?? '');

  const prefilled: EvaluationSchool | null = savedSchoolInfo?.shlIdfCd
    ? {
        shlIdfCd: savedSchoolInfo.shlIdfCd,
        name: savedSchoolInfo.matchedName,
        address: '',
        kind: '',
      }
    : null;

  const isDesktop = typeof window !== 'undefined' && !!window.electronAPI;

  const [step, setStep] = useState<Step>(prefilled ? 'docs' : 'school');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schoolQuery, setSchoolQuery] = useState(neisSchoolName);
  const [schools, setSchools] = useState<readonly EvaluationSchool[]>([]);
  const [school, setSchool] = useState<EvaluationSchool | null>(prefilled);
  const [year, setYear] = useState(CURRENT_YEAR);
  const [docs, setDocs] = useState<readonly EvaluationPlanDoc[]>([]);
  const [parsed, setParsed] = useState<ParsedEvaluationPlan | null>(null);

  async function loadDocs(s: EvaluationSchool, y: number) {
    setBusy(true);
    setError(null);
    setDocs([]);
    try {
      const list = await importEvaluationPlan.listDocs(s.shlIdfCd, s.name, y);
      setDocs(list);
      if (list.length === 0) {
        setError(`${y}년도 평가계획 파일을 찾지 못했어요. 다른 연도를 골라보세요.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '평가계획 목록을 불러오지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (prefilled) void loadDocs(prefilled, CURRENT_YEAR);
    // 최초 1회만 — 저장된 학교(shlIdfCd)가 있으면 검색 단계를 건너뛴다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSearch() {
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
      setStep('view');
    } catch (e) {
      setError(e instanceof Error ? e.message : '파일을 불러오지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  if (!isDesktop) {
    return (
      <EmptyNotice
        icon="desktop_windows"
        text="평가계획 불러오기는 쌤핀 데스크톱 앱에서만 사용할 수 있어요."
      />
    );
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <p className="text-xs text-sp-muted leading-relaxed">
        학교알리미에 공시된 평가 운영계획(수행평가)을 불러와 봅니다. (데이터 출처: 학교알리미 ·
        공공누리 제1유형)
      </p>

      {error !== null && (
        <div className="rounded-lg bg-sp-text/5 border border-sp-border px-3 py-2 text-xs text-sp-text">
          {error}
        </div>
      )}

      {/* 학교 검색 */}
      {step === 'school' && (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={schoolQuery}
              onChange={(e) => setSchoolQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSearch();
              }}
              placeholder="학교 이름 (예: 개포중학교)"
              aria-label="학교 이름 검색"
              className="flex-1 min-w-0 bg-sp-card border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted outline-none focus:border-sp-accent transition-colors"
            />
            <button
              type="button"
              onClick={() => void handleSearch()}
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

      {/* 연도 + 파일 목록 */}
      {step === 'docs' && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {school && <span className="text-sm font-sp-semibold text-sp-text">{school.name}</span>}
            <label className="text-xs text-sp-muted ml-auto">학년도</label>
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
          </div>
          {busy ? (
            <p className="text-sm text-sp-muted py-6 text-center">불러오는 중...</p>
          ) : (
            <div className="flex flex-col gap-2">
              {docs.map((d) => (
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
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setError(null);
              setStep('school');
            }}
            className="self-start text-xs text-sp-muted hover:text-sp-text"
          >
            ← 다른 학교 검색
          </button>
        </div>
      )}

      {/* 원문 보기 */}
      {step === 'view' && parsed && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-sp-semibold text-sp-text truncate">{parsed.filename}</span>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep('docs');
                setParsed(null);
              }}
              className="ml-auto text-xs text-sp-muted hover:text-sp-text"
            >
              ← 파일 목록
            </button>
          </div>
          {parsed.needsOcr && (
            <div className="rounded-lg bg-sp-card border border-sp-border border-l-4 border-l-amber-400 px-3 py-2 text-xs text-sp-text">
              이미지로 된 문서라 글자를 자동으로 읽지 못했어요. 원문을 참고해 주세요.
            </div>
          )}
          <pre className="text-xs text-sp-text bg-sp-card border border-sp-border rounded-lg p-4 max-h-[60vh] overflow-auto whitespace-pre-wrap break-words leading-relaxed">
            {parsed.markdown.slice(0, 50000) || '(표시할 내용이 없습니다)'}
          </pre>
        </div>
      )}
    </div>
  );
}
