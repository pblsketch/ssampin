/**
 * 루브릭 빌더 모달 (FR-2).
 *
 * - 평가 요소마다 자기만의 수준 목록(2~6개)을 가진다 (D7) —
 *   루브릭 전체를 한 표로 그리지 않고 "요소 단위 블록"으로 편집한다.
 * - 수준마다 성취 설명 선택 입력 (D5).
 * - 새 요소 추가 시 직전 요소의 수준 구성(이름·배점·설명)을 복제.
 * - 채점 기록이 있는 루브릭의 구조 변경은 경고 후 진행 (FR-2 가드).
 * - 모달 높이 상속: 공용 Modal + 내부 래퍼 `flex-1 min-h-0` 패턴 준수.
 */
import { useMemo, useState } from 'react';
import { Modal } from '@adapters/components/common/Modal';
import { IconButton } from '@adapters/components/common/IconButton';
import { useToastStore } from '@adapters/components/common/Toast';
import { useRubricStore } from '@adapters/stores/useRubricStore';
import type { Rubric, RubricCriterion } from '@domain/entities/Rubric';
import {
  MAX_CRITERIA_PER_RUBRIC,
  MAX_LEVELS_PER_CRITERION,
  MIN_LEVELS_PER_CRITERION,
  DEFAULT_LEVEL_PRESETS,
  calculateMaxScore,
  calculateStructureChangeImpact,
  findGradingsForRubric,
  validateRubric,
} from '@domain/rules/rubricRules';
import { generateUUID } from '@infrastructure/utils/uuid';

/* ──────────────── 편집용 draft 타입 (입력 중에는 배점을 문자열로 보관) ──────────────── */

interface DraftLevel {
  id: string;
  name: string;
  score: string;
  description: string;
}

interface DraftCriterion {
  id: string;
  name: string;
  levels: DraftLevel[];
}

function makeDefaultDraftLevels(): DraftLevel[] {
  return DEFAULT_LEVEL_PRESETS.map((preset) => ({
    id: generateUUID(),
    name: preset.name,
    score: String(preset.score),
    description: '',
  }));
}

function cloneDraftLevels(source: readonly DraftLevel[]): DraftLevel[] {
  return source.map((level) => ({ ...level, id: generateUUID() }));
}

function makeDraftCriterion(levels?: readonly DraftLevel[]): DraftCriterion {
  return {
    id: generateUUID(),
    name: '',
    levels: levels !== undefined ? cloneDraftLevels(levels) : makeDefaultDraftLevels(),
  };
}

function rubricToDrafts(rubric: Rubric): DraftCriterion[] {
  return rubric.criteria.map((criterion) => ({
    id: criterion.id,
    name: criterion.name,
    levels: criterion.levels.map((level) => ({
      id: level.id,
      name: level.name,
      score: String(level.score),
      description: level.description ?? '',
    })),
  }));
}

/** draft → 도메인 형태 변환 (배점 문자열 → 숫자, 빈 설명 → 생략) */
function draftsToCriteria(drafts: readonly DraftCriterion[]): RubricCriterion[] {
  return drafts.map((draft, index) => ({
    id: draft.id,
    name: draft.name.trim(),
    order: index,
    levels: draft.levels.map((level) => ({
      id: level.id,
      name: level.name.trim(),
      score: level.score.trim() === '' ? Number.NaN : Number(level.score),
      ...(level.description.trim().length > 0 ? { description: level.description.trim() } : {}),
    })),
  }));
}

/** 구조(요소/수준 id 집합)가 달라졌는지 — 채점 기록 경고 트리거 */
function structureChanged(before: Rubric, afterCriteria: readonly RubricCriterion[]): boolean {
  const ids = (criteria: readonly RubricCriterion[]) =>
    criteria
      .flatMap((c) => [c.id, ...c.levels.map((l) => l.id)])
      .sort()
      .join('|');
  return ids(before.criteria) !== ids(afterCriteria);
}

/* ──────────────── 컴포넌트 ──────────────── */

interface RubricBuilderModalProps {
  classId: string;
  /** 있으면 수정 모드, 없으면 새 루브릭 */
  rubric?: Rubric;
  /**
   * 초안 prefill(생성 모드) — 평가계획에서 불러온 루브릭 초안.
   * rubric(수정)과 달리 저장 시 createRubric 경로(미저장→신규 생성)를 탄다.
   * rubric 이 함께 주어지면 rubric(수정)이 우선한다.
   */
  draft?: Rubric;
  onClose: () => void;
}

