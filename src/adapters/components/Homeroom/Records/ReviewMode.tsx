import { useState, useMemo } from 'react';
import type { Student } from '@domain/entities/Student';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import type { RecordCategoryItem } from '@domain/valueObjects/RecordCategory';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { InlineRecordEditor } from './InlineRecordEditor';
import {
  type RecordEditProps,
  formatDateKR,
  formatAttendancePeriodLines,
  getSmartTagClass,
  getRecordChipLabel,
} from './recordUtils';
import { type ReviewKind, type ReviewQueueResult } from './useReviewQueue';

interface ReviewModeProps {
  queue: ReviewQueueResult;
  categories: readonly RecordCategoryItem[];
  studentMap: Map<string, Student>;
  /** 좌측 사이드바와 공유하는 학생 필터(''=전체). 학생을 바꿔도 큐는 유지된다. */
  selectedStudentId: string;
  /** 인라인 편집 상태 묶음(찾아보기 모드와 동일 훅 인스턴스 공유). */
  edit: RecordEditProps;
  onEdit: (record: StudentRecord) => void;
}

const KIND_FILTERS: { key: ReviewKind; label: string }[] = [
  { key: 'neis', label: '나이스' },
  { key: 'document', label: '서류' },
  { key: 'followUp', label: '후속조치' },
];

function kindPending(item: ReviewQueueResult['items'][number], kind: ReviewKind): boolean {
  if (kind === 'neis') return item.neisPending;
  if (kind === 'document') return item.documentPending;
  return item.followUpPending;
}

/**
 * 검토 모드 (리디자인 4단계, 안 B) — 나이스 미반영·서류 미제출·미완료 후속조치를
 * 하나의 처리 큐로 보여주고, 건별·선택 일괄·전체 일괄 처리를 한 화면에서 끝낸다.
 * 저장은 전부 기존 스토어 액션(bulkMarkNeisReported/bulkMarkDocumentSubmitted/
 * toggleNeisReport/toggleDocumentSubmitted/toggleFollowUpDone) 재사용 — 신규 저장 경로 없음.
 */
