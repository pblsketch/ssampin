/**
 * 수업 관리 > 수행평가 탭 (FR-1).
 *
 * Phase 1: 루브릭 목록 + 빌더(생성·수정·삭제) + 한도 가드(수업반당 10개, D4).
 * 채점 화면은 Phase 2에서 이 탭 안에 추가된다.
 *
 * 명단 없음 상태는 RosterEmptyState 시각 패턴을 따르되, 수업반 명단은
 * 담임 명렬이 아니라 이 페이지의 '명렬 관리' 탭에서 등록하므로
 * CTA는 탭 전환(onGoToRosterTab)으로 연결한다.
 */
import { useEffect, useMemo, useState } from 'react';
import { useRubricStore } from '@adapters/stores/useRubricStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { isStudentActive } from '@domain/rules/studentActivity';
import type { Rubric } from '@domain/entities/Rubric';
import {
  MAX_RUBRICS_PER_CLASS,
  calculateMaxScore,
  canAddRubric,
  countClassRubrics,
  findGradingsForRubric,
} from '@domain/rules/rubricRules';
import { RubricBuilderModal } from './RubricBuilderModal';
import { RubricGradingView } from './RubricGradingView';
import { RubricCopyModal } from './RubricCopyModal';

/* ──────────────── RubricCard ──────────────── */

interface RubricCardProps {
  rubric: Rubric;
  gradedCount: number;
  onOpen: (rubric: Rubric) => void;
  onEdit: (rubric: Rubric) => void;
  onCopy: (rubric: Rubric) => void;
  onDelete: (rubric: Rubric) => void;
}

function RubricCard({ rubric, gradedCount, onOpen, onEdit, onCopy, onDelete }: RubricCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const maxScore = calculateMaxScore(rubric);
  const updatedDate = rubric.updatedAt.slice(0, 10).replace(/-/g, '.');

  const previewNames = rubric.criteria.slice(0, 4).map((c) => c.name);
  const moreCount = rubric.criteria.length - previewNames.length;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(rubric)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onOpen(rubric);
      }}
      className="w-full bg-sp-card rounded-xl p-4 border border-sp-border hover:border-sp-accent transition-all group cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-sp-text truncate">{rubric.title}</h4>
          {rubric.description !== undefined && (
            <p className="text-xs text-sp-muted mt-0.5 truncate">{rubric.description}</p>
          )}
        </div>
        <div
          className="relative shrink-0"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => setShowMenu((v) => !v)}
            className="p-1 rounded-lg hover:bg-sp-surface transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            aria-label={`'${rubric.title}' 메뉴`}
            aria-expanded={showMenu}
          >
            <span className="material-symbols-outlined text-sp-muted text-icon-md">more_vert</span>
          </button>
          {showMenu && (
            <div className="absolute right-0 top-8 bg-sp-card border border-sp-border rounded-lg shadow-xl py-1 min-w-[130px] z-10">
              <button
                type="button"
                onClick={() => {
                  setShowMenu(false);
                  onEdit(rubric);
                }}
                className="w-full px-4 py-2 text-left text-sm text-sp-text hover:bg-sp-surface transition-colors"
              >
                수정
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowMenu(false);
                  onCopy(rubric);
                }}
                className="w-full px-4 py-2 text-left text-sm text-sp-text hover:bg-sp-surface transition-colors"
              >
                다른 반에 복사
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowMenu(false);
                  onDelete(rubric);
                }}
                className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-sp-surface transition-colors"
              >
                삭제
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-sp-muted mt-2 flex-wrap">
        <span>요소 {rubric.criteria.length}개</span>
        <span className="text-sp-border">│</span>
        <span>
          만점 <span className="text-sp-accent font-semibold">{maxScore}점</span>
        </span>
        <span className="text-sp-border">│</span>
        <span>{updatedDate}</span>
        {gradedCount > 0 && (
          <>
            <span className="text-sp-border">│</span>
            <span>채점 기록 {gradedCount}명</span>
          </>
        )}
      </div>

      {/* 평가 요소 미리보기 칩 */}
      <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
        {previewNames.map((name, i) => (
          <span
            key={`${rubric.id}-chip-${i}`}
            className="text-caption text-sp-text bg-sp-surface border border-sp-border rounded-lg px-2 py-0.5 max-w-[10rem] truncate"
          >
            {name}
          </span>
        ))}
        {moreCount > 0 && <span className="text-caption text-sp-muted">+{moreCount}</span>}
      </div>
    </div>
  );
}

