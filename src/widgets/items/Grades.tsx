/**
 * 성적 현황 위젯 — 점수 미입력·반영비율 미완성 평가를 한눈에.
 *
 * 계획서: docs/01-plan/features/grade-analysis.plan.md (§7.4)
 * 개인 점수는 표시하지 않는다(집계 수만). 학생 점수는 로컬 전용.
 */
import { useEffect } from 'react';
import { useGradeAnalysisStore } from '@adapters/stores/useGradeAnalysisStore';
import { isWeightComplete } from '@domain/rules/gradeCalculationRules';

function StatRow({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-sp-muted">{label}</span>
      <span className={`text-sm font-bold ${warn ? 'text-sp-highlight' : 'text-sp-text'}`}>
        {value}
      </span>
    </div>
  );
}

export function Grades() {
  const loaded = useGradeAnalysisStore((s) => s.loaded);
  const load = useGradeAnalysisStore((s) => s.load);
  const plans = useGradeAnalysisStore((s) => s.plans);
  const writtenResults = useGradeAnalysisStore((s) => s.writtenResults);
  const performanceResults = useGradeAnalysisStore((s) => s.performanceResults);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const hasResult = (planId: string): boolean =>
    writtenResults.some((r) => r.assessmentId === planId) ||
    performanceResults.some((r) => r.assessmentId === planId);
  const noScoreCount = plans.filter((p) => !hasResult(p.id)).length;

  // 반영비율 미완성 묶음(과목 수업반·학기 단위) 수
  const weightGroups = new Map<string, number[]>();
  for (const p of plans) {
    const key = `${p.teachingClassId}|${p.semester}`;
    const arr = weightGroups.get(key) ?? [];
    arr.push(p.weightPercent);
    weightGroups.set(key, arr);
  }
  let incompleteWeight = 0;
  for (const weights of weightGroups.values()) {
    if (!isWeightComplete(weights)) incompleteWeight += 1;
  }

  return (
    <div className="rounded-xl bg-sp-card p-4 h-full flex flex-col">
      <div className="mb-3 shrink-0">
        <h3 className="text-sm font-bold text-sp-text flex items-center gap-1.5">
          <span>📊</span>성적 현황
        </h3>
      </div>
      {!loaded ? (
        <div className="flex-1 flex items-center justify-center text-sp-muted text-sm">
          불러오는 중...
        </div>
      ) : plans.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-sp-muted gap-1 text-center">
          <p className="text-sm">등록된 평가가 없습니다</p>
          <p className="text-caption">수업 관리 &gt; 성적에서 평가를 추가하세요</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-2">
          <StatRow label="평가 항목" value={`${plans.length}개`} />
          <StatRow label="점수 미입력" value={`${noScoreCount}개`} warn={noScoreCount > 0} />
          <StatRow
            label="반영비율 미완성"
            value={`${incompleteWeight}과목`}
            warn={incompleteWeight > 0}
          />
          <p className="text-caption text-sp-muted mt-auto pt-2">
            개인 점수는 표시하지 않아요 · 로컬 전용
          </p>
        </div>
      )}
    </div>
  );
}