export function ReviewMode({
  queue,
  categories,
  studentMap,
  selectedStudentId,
  edit,
  onEdit,
}: ReviewModeProps) {
  const bulkMarkNeisReported = useStudentRecordsStore((s) => s.bulkMarkNeisReported);
  const bulkMarkDocumentSubmitted = useStudentRecordsStore((s) => s.bulkMarkDocumentSubmitted);
  const toggleNeisReport = useStudentRecordsStore((s) => s.toggleNeisReport);
  const toggleDocumentSubmitted = useStudentRecordsStore((s) => s.toggleDocumentSubmitted);
  const toggleFollowUpDone = useStudentRecordsStore((s) => s.toggleFollowUpDone);
  const showToast = useToastStore((s) => s.show);

  const [kindFilter, setKindFilter] = useState<ReviewKind | 'all'>('all');
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());

  const visibleItems = useMemo(
    () =>
      queue.items.filter((item) => {
        if (selectedStudentId && item.record.studentId !== selectedStudentId) return false;
        if (kindFilter !== 'all' && !kindPending(item, kindFilter)) return false;
        return true;
      }),
    [queue.items, selectedStudentId, kindFilter],
  );

  // 처리되어 큐를 떠난 항목은 선택에서도 자연히 무시되도록, 사용 시점에 가시 항목과 교집합만 취한다.
  const visibleSelected = useMemo(
    () => visibleItems.filter((item) => selectedIds.has(item.record.id)),
    [visibleItems, selectedIds],
  );
  const allVisibleSelected =
    visibleItems.length > 0 && visibleItems.every((item) => selectedIds.has(item.record.id));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        for (const item of visibleItems) next.delete(item.record.id);
        return next;
      }
      return new Set([...prev, ...visibleItems.map((item) => item.record.id)]);
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  /* ── 일괄 처리 (선택 항목) ── */
  const selNeisIds = visibleSelected.filter((i) => i.neisPending).map((i) => i.record.id);
  const selDocIds = visibleSelected.filter((i) => i.documentPending).map((i) => i.record.id);
  const selFollowIds = visibleSelected.filter((i) => i.followUpPending).map((i) => i.record.id);

  const handleBulkNeis = () => {
    if (selNeisIds.length === 0) return;
    if (
      window.confirm(
        `선택한 출결 기록 ${selNeisIds.length}건을 나이스 반영 완료로 처리하시겠습니까?`,
      )
    ) {
      void bulkMarkNeisReported(selNeisIds);
      showToast(`나이스 반영 완료 ${selNeisIds.length}건 처리했습니다`, 'success');
      clearSelection();
    }
  };
  const handleBulkDoc = () => {
    if (selDocIds.length === 0) return;
    if (
      window.confirm(`선택한 출결 기록 ${selDocIds.length}건을 서류 제출 완료로 처리하시겠습니까?`)
    ) {
      void bulkMarkDocumentSubmitted(selDocIds);
      showToast(`서류 제출 완료 ${selDocIds.length}건 처리했습니다`, 'success');
      clearSelection();
    }
  };
  const handleBulkFollowUp = () => {
    if (selFollowIds.length === 0) return;
    if (window.confirm(`선택한 후속조치 ${selFollowIds.length}건을 완료로 처리하시겠습니까?`)) {
      void (async () => {
        for (const id of selFollowIds) {
          await toggleFollowUpDone(id);
        }
        showToast(`후속조치 완료 ${selFollowIds.length}건 처리했습니다`, 'success');
      })();
      clearSelection();
    }
  };

  /* ── 전체 처리 (반 전체 대기 항목 — 기존 배너의 일괄 버튼 승계) ── */
  const allNeisIds = queue.items.filter((i) => i.neisPending).map((i) => i.record.id);
  const allDocIds = queue.items.filter((i) => i.documentPending).map((i) => i.record.id);
  const handleAllNeis = () => {
    if (
      window.confirm(
        `나이스 미반영 출결 기록 ${allNeisIds.length}건을 모두 반영 완료로 처리하시겠습니까?`,
      )
    ) {
      void bulkMarkNeisReported(allNeisIds);
    }
  };
  const handleAllDoc = () => {
    if (
      window.confirm(
        `서류 미제출 출결 기록 ${allDocIds.length}건을 모두 제출 완료로 처리하시겠습니까?`,
      )
    ) {
      void bulkMarkDocumentSubmitted(allDocIds);
    }
  };

  const { progress, counts } = queue;

  /* ── 모두 완료 빈 상태 ── */
  if (counts.total === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 rounded-xl bg-sp-card p-8">
        <span className="material-symbols-outlined text-4xl text-green-400">check_circle</span>
        <p className="text-sm font-bold text-sp-text">모든 업무 완료!</p>
        <p className="text-xs text-sp-muted">
          나이스 반영·서류 제출·후속조치가 모두 처리되었습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-3 min-h-0">
      {/* 진행 요약 + 전체 처리 */}
      <div className="rounded-xl bg-sp-card p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <ProgressStat
          label="나이스 반영"
          done={progress.neisReported}
          total={progress.totalAttendance}
          barClass="bg-green-500"
          action={counts.neis > 0 ? { label: '전체 반영 완료', onClick: handleAllNeis } : undefined}
        />
        <ProgressStat
          label="서류 제출"
          done={progress.docSubmitted}
          total={progress.totalAttendance}
          barClass="bg-orange-500"
          action={
            counts.document > 0 ? { label: '전체 제출 완료', onClick: handleAllDoc } : undefined
          }
        />
        <ProgressStat
          label="후속조치 완료"
          done={progress.followUpDone}
          total={progress.followUpTotal}
          barClass="bg-blue-500"
        />
      </div>

      {/* 종류 필터 + 선택 일괄 처리 */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={toggleSelectAll}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-sp-muted hover:text-sp-text border border-sp-border bg-sp-surface transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent"
          title={allVisibleSelected ? '전체 선택 해제' : '보이는 항목 전체 선택'}
        >
          <span className="material-symbols-outlined text-sm">
            {allVisibleSelected ? 'check_box' : 'check_box_outline_blank'}
          </span>
          전체 선택
        </button>

        <div className="flex gap-1 bg-sp-surface rounded-lg p-1">
          <button
            type="button"
            onClick={() => setKindFilter('all')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              kindFilter === 'all'
                ? 'bg-sp-accent text-sp-accent-fg'
                : 'text-sp-muted hover:text-sp-text'
            }`}
          >
            전체 {counts.total}
          </button>
          {KIND_FILTERS.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => setKindFilter((prev) => (prev === k.key ? 'all' : k.key))}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                kindFilter === k.key
                  ? 'bg-sp-accent text-sp-accent-fg'
                  : 'text-sp-muted hover:text-sp-text'
              }`}
            >
              {k.label} {counts[k.key]}
            </button>
          ))}
        </div>

        {visibleSelected.length > 0 && (
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-xs text-sp-muted">{visibleSelected.length}건 선택</span>
            <button
              type="button"
              onClick={handleBulkNeis}
              disabled={selNeisIds.length === 0}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              나이스 반영 {selNeisIds.length > 0 ? selNeisIds.length : ''}
            </button>
            <button
              type="button"
              onClick={handleBulkDoc}
              disabled={selDocIds.length === 0}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              서류 제출 {selDocIds.length > 0 ? selDocIds.length : ''}
            </button>
            <button
              type="button"
              onClick={handleBulkFollowUp}
              disabled={selFollowIds.length === 0}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/30 hover:bg-blue-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              후속조치 완료 {selFollowIds.length > 0 ? selFollowIds.length : ''}
            </button>
          </div>
        )}
      </div>

      {/* 처리 큐 리스트 */}
      <div className="flex-1 overflow-y-auto space-y-1.5">
        {visibleItems.length === 0 ? (
          <div className="py-12 text-center text-sm text-sp-muted">
            조건에 맞는 대기 항목이 없습니다
          </div>
        ) : (
          visibleItems.map((item) => {
            const { record } = item;
            const student = studentMap.get(record.studentId);
            const isEditing = edit.editingId === record.id;
            const isSelected = selectedIds.has(record.id);
            const periodLines =
              record.category === 'attendance'
                ? formatAttendancePeriodLines(record.attendancePeriods)
                : [];
            return (
              <div
                key={record.id}
                className={`rounded-lg bg-sp-card p-3 transition-all ${
                  isEditing ? 'ring-1 ring-sp-accent/40 flex flex-col gap-2' : ''
                }`}
              >
                <div className="flex items-center gap-2.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => toggleSelect(record.id)}
                    className="text-sp-muted hover:text-sp-accent transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent rounded"
                    title={isSelected ? '선택 해제' : '선택'}
                    aria-pressed={isSelected}
                  >
                    <span
                      className={`material-symbols-outlined text-base ${isSelected ? 'text-sp-accent' : ''}`}
                    >
                      {isSelected ? 'check_box' : 'check_box_outline_blank'}
                    </span>
                  </button>

                  <span className="text-detail text-sp-muted tabular-nums whitespace-nowrap">
                    {formatDateKR(record.date)}
                  </span>

                  <span className="text-sm text-sp-text font-medium flex items-center gap-1.5">
                    {student?.studentNumber != null && (
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-sp-surface border border-sp-border text-detail font-bold text-sp-muted tabular-nums">
                        {student.studentNumber}
                      </span>
                    )}
                    {student?.name ?? '?'}
                  </span>

                  <span className={getSmartTagClass(record, categories)}>
                    {getRecordChipLabel(record, categories)}
                  </span>

                  {periodLines.length > 0 && (
                    <span
                      className="text-detail font-medium text-sp-muted rounded border border-sp-border bg-sp-surface px-1.5 py-0.5 whitespace-nowrap tabular-nums"
                      title={periodLines.join(' · ')}
                    >
                      {periodLines.join(' · ')}
                    </span>
                  )}

                  {item.followUpPending && (
                    <span
                      className={`text-xs truncate max-w-[200px] ${
                        item.followUpStatus === 'overdue'
                          ? 'text-red-400'
                          : item.followUpStatus === 'upcoming'
                            ? 'text-blue-400'
                            : 'text-sp-muted'
                      }`}
                      title={record.followUp}
                    >
                      {record.followUp}
                      {item.followUpStatus === 'overdue' && ` · ${item.followUpDays}일 지남`}
                      {item.followUpStatus === 'upcoming' &&
                        (item.followUpDays === 0
                          ? ' · 오늘까지'
                          : ` · ${item.followUpDays}일 남음`)}
                    </span>
                  )}

                  {!item.followUpPending && record.content && (
                    <span className="text-xs text-sp-muted truncate flex-1 min-w-0">
                      {record.content}
                    </span>
                  )}

                  <div className="flex items-center gap-1 ml-auto shrink-0">
                    {item.neisPending && (
                      <button
                        type="button"
                        onClick={() => void toggleNeisReport(record.id)}
                        className="px-2 py-1 rounded text-caption font-medium bg-red-500/10 text-red-400 hover:bg-green-500/15 hover:text-green-400 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent"
                        title="나이스 반영 완료로 처리"
                      >
                        나이스 처리
                      </button>
                    )}
                    {item.documentPending && (
                      <button
                        type="button"
                        onClick={() => void toggleDocumentSubmitted(record.id)}
                        className="px-2 py-1 rounded text-caption font-medium bg-orange-500/10 text-orange-400 hover:bg-green-500/15 hover:text-green-400 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent"
                        title="서류 제출 완료로 처리"
                      >
                        서류 처리
                      </button>
                    )}
                    {item.followUpPending && (
                      <button
                        type="button"
                        onClick={() => void toggleFollowUpDone(record.id)}
                        className="px-2 py-1 rounded text-caption font-medium bg-blue-500/10 text-blue-400 hover:bg-green-500/15 hover:text-green-400 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent"
                        title="후속조치 완료로 처리"
                      >
                        완료 처리
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onEdit(record)}
                      className="p-1 rounded text-sp-muted/50 hover:text-sp-accent hover:bg-sp-surface transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent"
                      title="수정"
                    >
                      <span className="material-symbols-outlined text-sm">edit</span>
                    </button>
                  </div>
                </div>

                {isEditing && (
                  <InlineRecordEditor
                    record={record}
                    categories={categories}
                    editContent={edit.editContent}
                    setEditContent={edit.setEditContent}
                    editCategory={edit.editCategory}
                    setEditCategory={edit.setEditCategory}
                    editSubcategory={edit.editSubcategory}
                    setEditSubcategory={edit.setEditSubcategory}
                    editReportedToNeis={edit.editReportedToNeis}
                    setEditReportedToNeis={edit.setEditReportedToNeis}
                    editDocumentSubmitted={edit.editDocumentSubmitted}
                    setEditDocumentSubmitted={edit.setEditDocumentSubmitted}
                    editFollowUp={edit.editFollowUp}
                    setEditFollowUp={edit.setEditFollowUp}
                    editFollowUpDate={edit.editFollowUpDate}
                    setEditFollowUpDate={edit.setEditFollowUpDate}
                    attendancePeriods={
                      record.category === 'attendance' ? edit.editAttendancePeriods : undefined
                    }
                    setAttendancePeriods={
                      record.category === 'attendance' ? edit.setEditAttendancePeriods : undefined
                    }
                    regularPeriodCount={edit.regularPeriodCount}
                    onSave={() => void edit.onEditSave(record)}
                    onCancel={edit.onEditCancel}
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ── 진행 요약 한 칸 ── */
function ProgressStat({
  label,
  done,
  total,
  barClass,
  action,
}: {
  label: string;
  done: number;
  total: number;
  barClass: string;
  action?: { label: string; onClick: () => void };
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 100;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-sp-muted">{label}</span>
        <span className="text-xs font-bold text-sp-text tabular-nums">
          {done}/{total}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-sp-surface overflow-hidden">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${pct}%` }} />
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-caption hover:bg-green-500/20 transition-colors"
        >
          <span className="material-symbols-outlined text-icon-xs">done_all</span>
          {action.label}
        </button>
      )}
    </div>
  );
}