/* ──────────────── 명단 없음 안내 (RosterEmptyState 패턴) ──────────────── */

function RubricRosterEmpty({ onGoToRosterTab }: { onGoToRosterTab?: () => void }) {
  return (
    <div
      role="region"
      aria-label="수행평가 시작 안내"
      className="bg-sp-card ring-1 ring-sp-border shadow-sp-sm rounded-xl px-8 py-10 flex flex-col items-center text-center gap-4 max-w-[26rem] mx-auto mt-8"
    >
      <div
        className="bg-sp-surface rounded-xl p-3 flex items-center justify-center"
        aria-hidden="true"
      >
        <span className="material-symbols-outlined text-sp-accent" style={{ fontSize: '32px' }}>
          grading
        </span>
      </div>
      <h2 className="text-base font-bold text-sp-text">수행평가를 시작하려면 명단이 필요해요</h2>
      <p className="text-sm text-sp-muted leading-relaxed">
        이 수업반의 학생을 먼저 등록하면 루브릭으로 채점하고 엑셀·피드백지로 내보낼 수 있어요.
      </p>
      {onGoToRosterTab !== undefined && (
        <button
          type="button"
          onClick={onGoToRosterTab}
          className="bg-sp-accent text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:brightness-110 transition-all duration-150 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent focus-visible:outline-offset-2"
        >
          명렬 관리 탭으로 이동
        </button>
      )}
    </div>
  );
}

/* ──────────────── ClassRubricTab ──────────────── */

interface ClassRubricTabProps {
  classId: string;
  /** 명단 없음 상태에서 '명렬 관리' 탭으로 전환 */
  onGoToRosterTab?: () => void;
}

