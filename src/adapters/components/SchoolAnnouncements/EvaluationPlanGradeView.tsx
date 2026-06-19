import { useState } from 'react';
import type { ParsedEvaluationPlan } from '@domain/entities/EvaluationPlan';

/**
 * 평가계획 문서를 학년별로 정리해 보여준다.
 * parseEvaluationPlan 이 뽑아낸 grades(학년 → 과목 → 평가영역+반영비율+학기)를 사용하고,
 * 이미지 문서/추출 실패(needsOcr 또는 grades 비어있음)면 원문 markdown 으로 폴백한다.
 */
export function EvaluationPlanGradeView({ parsed }: { parsed: ParsedEvaluationPlan }) {
  const grades = parsed.grades.filter((g) => g.subjects.length > 0);
  const [idx, setIdx] = useState(0);

  // 폴백: 구조화 실패 → 원문
  if (parsed.needsOcr || grades.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <div className="rounded-lg bg-sp-card border border-sp-border border-l-4 border-l-amber-400 px-3 py-2 text-xs text-sp-text">
          {parsed.needsOcr
            ? '이미지로 된 문서라 학년별로 자동 정리하지 못했어요. 아래 원문을 참고해 주세요.'
            : '학년별 구조를 자동으로 읽지 못했어요. 아래 원문을 참고해 주세요.'}
        </div>
        <pre className="text-xs text-sp-text bg-sp-card border border-sp-border rounded-lg p-4 max-h-[60vh] overflow-auto whitespace-pre-wrap break-words leading-relaxed">
          {parsed.markdown.slice(0, 50000) || '(표시할 내용이 없습니다)'}
        </pre>
      </div>
    );
  }

  const grade = grades[Math.min(idx, grades.length - 1)]!;

  return (
    <div className="flex flex-col gap-4">
      {/* 학년 선택 (여러 학년일 때) */}
      {grades.length > 1 && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="학년 선택">
          {grades.map((g, i) => (
            <button
              key={g.label}
              type="button"
              role="tab"
              aria-selected={i === idx}
              onClick={() => setIdx(i)}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent ${
                i === idx
                  ? 'bg-sp-accent text-white'
                  : 'bg-sp-surface text-sp-muted hover:text-sp-text border border-sp-border'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      )}

      {/* 선택 학년의 과목별 평가영역 */}
      <div className="space-y-3">
        {grade.subjects.map((subject) => {
          const areas = grade.areasBySubject[subject] ?? [];
          return (
            <div key={subject} className="rounded-xl border border-sp-border bg-sp-card p-4">
              <h4 className="text-sm font-sp-semibold text-sp-text mb-2.5 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-icon text-sp-accent">book</span>
                {subject}
              </h4>
              {areas.length === 0 ? (
                <p className="text-xs text-sp-muted">평가영역 정보가 없어요.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-sp-border">
                  {areas.map((area, i) => (
                    <li key={`${area.name}-${i}`} className="flex items-center gap-2 py-2 text-sm">
                      <span className="text-sp-text flex-1 min-w-0">{area.name}</span>
                      {area.semester && (
                        <span className="text-caption text-sp-muted shrink-0">
                          {area.semester}학기
                        </span>
                      )}
                      {area.ratio && (
                        <span className="text-caption font-sp-semibold text-sp-accent shrink-0 tabular-nums">
                          {area.ratio}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