export function RubricBuilderModal({ classId, rubric, draft, onClose }: RubricBuilderModalProps) {
  const showToast = useToastStore((s) => s.show);
  const createRubric = useRubricStore((s) => s.createRubric);
  const updateRubric = useRubricStore((s) => s.updateRubric);
  const gradings = useRubricStore((s) => s.gradings);

  // 수정 모드는 rubric 이 있을 때만. draft 는 생성 모드의 초기값(저장 시 createRubric).
  const isEdit = rubric !== undefined;
  const seed = rubric ?? draft;

  const [title, setTitle] = useState(seed?.title ?? '');
  const [description, setDescription] = useState(seed?.description ?? '');
  const [drafts, setDrafts] = useState<DraftCriterion[]>(() =>
    seed !== undefined ? rubricToDrafts(seed) : [makeDraftCriterion()],
  );
  const [saving, setSaving] = useState(false);
  /** 구조 변경 경고 단계 — 영향받는 기록 수와 함께 확인을 요구 */
  const [pendingWarning, setPendingWarning] = useState<{
    affectedCount: number;
    removedNames: readonly string[];
  } | null>(null);

  /* 실시간 만점 — 입력 중인 배점이 숫자가 아니면 0으로 취급해 미리보기 */
  const maxScore = useMemo(() => {
    const criteria = drafts.map((draft) => ({
      ...draft,
      levels: draft.levels.map((level) => {
        const parsed = Number(level.score);
        return { id: level.id, name: level.name, score: Number.isFinite(parsed) ? parsed : 0 };
      }),
    }));
    return calculateMaxScore({ criteria: criteria.map((c, i) => ({ ...c, order: i })) });
  }, [drafts]);

  /* ── draft 편집 헬퍼 ── */

  function patchCriterion(criterionId: string, patch: Partial<DraftCriterion>) {
    setDrafts((prev) => prev.map((c) => (c.id === criterionId ? { ...c, ...patch } : c)));
  }

  function patchLevel(criterionId: string, levelId: string, patch: Partial<DraftLevel>) {
    setDrafts((prev) =>
      prev.map((c) =>
        c.id === criterionId
          ? { ...c, levels: c.levels.map((l) => (l.id === levelId ? { ...l, ...patch } : l)) }
          : c,
      ),
    );
  }

  function addCriterion() {
    setDrafts((prev) => {
      if (prev.length >= MAX_CRITERIA_PER_RUBRIC) return prev;
      const last = prev[prev.length - 1];
      // 직전 요소의 수준 구성을 기본값으로 복제 (FR-2 편의 기능)
      return [...prev, makeDraftCriterion(last?.levels)];
    });
  }

  function removeCriterion(criterionId: string) {
    setDrafts((prev) => (prev.length <= 1 ? prev : prev.filter((c) => c.id !== criterionId)));
  }

  function addLevel(criterionId: string) {
    setDrafts((prev) =>
      prev.map((c) => {
        if (c.id !== criterionId || c.levels.length >= MAX_LEVELS_PER_CRITERION) return c;
        return {
          ...c,
          levels: [...c.levels, { id: generateUUID(), name: '', score: '', description: '' }],
        };
      }),
    );
  }

  function removeLevel(criterionId: string, levelId: string) {
    setDrafts((prev) =>
      prev.map((c) => {
        if (c.id !== criterionId || c.levels.length <= MIN_LEVELS_PER_CRITERION) return c;
        return { ...c, levels: c.levels.filter((l) => l.id !== levelId) };
      }),
    );
  }

  /* ── 저장 ── */

  async function persist(criteria: RubricCriterion[]) {
    setSaving(true);
    try {
      if (isEdit && rubric !== undefined) {
        await updateRubric({
          ...rubric,
          title,
          ...(description.trim().length > 0
            ? { description: description.trim() }
            : { description: undefined }),
          criteria,
        });
        showToast('루브릭을 수정했습니다', 'success');
      } else {
        await createRubric({
          classId,
          title,
          ...(description.trim().length > 0 ? { description: description.trim() } : {}),
          criteria,
        });
        showToast('루브릭을 만들었습니다', 'success');
      }
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : '저장에 실패했습니다', 'error');
      setSaving(false);
    }
  }

  function handleSave() {
    const criteria = draftsToCriteria(drafts);
    const issues = validateRubric({ title, criteria });
    if (issues.length > 0) {
      showToast(issues[0]!.message, 'error');
      return;
    }

    // 채점 기록이 있는 루브릭의 구조 변경은 경고 후 진행 (FR-2)
    if (isEdit && rubric !== undefined) {
      const rubricGradings = findGradingsForRubric(gradings, rubric.id);
      if (rubricGradings.length > 0 && structureChanged(rubric, criteria)) {
        const impact = calculateStructureChangeImpact(rubric, { criteria }, gradings);
        setPendingWarning({
          affectedCount: impact.affectedGradingCount,
          removedNames: [...impact.removedCriterionNames, ...impact.criteriaWithRemovedLevels],
        });
        return;
      }
    }

    void persist(criteria);
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isEdit ? '루브릭 수정' : '새 루브릭'}
      srOnlyTitle
      size="xl"
    >
      <div className="flex flex-col flex-1 min-h-0 max-h-[85vh]">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-sp-border shrink-0">
          <h3 className="text-sm font-bold text-sp-text flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-sp-accent">grading</span>
            {isEdit ? '루브릭 수정' : '새 루브릭'}
          </h3>
          <IconButton icon="close" label="닫기" variant="ghost" size="sm" onClick={onClose} />
        </div>

        {/* 본문 */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-5">
          {/* 제목/설명 */}
          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="루브릭 제목 (예: 설득하는 글쓰기)"
              aria-label="루브릭 제목"
              className="w-full bg-transparent text-lg font-bold text-sp-text placeholder:text-sp-muted border-b border-sp-border focus:border-sp-accent outline-none pb-2 transition-colors"
            />
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="설명 (선택)"
              aria-label="루브릭 설명"
              className="w-full bg-transparent text-sm text-sp-text placeholder:text-sp-muted outline-none"
            />
          </div>

          {/* 평가 요소 블록 (D7: 요소마다 독립 수준) */}
          {drafts.map((criterion, index) => (
            <div
              key={criterion.id}
              className="rounded-xl border border-sp-border bg-sp-surface p-4 flex flex-col gap-3"
            >
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="w-7 h-7 shrink-0 rounded-lg bg-sp-accent text-white text-xs font-bold flex items-center justify-center"
                >
                  {index + 1}
                </span>
                <input
                  type="text"
                  value={criterion.name}
                  onChange={(e) => patchCriterion(criterion.id, { name: e.target.value })}
                  placeholder={`평가 요소 이름 (예: 주장의 명확성)`}
                  aria-label={`${index + 1}번째 평가 요소 이름`}
                  className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-sp-text placeholder:text-sp-muted outline-none border-b border-transparent focus:border-sp-accent transition-colors pb-0.5"
                />
                <IconButton
                  icon="delete"
                  label={`${index + 1}번째 평가 요소 삭제`}
                  variant="ghost"
                  size="sm"
                  disabled={drafts.length <= 1}
                  onClick={() => removeCriterion(criterion.id)}
                />
              </div>

              {/* 수준 목록 헤더 */}
              <div className="grid grid-cols-[minmax(0,1fr)_5.5rem_minmax(0,1.6fr)_2rem] gap-2 px-1">
                <span className="text-caption text-sp-muted">수준 이름</span>
                <span className="text-caption text-sp-muted text-right">배점</span>
                <span className="text-caption text-sp-muted">성취 설명 (선택)</span>
                <span aria-hidden="true" />
              </div>

              {/* 수준 행 */}
              {criterion.levels.map((level, levelIndex) => (
                <div
                  key={level.id}
                  className="grid grid-cols-[minmax(0,1fr)_5.5rem_minmax(0,1.6fr)_2rem] gap-2 items-center"
                >
                  <input
                    type="text"
                    value={level.name}
                    onChange={(e) => patchLevel(criterion.id, level.id, { name: e.target.value })}
                    placeholder={`수준 ${levelIndex + 1}`}
                    aria-label={`${index + 1}번째 요소 ${levelIndex + 1}번째 수준 이름`}
                    className="bg-sp-card border border-sp-border rounded-lg px-2.5 py-1.5 text-sm text-sp-text placeholder:text-sp-muted outline-none focus:border-sp-accent transition-colors"
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={level.score}
                    onChange={(e) => patchLevel(criterion.id, level.id, { score: e.target.value })}
                    placeholder="점수"
                    aria-label={`${index + 1}번째 요소 ${levelIndex + 1}번째 수준 배점`}
                    className="bg-sp-card border border-sp-border rounded-lg px-2.5 py-1.5 text-sm text-sp-text text-right placeholder:text-sp-muted outline-none focus:border-sp-accent transition-colors"
                  />
                  <input
                    type="text"
                    value={level.description}
                    onChange={(e) =>
                      patchLevel(criterion.id, level.id, { description: e.target.value })
                    }
                    placeholder="비워두면 출력물에서 생략"
                    aria-label={`${index + 1}번째 요소 ${levelIndex + 1}번째 수준 성취 설명`}
                    className="bg-sp-card border border-sp-border rounded-lg px-2.5 py-1.5 text-sm text-sp-text placeholder:text-sp-muted outline-none focus:border-sp-accent transition-colors"
                  />
                  <IconButton
                    icon="close"
                    label={`${index + 1}번째 요소 ${levelIndex + 1}번째 수준 삭제`}
                    variant="ghost"
                    size="sm"
                    disabled={criterion.levels.length <= MIN_LEVELS_PER_CRITERION}
                    onClick={() => removeLevel(criterion.id, level.id)}
                  />
                </div>
              ))}

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => addLevel(criterion.id)}
                  disabled={criterion.levels.length >= MAX_LEVELS_PER_CRITERION}
                  className="flex items-center gap-1 text-xs text-sp-accent hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  <span className="material-symbols-outlined text-sm">add</span>
                  수준 추가 ({criterion.levels.length}/{MAX_LEVELS_PER_CRITERION})
                </button>
                <span className="text-caption text-sp-muted">
                  수준 {MIN_LEVELS_PER_CRITERION}~{MAX_LEVELS_PER_CRITERION}개 · 요소마다 다르게
                  구성할 수 있어요
                </span>
              </div>
            </div>
          ))}

          {/* 요소 추가 */}
          <button
            type="button"
            onClick={addCriterion}
            disabled={drafts.length >= MAX_CRITERIA_PER_RUBRIC}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-sp-border text-sm text-sp-muted hover:text-sp-accent hover:border-sp-accent py-3 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <span className="material-symbols-outlined text-base">add</span>
            평가 요소 추가 ({drafts.length}/{MAX_CRITERIA_PER_RUBRIC}) — 직전 요소의 수준 구성을
            복제합니다
          </button>
        </div>

        {/* 푸터 — 구조 변경 경고 또는 저장 */}
        {pendingWarning !== null ? (
          <div className="p-4 border-t border-sp-border shrink-0 flex flex-col gap-3">
            <div className="flex items-start gap-2">
              <span className="material-symbols-outlined text-base text-red-400 mt-0.5">
                warning
              </span>
              <div className="text-sm text-sp-text">
                <p className="font-bold">이미 채점 기록이 있는 루브릭입니다</p>
                <p className="text-xs text-sp-muted mt-1">
                  {pendingWarning.removedNames.length > 0 ? (
                    <>
                      삭제된 요소/수준(
                      {pendingWarning.removedNames.join(', ')})을 체크한 기록{' '}
                      <span className="text-red-400 font-semibold">
                        {pendingWarning.affectedCount}건
                      </span>
                      의 해당 체크·메모가 사라집니다.
                    </>
                  ) : (
                    <>
                      요소/수준이 추가되어 완료된 채점이 &lsquo;부분 채점&rsquo;으로 바뀔 수
                      있습니다.
                    </>
                  )}{' '}
                  계속할까요?
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingWarning(null)}
                className="px-4 py-2 text-sm text-sp-muted hover:text-sp-text rounded-lg hover:bg-sp-surface transition-colors"
              >
                돌아가기
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setPendingWarning(null);
                  void persist(draftsToCriteria(drafts));
                }}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm font-medium disabled:opacity-50 transition-colors"
              >
                변경 진행
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between p-4 border-t border-sp-border shrink-0">
            <span className="text-sm text-sp-muted">
              요소 <span className="font-semibold text-sp-text">{drafts.length}개</span> · 만점{' '}
              <span className="font-semibold text-sp-accent">{maxScore}점</span>
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-sp-muted hover:text-sp-text rounded-lg hover:bg-sp-surface transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-sp-accent text-white rounded-lg hover:brightness-110 text-sm font-medium disabled:opacity-50 transition-all"
              >
                {saving ? '저장 중...' : isEdit ? '수정 저장' : '루브릭 만들기'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