export function ClassRubricTab({ classId, onGoToRosterTab }: ClassRubricTabProps) {
  const { rubrics, gradings, loaded, load, deleteRubric } = useRubricStore();
  const classes = useTeachingClassStore((s) => s.classes);
  const showToast = useToastStore((s) => s.show);

  const [builderTarget, setBuilderTarget] = useState<'new' | Rubric | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Rubric | null>(null);
  /** 채점 화면으로 연 루브릭 id (Phase 2) */
  const [gradingRubricId, setGradingRubricId] = useState<string | null>(null);
  /** 다른 반에 복사 대상 (Phase 3) */
  const [copyTarget, setCopyTarget] = useState<Rubric | null>(null);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const currentClass = useMemo(() => classes.find((c) => c.id === classId), [classes, classId]);
  const activeStudentCount = useMemo(
    () => (currentClass?.students ?? []).filter(isStudentActive).length,
    [currentClass],
  );

  const classRubrics = useMemo(
    () => rubrics.filter((r) => r.classId === classId),
    [rubrics, classId],
  );
  const rubricCount = countClassRubrics(rubrics, classId);
  const canAdd = canAddRubric(rubrics, classId);

  function handleNewRubric() {
    if (!canAdd) {
      showToast(
        `한 수업반에는 루브릭을 최대 ${MAX_RUBRICS_PER_CLASS}개까지 만들 수 있습니다.`,
        'error',
      );
      return;
    }
    setBuilderTarget('new');
  }

  async function handleDelete() {
    if (deleteTarget === null) return;
    try {
      await deleteRubric(deleteTarget.id);
      showToast('루브릭을 삭제했습니다', 'success');
    } catch {
      showToast('삭제에 실패했습니다', 'error');
    }
    setDeleteTarget(null);
  }

  if (!loaded) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sp-muted text-sm">불러오는 중...</p>
      </div>
    );
  }

  // 채점 화면 (Phase 2) — 루브릭이 그 사이 삭제됐으면 목록으로 폴백
  if (gradingRubricId !== null) {
    const gradingRubric = classRubrics.find((r) => r.id === gradingRubricId);
    if (gradingRubric !== undefined) {
      return (
        <RubricGradingView
          rubric={gradingRubric}
          classId={classId}
          onBack={() => setGradingRubricId(null)}
        />
      );
    }
  }

  // 명단 없음 — RosterEmptyState 패턴 (FR-1)
  if (activeStudentCount === 0) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-sp-text flex items-center gap-2">
            <span className="material-symbols-outlined text-base">grading</span>
            수행평가
          </h3>
        </div>
        <RubricRosterEmpty onGoToRosterTab={onGoToRosterTab} />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-sp-text flex items-center gap-2">
          <span className="material-symbols-outlined text-base">grading</span>
          수행평가
          {classRubrics.length > 0 && (
            <span className="text-sp-muted font-normal">
              ({rubricCount}/{MAX_RUBRICS_PER_CLASS})
            </span>
          )}
        </h3>
        <button
          type="button"
          onClick={handleNewRubric}
          disabled={!canAdd}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sp-accent text-white text-xs font-medium hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          title={canAdd ? undefined : `수업반당 최대 ${MAX_RUBRICS_PER_CLASS}개까지 만들 수 있어요`}
        >
          <span className="material-symbols-outlined text-sm">add</span>새 루브릭
        </button>
      </div>

      {/* 목록 */}
      <div className="flex-1 overflow-y-auto">
        {classRubrics.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-sp-muted">
            <span className="material-symbols-outlined text-5xl opacity-30">grading</span>
            <p className="text-sm font-medium">아직 루브릭이 없습니다</p>
            <p className="text-xs text-center leading-relaxed">
              루브릭은 평가 요소와 수준(배점)으로 이루어진 채점 기준표예요.
              <br />
              &quot;새 루브릭&quot; 버튼으로 첫 기준표를 만들어보세요.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {classRubrics.map((rubric) => (
              <RubricCard
                key={rubric.id}
                rubric={rubric}
                gradedCount={findGradingsForRubric(gradings, rubric.id).length}
                onOpen={(r) => setGradingRubricId(r.id)}
                onEdit={(r) => setBuilderTarget(r)}
                onCopy={(r) => setCopyTarget(r)}
                onDelete={(r) => setDeleteTarget(r)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 빌더 모달 */}
      {builderTarget !== null && (
        <RubricBuilderModal
          classId={classId}
          rubric={builderTarget === 'new' ? undefined : builderTarget}
          onClose={() => setBuilderTarget(null)}
        />
      )}

      {/* 다른 반에 복사 모달 (Phase 3) */}
      {copyTarget !== null && (
        <RubricCopyModal
          rubric={copyTarget}
          currentClassId={classId}
          onClose={() => setCopyTarget(null)}
        />
      )}

      {/* 삭제 확인 */}
      {deleteTarget !== null && (
        <>
          <div
            className="fixed inset-0 z-sp-modal bg-black/60 backdrop-blur-sm"
            onClick={() => setDeleteTarget(null)}
          />
          <div className="fixed inset-0 z-sp-modal flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-sp-card rounded-2xl ring-1 ring-sp-border shadow-2xl w-full max-w-sm pointer-events-auto p-6">
              <h3 className="text-base font-bold text-sp-text mb-2">
                {`'${deleteTarget.title}' 루브릭을 삭제하시겠습니까?`}
              </h3>
              <p className="text-sm text-sp-muted mb-5">
                {(() => {
                  const count = findGradingsForRubric(gradings, deleteTarget.id).length;
                  return count > 0
                    ? `이 루브릭으로 채점한 기록 ${count}명분도 함께 삭제되며 복구할 수 없습니다.`
                    : '삭제된 루브릭은 복구할 수 없습니다.';
                })()}
              </p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="px-4 py-2 text-sp-muted hover:text-sp-text rounded-lg hover:bg-sp-surface transition-colors text-sm"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm"
                >
                  삭제
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
