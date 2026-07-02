/**
 * 수업 관리 > 성적(평가 관리) 탭 — MVP.
 *
 * 계획서: docs/01-plan/features/grade-analysis.plan.md (§7.1, Phase 3)
 * - 교과 수업반 단위. 명단은 '명렬 관리' 탭의 학생을 재사용(재입력 0).
 * - 지필(정기시험)과 수행평가를 분리. 수행 세부 채점은 '수행평가' 탭(루브릭)에서,
 *   여기서는 반영비율 합산을 위한 점수만 다룬다.
 * - 산출은 '추정(미확정)' — 교사 확인 전 확정 성적으로 사용 금지.
 * - 학생 점수는 로컬 전용(네트워크 전송 없음).
 */
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useGradeAnalysisStore } from '@adapters/stores/useGradeAnalysisStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { isStudentActive } from '@domain/rules/studentActivity';
import { studentKey } from '@domain/entities/TeachingClass';
import type { AssessmentKind, AssessmentPlanItem } from '@domain/entities/GradeAnalysis';
import {
  convertedScore,
  sumConverted,
  totalWeightPercent,
  isWeightComplete,
} from '@domain/rules/gradeCalculationRules';
import { scaleFor, achievementOf, FIXED_CUT5 } from '@domain/rules/gradeStandardRules';
import type { GradeSchoolLevel, Cut5 } from '@domain/rules/gradeStandardRules';
import { parseScoreRows } from '@domain/rules/gradeImportRules';
import type { DetectedGradeColumns, ParsedScoreRow } from '@domain/rules/gradeImportRules';
import { summarizeScores, achievementDistribution } from '@domain/services/gradeAnalysisSummary';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { parseGradeExcel } from '@adapters/di/container';
import { useToastStore } from '@adapters/components/common/Toast';
import { useRubricStore } from '@adapters/stores/useRubricStore';
import { calculateTotal, calculateMaxScore, findGrading } from '@domain/rules/rubricRules';
import { exportGradeSummaryToExcel } from '@infrastructure/export/ExcelExporter';
import { GradeImportMappingModal } from './GradeImportMappingModal';

interface ClassAssessmentManagementTabProps {
  classId: string;
  onGoToRosterTab?: () => void;
  onGoToRubricTab?: () => void;
}

const KIND_LABEL: Record<AssessmentKind, string> = {
  'written-exam': '정기시험(지필)',
  performance: '수행평가',
};

/** 성취도 분할 방식: 고정분할(90/80/70/60) vs 추정분할(단위학교 산출 컷 직접 입력). */
type CutMode = 'fixed' | 'custom';
interface CutSetting {
  readonly mode: CutMode;
  /** 추정분할용 직접 입력 컷(원점수 이상). */
  readonly cut: Cut5;
}

const CUT_STORAGE_KEY = 'ssampin:grade-cut-settings-v1';

/** 반·학기별 분할 설정을 로컬에 보관(경량 — 도메인 entity 미오염). */
function loadCutSettings(): Record<string, CutSetting> {
  try {
    const raw = localStorage.getItem(CUT_STORAGE_KEY);
    if (raw === null) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed !== null && typeof parsed === 'object'
      ? (parsed as Record<string, CutSetting>)
      : {};
  } catch {
    return {};
  }
}

