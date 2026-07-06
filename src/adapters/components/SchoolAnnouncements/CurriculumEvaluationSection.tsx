import { useEffect, useState } from 'react';
import { importEvaluationPlan } from '@adapters/di/container';
import { extractCurriculumTables } from '@domain/services/curriculumTableExtract';
import { CurriculumMatrixView } from './CurriculumMatrixView';
import { useSelectedSchool } from './SchoolDisclosureContext';

/**
 * 교육과정 탭 — 우리 학교가 학교알리미에 올린 "교육과정 편제표"(학교교육과정 편성·운영 및 평가 항목,
 * b14)를 자동으로 내려받아 학년/학기별 이수단위 매트릭스를 표로 보여준다.
 * hwp 표는 kordoc 변환(HTML 표)을 그대로 CurriculumMatrixView 로 렌더하므로 별도 파싱이 없다.
 */

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];

export function CurriculumEvaluationSection() {
  // 현재 조회 대상 학교(기본=우리 학교, '다른 학교 검색' 시 그 학교)를 따라간다.
  const selected = useSelectedSchool();
  const isDesktop = typeof window !== 'undefined' && !!window.electronAPI;
  const shlIdfCd = selected?.shlIdfCd ?? '';
  const schoolName = selected?.schoolName ?? '';

  const [year, setYear] = useState(CURRENT_YEAR);
  const [filename, setFilename] = useState('');
  const [markdown, setMarkdown] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isDesktop || !shlIdfCd) return;
    let cancelled = false;
    void (async () => {
      setBusy(true);
      setError(null);
      setMarkdown('');
      setFilename('');
      try {
        const docs = await importEvaluationPlan.listDocs(shlIdfCd, schoolName, year, 'curriculum');
        if (cancelled) return;
        // 편제표 파일 우선(목록 정렬상 맨 앞), 없으면 첫 문서
        const target = docs.find((d) => /편제표|교육과정\s*편성/.test(d.filename)) ?? docs[0];
        if (!target) {
          setError(`${year}년도 교육과정 편제표 문서를 찾지 못했어요. 다른 학년도를 골라보세요.`);
          return;
        }
        const res = await importEvaluationPlan.downloadCurriculumDoc(
          shlIdfCd,
          schoolName,
          year,
          target,
        );
        if (cancelled) return;
        setFilename(res.filename);
        // 학교마다 문서 양식이 달라(편제표 단독 vs 운영계획 전체 문서) 편제표 표만 골라낸다.
        const extracted = extractCurriculumTables(res.markdown);
        if (res.needsOcr) {
          setError('이미지로 된 문서라 편제표를 표로 자동 정리하지 못했어요.');
        } else if (!extracted.found) {
          setError('이 문서에서는 편제표 표만 따로 찾지 못해 문서 전체를 보여드려요.');
        } else if (/\.pdf$/i.test(res.filename)) {
          setError('PDF로 올라온 문서라 표 모양이 원본과 조금 다르게 보일 수 있어요.');
        }
        setMarkdown(extracted.markdown);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '교육과정 편제표를 불러오지 못했어요.');
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, shlIdfCd, isDesktop]);

  const heading = (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="material-symbols-outlined text-icon-md text-sp-accent">table_chart</span>
      <h3 className="text-base font-sp-semibold text-sp-text">학년별 교육과정 편제표</h3>
      {isDesktop && shlIdfCd && (
        <>
          <label className="text-xs text-sp-muted ml-auto">학년도</label>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            disabled={busy}
            className="bg-sp-card border border-sp-border rounded-lg px-2.5 py-1.5 text-sm text-sp-text outline-none focus:border-sp-accent disabled:opacity-50"
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
        </>
      )}
    </div>
  );

  if (!isDesktop) {
    return (
      <section className="space-y-2">
        {heading}
        <div className="rounded-xl border border-sp-border bg-sp-card p-4 text-xs text-sp-muted">
          교육과정 편제표는 학교가 올린 문서를 읽어 표로 보여주는데, 이 기능은 쌤핀 데스크톱
          앱에서만 사용할 수 있어요.
        </div>
      </section>
    );
  }

  if (!shlIdfCd) {
    return (
      <section className="space-y-2">
        {heading}
        <div className="rounded-xl border border-sp-border bg-sp-card p-4 text-xs text-sp-muted">
          {selected
            ? '이 학교는 편제표 문서를 불러올 식별 정보가 없어요. 다른 학교를 검색해 보세요.'
            : '교육과정 편제표를 보려면 설정에서 우리 학교를 등록해 주세요.'}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      {heading}
      <p className="text-xs text-sp-muted leading-relaxed">
        이 학교가 학교알리미에 올린 교육과정 편제표(학년/학기별 이수단위)를 그대로 보여드려요.
        (출처: 학교알리미 공시 문서)
      </p>

      {error !== null && (
        <div className="rounded-lg bg-sp-text/5 border border-sp-border px-3 py-2 text-xs text-sp-text">
          {error}
        </div>
      )}

      {busy && <p className="text-sm text-sp-muted py-6 text-center">불러오는 중...</p>}

      {!busy && markdown && (
        <div className="space-y-2">
          {filename && <p className="text-xs text-sp-muted truncate">{filename}</p>}
          <div className="rounded-xl border border-sp-border bg-sp-card p-3">
            <CurriculumMatrixView markdown={markdown} />
          </div>
        </div>
      )}
    </section>
  );
}