function saveCutSettings(all: Record<string, CutSetting>): void {
  try {
    localStorage.setItem(CUT_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // 저장 실패는 무시(시크릿 모드 등).
  }
}

/** 성적 확정 표시(반·학기별, 로컬). confirmedAt 있으면 확정. */
const CONFIRM_STORAGE_KEY = 'ssampin:grade-confirm-v1';

function loadConfirmSettings(): Record<string, { confirmedAt: string }> {
  try {
    const raw = localStorage.getItem(CONFIRM_STORAGE_KEY);
    if (raw === null) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed !== null && typeof parsed === 'object'
      ? (parsed as Record<string, { confirmedAt: string }>)
      : {};
  } catch {
    return {};
  }
}

function saveConfirmSettings(all: Record<string, { confirmedAt: string }>): void {
  try {
    localStorage.setItem(CONFIRM_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // 저장 실패는 무시.
  }
}

/** YYYY-MM-DD (확정 일자 표기). */
function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function ClassAssessmentManagementTab({
  classId,
  onGoToRosterTab,
  onGoToRubricTab,
}: ClassAssessmentManagementTabProps) {
  const loaded = useGradeAnalysisStore((s) => s.loaded);
  const load = useGradeAnalysisStore((s) => s.load);
  const plans = useGradeAnalysisStore((s) => s.plans);
  const writtenResults = useGradeAnalysisStore((s) => s.writtenResults);
  const performanceResults = useGradeAnalysisStore((s) => s.performanceResults);
  const upsertPlan = useGradeAnalysisStore((s) => s.upsertPlan);
  const removePlan = useGradeAnalysisStore((s) => s.removePlan);
  const setWrittenScore = useGradeAnalysisStore((s) => s.setWrittenScore);
  const setPerformanceScore = useGradeAnalysisStore((s) => s.setPerformanceScore);

  const classes = useTeachingClassStore((s) => s.classes);

  const [semester, setSemester] = useState<'1' | '2'>('1');
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<AssessmentKind>('written-exam');
  const [fullScore, setFullScore] = useState(100);
  const [weightPercent, setWeightPercent] = useState(30);
  const [cutSettingsAll, setCutSettingsAll] = useState<Record<string, CutSetting>>(loadCutSettings);
  const [confirmAll, setConfirmAll] =
    useState<Record<string, { confirmedAt: string }>>(loadConfirmSettings);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const currentClass = useMemo(() => classes.find((c) => c.id === classId), [classes, classId]);
  const students = useMemo(
    () => (currentClass?.students ?? []).filter(isStudentActive),
    [currentClass],
  );
  const classPlans = useMemo(
    () => plans.filter((p) => p.teachingClassId === classId && p.semester === semester),
    [plans, classId, semester],
  );
  const selectedPlan = useMemo(
    () => classPlans.find((p) => p.id === selectedPlanId) ?? null,
    [classPlans, selectedPlanId],
  );

  const weightSum = totalWeightPercent(classPlans.map((p) => p.weightPercent));
  const weightOk = isWeightComplete(classPlans.map((p) => p.weightPercent));

  // 성취도 분할 방식(반·학기별). 기본 고정분할. 추정분할이면 직접 입력 컷 사용.
  const cutKey = `${classId}:${semester}`;
  const cutSetting: CutSetting = cutSettingsAll[cutKey] ?? { mode: 'fixed', cut: FIXED_CUT5 };
  const activeCut: Cut5 = cutSetting.mode === 'custom' ? cutSetting.cut : FIXED_CUT5;
  const cutDescending =
    activeCut.A > activeCut.B && activeCut.B > activeCut.C && activeCut.C > activeCut.D;

  function updateCutSetting(patch: Partial<CutSetting>) {
    setCutSettingsAll((prev) => {
      const cur = prev[cutKey] ?? { mode: 'fixed' as CutMode, cut: FIXED_CUT5 };
      const next = { ...prev, [cutKey]: { ...cur, ...patch } };
      saveCutSettings(next);
      return next;
    });
  }

  function setCutField(field: keyof Cut5, value: number) {
    const cur = cutSettingsAll[cutKey] ?? { mode: 'custom' as CutMode, cut: FIXED_CUT5 };
    updateCutSetting({ mode: 'custom', cut: { ...cur.cut, [field]: value } });
  }

  // 분할 라벨(표시·내보내기용) + 확정 상태(반·학기별).
  const cutLabel =
    cutSetting.mode === 'custom'
      ? `추정분할 ${activeCut.A}/${activeCut.B}/${activeCut.C}/${activeCut.D}`
      : '고정분할 90/80/70/60';
  const confirmedAt = confirmAll[cutKey]?.confirmedAt;

  function toggleConfirm() {
    setConfirmAll((prev) => {
      const next = { ...prev };
      if (next[cutKey] !== undefined) delete next[cutKey];
      else next[cutKey] = { confirmedAt: todayStr() };
      saveConfirmSettings(next);
      return next;
    });
  }

  async function saveExcelFile(buffer: ArrayBuffer, fileName: string) {
    if (window.electronAPI) {
      const saved = await window.electronAPI.showSaveDialog({
        title: '성적 요약 내보내기',
        defaultPath: fileName,
        filters: [{ name: 'Excel 파일', extensions: ['xlsx'] }],
      });
      if (saved) {
        await window.electronAPI.writeFile(saved.handle, buffer);
        showToast('요약 파일이 저장되었어요.', 'success', {
          label: '파일 열기',
          onClick: () => window.electronAPI?.openFile(saved.handle),
        });
      }
      return;
    }
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    showToast('요약 파일이 다운로드되었어요.', 'success');
  }

  /** 요약(개인 점수 미포함) 엑셀 내보내기. 통계/분포는 화면 계산값을 그대로 받는다. */
  async function handleExportSummary(
    stats: { count: number; mean: number; stdev: number; min: number; max: number },
    dist: Record<string, number>,
  ) {
    if (exporting || currentClass === undefined) return;
    setExporting(true);
    try {
      const buffer = await exportGradeSummaryToExcel({
        className: `${currentClass.name} ${currentClass.subject}`.trim(),
        semester,
        cutLabel,
        ...(confirmedAt !== undefined ? { confirmedAt } : {}),
        plans: classPlans.map((p) => ({
          title: p.title,
          kind: KIND_LABEL[p.kind],
          fullScore: p.fullScore,
          weightPercent: p.weightPercent,
        })),
        stats,
        distribution: (['A', 'B', 'C', 'D', 'E'] as const).map((g) => ({
          grade: g,
          count: dist[g] ?? 0,
        })),
      });
      await saveExcelFile(buffer, `${currentClass.name}_${semester}학기_성적요약.xlsx`);
    } catch {
      showToast('내보내기 중 오류가 발생했어요.', 'error');
    } finally {
      setExporting(false);
    }
  }

  // 학교급 → 성취도 표시 여부 (초등=성취수준 서술, 정량 성취도 미산출)
  const schoolLevel = useSettingsStore((s) => s.settings.schoolLevel);
  const gradeLevel: GradeSchoolLevel =
    schoolLevel === 'elementary' ? 'elem' : schoolLevel === 'middle' ? 'mid' : 'high';
  const showAchievement = scaleFor(gradeLevel, 1) !== 'none';

  const showToast = useToastStore((s) => s.show);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mappingRows, setMappingRows] = useState<readonly (readonly unknown[])[] | null>(null);

  const rubrics = useRubricStore((s) => s.rubrics);
  const rubricGradings = useRubricStore((s) => s.gradings);
  const rubricLoaded = useRubricStore((s) => s.loaded);
  const loadRubrics = useRubricStore((s) => s.load);
  const [pullRubricId, setPullRubricId] = useState('');

  useEffect(() => {
    if (!rubricLoaded) void loadRubrics();
  }, [rubricLoaded, loadRubrics]);

  function scoreOf(planId: string, key: string, planKind: AssessmentKind): number | null {
    const row =
      planKind === 'written-exam'
        ? writtenResults.find((r) => r.assessmentId === planId && r.studentKey === key)
        : performanceResults.find((r) => r.assessmentId === planId && r.studentKey === key);
    return row?.score ?? null;
  }

  const preview = useMemo(() => {
    return students.map((student) => {
      const key = studentKey(student);
      const converted: number[] = [];
      for (const plan of classPlans) {
        const sc = scoreOf(plan.id, key, plan.kind);
        if (sc !== null) converted.push(convertedScore(sc, plan.fullScore, plan.weightPercent));
      }
      return {
        key,
        name: student.name,
        raw: sumConverted(converted),
        counted: converted.length,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, classPlans, writtenResults, performanceResults]);

  async function handleSavePlan() {
    const trimmed = title.trim();
    if (trimmed.length === 0) return;
    await upsertPlan(
      {
        teachingClassId: classId,
        semester,
        subject: currentClass?.subject ?? '',
        title: trimmed,
        kind,
        areaName: trimmed,
        fullScore,
        weightPercent,
      },
      editingPlanId ?? undefined, // id 있으면 수정, 없으면 신규
    );
    setTitle('');
    setEditingPlanId(null);
    setShowAdd(false);
  }

  /** 새 평가 추가 폼 열기(편집 상태·입력값 초기화). */
  function openAddForm() {
    if (showAdd && editingPlanId === null) {
      setShowAdd(false);
      return;
    }
    setEditingPlanId(null);
    setTitle('');
    setKind('written-exam');
    setFullScore(100);
    setWeightPercent(30);
    setShowAdd(true);
  }

  /** 기존 평가 편집 — 폼에 현재 값을 채워 연다. */
  function startEditPlan(plan: AssessmentPlanItem) {
    setEditingPlanId(plan.id);
    setTitle(plan.title);
    setKind(plan.kind);
    setFullScore(plan.fullScore);
    setWeightPercent(plan.weightPercent);
    setShowAdd(true);
  }

  function cancelPlanForm() {
    setEditingPlanId(null);
    setTitle('');
    setShowAdd(false);
  }

  function handleScoreInput(planId: string, key: string, planKind: AssessmentKind, raw: string) {
    const value = raw.trim() === '' ? null : Number(raw);
    if (value !== null && !Number.isFinite(value)) return;
    if (planKind === 'written-exam') void setWrittenScore(planId, key, value);
    else void setPerformanceScore(planId, key, value);
  }

  async function applyRecords(records: readonly ParsedScoreRow[]): Promise<void> {
    if (selectedPlan === null) return;
    let matched = 0;
    let unmatched = 0;
    for (const rec of records) {
      if (rec.score === null) continue;
      const cleaned = rec.name.replace(/\s/g, '');
      const student = students.find(
        (s) =>
          (rec.number !== null && s.number === rec.number) ||
          (cleaned !== '' && s.name.replace(/\s/g, '') === cleaned),
      );
      if (student !== undefined) {
        await setWrittenScore(selectedPlan.id, studentKey(student), rec.score);
        matched += 1;
      } else {
        unmatched += 1;
      }
    }
    showToast(
      `점수 ${matched}명 가져왔어요${unmatched > 0 ? ` · 미매칭 ${unmatched}명` : ''}.`,
      matched > 0 ? 'success' : 'error',
    );
  }

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file === undefined || selectedPlan === null) return;
    try {
      const buffer = await file.arrayBuffer();
      const result = await parseGradeExcel(buffer);
      if (result.columns === null) {
        if (result.rawRows.length === 0) {
          showToast(
            '엑셀을 읽지 못했어요. 나이스 파일이면 엑셀에서 연 뒤 .xlsx로 다시 저장해 가져와주세요.',
            'error',
          );
          return;
        }
        // 자동 인식 실패 → 수동 컬럼 매핑 모달
        setMappingRows(result.rawRows);
        return;
      }
      await applyRecords(result.records);
    } catch {
      showToast('엑셀을 읽지 못했어요. .xlsx 파일인지 확인해주세요.', 'error');
    }
  }

  function handleManualApply(columns: DetectedGradeColumns): void {
    if (mappingRows !== null) {
      void applyRecords(parseScoreRows(mappingRows, columns));
    }
    setMappingRows(null);
  }

  const classRubrics = rubrics.filter((r) => r.classId === classId);

  async function handlePullFromRubric(): Promise<void> {
    if (selectedPlan === null || pullRubricId === '') return;
    const rubric = classRubrics.find((r) => r.id === pullRubricId);
    if (rubric === undefined) return;
    let matched = 0;
    for (const student of students) {
      const key = studentKey(student);
      const grading = findGrading(rubricGradings, rubric.id, key);
      if (grading === undefined) continue;
      const total = calculateTotal(rubric, grading);
      if (total === null) continue;
      await setPerformanceScore(selectedPlan.id, key, total);
      matched += 1;
    }
    showToast(
      matched > 0
        ? `루브릭 채점 ${matched}명을 수행 점수로 가져왔어요.`
        : '가져올 채점 기록이 없어요.',
      matched > 0 ? 'success' : 'error',
    );
  }

  if (!loaded) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sp-muted text-sm">불러오는 중...</p>
      </div>
    );
  }

  if (students.length === 0) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <h3 className="text-sm font-bold text-sp-text flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-base">analytics</span>성적
        </h3>
        <div className="bg-sp-card ring-1 ring-sp-border rounded-xl px-8 py-10 flex flex-col items-center text-center gap-4 max-w-[26rem] mx-auto mt-8">
          <span className="material-symbols-outlined text-sp-accent" style={{ fontSize: '32px' }}>
            analytics
          </span>
          <h2 className="text-base font-bold text-sp-text">성적을 정리하려면 명단이 필요해요</h2>
          <p className="text-sm text-sp-muted leading-relaxed">
            이 수업반의 학생을 먼저 등록하면 정기시험·수행평가 점수를 모아 성취도를 미리 볼 수
            있어요.
          </p>
          {onGoToRosterTab !== undefined && (
            <button
              type="button"
              onClick={onGoToRosterTab}
              className="bg-sp-accent text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:brightness-110 transition-all active:scale-95"
            >
              명렬 관리 탭으로 이동
            </button>
          )}
        </div>
      </div>
    );
  }

  // 성취도(추정)은 반영비율 100% + 모든 평가 입력 완료 시에만 의미가 있다.
  const fullScores = preview
    .filter(() => classPlans.length > 0)
    .filter((p) => p.counted === classPlans.length)
    .map((p) => p.raw);
  const canShowAchievement = showAchievement && weightOk && fullScores.length > 0;
  const summary = summarizeScores(fullScores);
  const distribution = achievementDistribution(fullScores, activeCut);

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-4">
      {/* 헤더 + 학기 */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-sp-text flex items-center gap-2">
          <span className="material-symbols-outlined text-base">analytics</span>성적
        </h3>
        <div className="flex items-center gap-1 bg-sp-surface border border-sp-border rounded-lg p-0.5">
          {(['1', '2'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSemester(s)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                semester === s ? 'bg-sp-accent text-white' : 'text-sp-muted hover:text-sp-text'
              }`}
            >
              {s}학기
            </button>
          ))}
        </div>
      </div>

      {/* 확정/추정 안내 */}
      {confirmedAt !== undefined ? (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-2 text-xs text-sp-text/90">
          이 성적은 <b>확정</b>되었습니다 ({confirmedAt}). 점수는 이 PC에만 저장되며 외부로 전송되지
          않습니다.
        </div>
      ) : (
        <div className="bg-sp-highlight/10 border border-sp-highlight/30 rounded-lg px-3 py-2 text-xs text-sp-text/90">
          여기 표시되는 성취도·원점수는 <b>추정값</b>입니다. 교사 확인 전에는 확정 성적으로 사용하지
          마세요. 점수는 이 PC에만 저장되며 외부로 전송되지 않습니다.
        </div>
      )}

      {/* 평가 목록 */}
      <div className="bg-sp-card border border-sp-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-sp-text">
            평가 항목 ({classPlans.length})
            <span
              className={`ml-2 text-xs font-normal ${weightOk ? 'text-sp-muted' : 'text-red-400'}`}
            >
              반영비율 합계 {weightSum}%{weightOk ? '' : ' — 100%가 아닙니다'}
            </span>
          </p>
          <button
            type="button"
            onClick={openAddForm}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sp-accent text-white text-xs font-medium hover:brightness-110 transition-all"
          >
            <span className="material-symbols-outlined text-sm">add</span>평가 추가
          </button>
        </div>

        {showAdd && (
          <div className="flex flex-wrap items-end gap-2 mb-3 p-3 bg-sp-surface rounded-lg border border-sp-border">
            <p className="w-full text-xs font-semibold text-sp-text">
              {editingPlanId !== null ? '평가 수정' : '새 평가 추가'}
            </p>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-sp-muted">평가명</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 1차 지필, 보고서"
                className="w-40 bg-sp-card border border-sp-border rounded-md px-2 py-1.5 text-sp-text text-sm focus:border-sp-accent outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-sp-muted">종류</span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as AssessmentKind)}
                className="bg-sp-card border border-sp-border rounded-md px-2 py-1.5 text-sp-text text-sm focus:border-sp-accent outline-none"
              >
                <option value="written-exam">정기시험(지필)</option>
                <option value="performance">수행평가</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-sp-muted">만점</span>
              <input
                type="number"
                min={0}
                value={fullScore}
                onChange={(e) => setFullScore(Number(e.target.value) || 0)}
                className="w-20 bg-sp-card border border-sp-border rounded-md px-2 py-1.5 text-sp-text text-sm focus:border-sp-accent outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-sp-muted">반영비율(%)</span>
              <input
                type="number"
                min={0}
                max={100}
                value={weightPercent}
                onChange={(e) => setWeightPercent(Number(e.target.value) || 0)}
                className="w-24 bg-sp-card border border-sp-border rounded-md px-2 py-1.5 text-sp-text text-sm focus:border-sp-accent outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => void handleSavePlan()}
              className="px-4 py-2 rounded-lg bg-sp-accent text-white text-sm font-medium hover:brightness-110 transition-all active:scale-95"
            >
              {editingPlanId !== null ? '저장' : '추가'}
            </button>
            <button
              type="button"
              onClick={cancelPlanForm}
              className="px-4 py-2 rounded-lg border border-sp-border text-sp-muted text-sm font-medium hover:text-sp-text hover:bg-sp-card transition-all"
            >
              취소
            </button>
          </div>
        )}

        {classPlans.length === 0 ? (
          <p className="text-xs text-sp-muted py-4 text-center">
            아직 평가 항목이 없습니다. &quot;평가 추가&quot;로 정기시험·수행평가를 만드세요.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {classPlans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedPlanId(plan.id === selectedPlanId ? null : plan.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-all ${
                  plan.id === selectedPlanId
                    ? 'border-sp-accent bg-sp-accent/10 text-sp-text'
                    : 'border-sp-border bg-sp-surface text-sp-muted hover:text-sp-text'
                }`}
              >
                <span className="font-semibold text-sp-text">{plan.title}</span>
                <span className="text-sp-muted">
                  {KIND_LABEL[plan.kind]} · {plan.fullScore}점 · {plan.weightPercent}%
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`${plan.title} 수정`}
                  onClick={(e) => {
                    e.stopPropagation();
                    startEditPlan(plan);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      startEditPlan(plan);
                    }
                  }}
                  className="material-symbols-outlined text-sm text-sp-muted hover:text-sp-accent"
                >
                  edit
                </span>
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`${plan.title} 삭제`}
                  onClick={(e) => {
                    e.stopPropagation();
                    void removePlan(plan.id);
                    if (selectedPlanId === plan.id) setSelectedPlanId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation();
                      void removePlan(plan.id);
                    }
                  }}
                  className="material-symbols-outlined text-sm text-sp-muted hover:text-red-400"
                >
                  close
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 점수 입력 그리드 */}
      {selectedPlan !== null && (
        <div className="bg-sp-card border border-sp-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-1 gap-2">
            <p className="text-sm font-semibold text-sp-text">
              점수 입력 — {selectedPlan.title}{' '}
              <span className="text-xs font-normal text-sp-muted">
                ({KIND_LABEL[selectedPlan.kind]} · 만점 {selectedPlan.fullScore})
              </span>
            </p>
            {selectedPlan.kind === 'written-exam' && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => void handleImportFile(e)}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-lg bg-sp-surface border border-sp-border text-sp-text text-xs font-medium hover:border-sp-accent transition-all"
                  title="NEIS·채점프로그램 엑셀(번호/이름 + 점수)에서 점수 가져오기"
                >
                  <span className="material-symbols-outlined text-sm">upload_file</span>엑셀로 점수
                  가져오기
                </button>
              </>
            )}
          </div>
          {selectedPlan.kind === 'performance' && (
            <p className="text-xs text-sp-muted mb-2">
              수행평가 세부 채점은 <b>수행평가(루브릭)</b> 탭에서 하고, 여기서는 반영용 합계 점수만
              입력하세요. 가정에서 하는 과제형 평가는 점수로 직접 쓰지 않습니다(수업 중 산출물
              기준).
              {onGoToRubricTab !== undefined && (
                <button
                  type="button"
                  onClick={onGoToRubricTab}
                  className="ml-1 text-sp-accent underline"
                >
                  수행평가 탭 열기
                </button>
              )}
            </p>
          )}
          {selectedPlan.kind === 'performance' && classRubrics.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-2 p-2 bg-sp-surface rounded-lg border border-sp-border">
              <span className="text-xs text-sp-muted">루브릭에서 가져오기:</span>
              <select
                value={pullRubricId}
                onChange={(e) => setPullRubricId(e.target.value)}
                className="bg-sp-card border border-sp-border rounded-md px-2 py-1 text-sp-text text-xs focus:border-sp-accent outline-none"
              >
                <option value="">루브릭 선택</option>
                {classRubrics.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title} (만점 {calculateMaxScore(r)})
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={pullRubricId === ''}
                onClick={() => void handlePullFromRubric()}
                className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-sp-accent text-white text-xs font-medium hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <span className="material-symbols-outlined text-sm">download</span>채점 점수
                가져오기
              </button>
            </div>
          )}
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-sp-card">
                <tr className="text-sp-muted text-xs border-b border-sp-border">
                  <th className="text-left py-1.5 w-12">번호</th>
                  <th className="text-left py-1.5">이름</th>
                  <th className="text-right py-1.5 w-28">점수</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => {
                  const key = studentKey(student);
                  const value = scoreOf(selectedPlan.id, key, selectedPlan.kind);
                  return (
                    <tr key={key} className="border-b border-sp-border/50">
                      <td className="py-1 text-sp-muted">{student.number}</td>
                      <td className="py-1 text-sp-text">{student.name}</td>
                      <td className="py-1 text-right">
                        <input
                          type="number"
                          min={0}
                          max={selectedPlan.fullScore}
                          value={value ?? ''}
                          onChange={(e) =>
                            handleScoreInput(
                              selectedPlan.id,
                              key,
                              selectedPlan.kind,
                              e.target.value,
                            )
                          }
                          className="w-20 bg-sp-surface border border-sp-border rounded-md px-2 py-1 text-sp-text text-sm text-right focus:border-sp-accent outline-none"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 성취도 분포 요약 */}
      {showAchievement ? (
        <div className="bg-sp-card border border-sp-border rounded-xl p-4">
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <p className="text-sm font-semibold text-sp-text">
              성취도 분포{' '}
              <span className="text-xs font-normal text-sp-muted">
                ({confirmedAt !== undefined ? '확정' : '추정'} ·{' '}
                {cutSetting.mode === 'custom'
                  ? '추정분할(단위학교 산출 컷)'
                  : '고정분할 90/80/70/60'}
                )
              </span>
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => void handleExportSummary(summary, distribution)}
                disabled={!canShowAchievement || exporting}
                title="개인 점수 없이 통계·분포만 엑셀로 내보냅니다"
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-sp-border text-sp-text text-xs font-medium hover:border-sp-accent disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <span className="material-symbols-outlined text-sm">download</span>
                {exporting ? '내보내는 중...' : '요약 내보내기'}
              </button>
              <button
                type="button"
                onClick={toggleConfirm}
                disabled={!canShowAchievement && confirmedAt === undefined}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  confirmedAt !== undefined
                    ? 'border border-green-500/40 text-green-500 hover:bg-green-500/10'
                    : 'bg-sp-accent text-white hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed'
                }`}
              >
                {confirmedAt !== undefined ? '확정 해제' : '성적 확정'}
              </button>
              {/* 분할 방식 선택 */}
              <div className="flex items-center gap-1 bg-sp-surface border border-sp-border rounded-lg p-0.5">
                {(
                  [
                    ['fixed', '고정분할'],
                    ['custom', '추정분할'],
                  ] as const
                ).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => updateCutSetting({ mode: m })}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      cutSetting.mode === m
                        ? 'bg-sp-accent text-white'
                        : 'text-sp-muted hover:text-sp-text'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {cutSetting.mode === 'custom' && (
            <div className="flex flex-wrap items-end gap-2 mb-3 p-3 bg-sp-surface rounded-lg border border-sp-border">
              <span className="text-xs text-sp-muted self-center">분할점수(원점수 이상)</span>
              {(['A', 'B', 'C', 'D'] as const).map((g) => (
                <label key={g} className="flex flex-col gap-0.5">
                  <span className="text-[11px] text-sp-muted">{g} 이상</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={cutSetting.cut[g]}
                    onChange={(e) => setCutField(g, Number(e.target.value) || 0)}
                    className="w-16 bg-sp-card border border-sp-border rounded-md px-2 py-1 text-sp-text text-sm focus:border-sp-accent outline-none"
                  />
                </label>
              ))}
              <span className="text-[11px] text-sp-muted self-center">D 미만 = E</span>
              {!cutDescending && (
                <span className="text-[11px] text-red-400 self-center">
                  컷은 A&gt;B&gt;C&gt;D 순으로 내려가야 합니다.
                </span>
              )}
            </div>
          )}
          {canShowAchievement ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-3 text-sm">
                <span className="text-sp-muted">
                  인원 <b className="text-sp-text">{summary.count}</b>
                </span>
                <span className="text-sp-muted">
                  평균 <b className="text-sp-text">{summary.mean}</b>
                </span>
                <span className="text-sp-muted">
                  표준편차 <b className="text-sp-text">{summary.stdev}</b>
                </span>
                <span className="text-sp-muted">
                  최저~최고{' '}
                  <b className="text-sp-text">
                    {summary.min}~{summary.max}
                  </b>
                </span>
              </div>
              <div className="flex items-center gap-2">
                {(['A', 'B', 'C', 'D', 'E'] as const).map((g) => (
                  <span
                    key={g}
                    className="text-xs px-2 py-1 rounded-md bg-sp-surface border border-sp-border text-sp-text"
                  >
                    {g} <b>{distribution[g]}</b>
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-sp-muted">
              모든 평가를 입력하고 반영비율 합계가 100%가 되면 성취도(추정) 분포가 표시됩니다.
            </p>
          )}
        </div>
      ) : (
        <div className="bg-sp-card border border-sp-border rounded-xl p-4">
          <p className="text-xs text-sp-muted">
            초등학교는 점수·성취도 산출 대신 성취수준 서술 평가를 사용합니다. (성취도 분포 미표시)
          </p>
        </div>
      )}

      {/* 산출 미리보기 */}
      <div className="bg-sp-card border border-sp-border rounded-xl p-4">
        <p className="text-sm font-semibold text-sp-text mb-2">
          산출 미리보기{' '}
          <span className="text-xs font-normal text-sp-muted">
            {confirmedAt !== undefined ? `(확정 · ${confirmedAt})` : '(추정 · 미확정)'}
          </span>
        </p>
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-sp-card">
              <tr className="text-sp-muted text-xs border-b border-sp-border">
                <th className="text-left py-1.5 w-12">번호</th>
                <th className="text-left py-1.5">이름</th>
                <th className="text-right py-1.5 w-32">환산 원점수(추정)</th>
                {showAchievement && <th className="text-right py-1.5 w-20">성취도(추정)</th>}
                <th className="text-right py-1.5 w-24">입력 평가</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student, i) => {
                const row = preview[i];
                const fullyEntered =
                  classPlans.length > 0 && row !== undefined && row.counted === classPlans.length;
                const achievement =
                  showAchievement && weightOk && fullyEntered && row !== undefined
                    ? achievementOf(row.raw, activeCut)
                    : null;
                return (
                  <tr key={studentKey(student)} className="border-b border-sp-border/50">
                    <td className="py-1 text-sp-muted">{student.number}</td>
                    <td className="py-1 text-sp-text">{student.name}</td>
                    <td className="py-1 text-right font-semibold text-sp-text">
                      {row ? row.raw : 0}
                    </td>
                    {showAchievement && (
                      <td className="py-1 text-right font-semibold text-sp-accent">
                        {achievement ?? '—'}
                      </td>
                    )}
                    <td className="py-1 text-right text-sp-muted">
                      {row ? row.counted : 0}/{classPlans.length}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {mappingRows !== null && (
        <GradeImportMappingModal
          rawRows={mappingRows}
          onApply={handleManualApply}
          onClose={() => setMappingRows(null)}
        />
      )}
    </div>
  );
}
