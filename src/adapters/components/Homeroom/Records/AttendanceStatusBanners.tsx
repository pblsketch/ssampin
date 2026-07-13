import { useMemo, useState } from 'react';
import type { Student } from '@domain/entities/Student';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { formatDateKR, getRecordChipLabel } from './recordUtils';

/**
 * 출결 현황 요약 배너 — 나이스 미반영·서류 미제출 출결 기록을 한눈에 보고 일괄 처리한다.
 *
 * 출결 탭(AttendanceMode)과 통계 탭(ProgressMode)이 공유하는 단일 컴포넌트. 카운트 산식은
 * category==='attendance' && !reportedToNeis / !documentSubmitted (통계·출결 탭 동일).
 *
 * 가독성(피드백 2026-07): 배너 본문은 테마 대응 `text-sp-text`로 두고 색은 아이콘·건수·완료
 * 버튼에만 쓴다(노란 바탕+노란 글씨 저대비 회피 — Notice 컴포넌트와 같은 원칙).
 */
function groupRecordsByStudent(recs: readonly StudentRecord[], students: readonly Student[]) {
  const byStudent = new Map<string, StudentRecord[]>();
  for (const r of recs) {
    const arr = byStudent.get(r.studentId) ?? [];
    arr.push(r);
    byStudent.set(r.studentId, arr);
  }
  return Array.from(byStudent.entries())
    .map(([studentId, list]) => ({
      student: students.find((s) => s.id === studentId),
      records: list,
    }))
    .filter((d): d is { student: Student; records: StudentRecord[] } => !!d.student);
}

export function AttendanceStatusBanners({
  students,
  variant = 'banners',
}: {
  students: readonly Student[];
  /** 'banners'(기본) = 조회 탭 이전 통계 탭이 쓰는 세로 스택 배너 2종 그대로.
   *  'strip' = 조회 탭 전용, 두 지표를 접힌 한 줄로 통합하고 펼치면 동일 상세를 보여준다. */
  variant?: 'banners' | 'strip';
}) {
  const records = useStudentRecordsStore((s) => s.records);
  const categories = useStudentRecordsStore((s) => s.categories);
  const bulkMarkDocumentSubmitted = useStudentRecordsStore((s) => s.bulkMarkDocumentSubmitted);
  const bulkMarkNeisReported = useStudentRecordsStore((s) => s.bulkMarkNeisReported);

  const [showNeis, setShowNeis] = useState(false);
  const [showDoc, setShowDoc] = useState(false);
  const [stripExpanded, setStripExpanded] = useState(false);

  const unreported = useMemo(
    () => records.filter((r) => r.category === 'attendance' && !r.reportedToNeis),
    [records],
  );
  const unsubmitted = useMemo(
    () => records.filter((r) => r.category === 'attendance' && !r.documentSubmitted),
    [records],
  );
  const neisDetail = useMemo(
    () => groupRecordsByStudent(unreported, students),
    [unreported, students],
  );
  const docDetail = useMemo(
    () => groupRecordsByStudent(unsubmitted, students),
    [unsubmitted, students],
  );

  if (unreported.length === 0 && unsubmitted.length === 0) return null;

  // 나이스 미반영 배너 본문 — banners·strip 두 variant가 그대로 공유(로직 복제 없음)
  const neisSection = unreported.length > 0 && (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowNeis((v) => !v)}
          aria-expanded={showNeis}
          className="flex-1 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sp-text text-xs text-left"
        >
          <span className="material-symbols-outlined text-icon-sm text-amber-500">warning</span>
          나이스 미반영 출결 기록{' '}
          <span className="font-bold text-amber-600">{unreported.length}</span>건
          <span
            className={`material-symbols-outlined text-sm ml-auto text-sp-muted transition-transform ${showNeis ? 'rotate-180' : ''}`}
          >
            expand_more
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            if (
              window.confirm(
                `나이스 미반영 출결 기록 ${unreported.length}건을 모두 반영 완료로 처리하시겠습니까?`,
              )
            ) {
              void bulkMarkNeisReported(unreported.map((r) => r.id));
            }
          }}
          className="flex items-center gap-1 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-xs hover:bg-green-500/20 transition-colors whitespace-nowrap"
        >
          <span className="material-symbols-outlined text-icon-sm">done_all</span>
          전체 반영 완료
        </button>
      </div>
      {showNeis && (
        <div className="rounded-lg bg-sp-card p-3 space-y-2 border border-sp-border">
          {neisDetail.map(({ student, records: recs }) => (
            <div key={student.id} className="flex items-center gap-3 text-xs">
              <span className="font-medium text-sp-text min-w-[60px]">{student.name}</span>
              <div className="flex flex-wrap gap-1">
                {recs.map((r) => (
                  <span key={r.id} className="px-1.5 py-0.5 rounded bg-amber-500/10 text-sp-text">
                    {formatDateKR(r.date)} {getRecordChipLabel(r, categories)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // 서류 미제출 배너 본문 — banners·strip 두 variant가 그대로 공유(로직 복제 없음)
  const docSection = unsubmitted.length > 0 && (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowDoc((v) => !v)}
          aria-expanded={showDoc}
          className="flex-1 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-500/30 text-sp-text text-xs text-left"
        >
          <span className="material-symbols-outlined text-icon-sm text-orange-500">
            description
          </span>
          서류 미제출 출결 기록{' '}
          <span className="font-bold text-orange-600">{unsubmitted.length}</span>건
          <span
            className={`material-symbols-outlined text-sm ml-auto text-sp-muted transition-transform ${showDoc ? 'rotate-180' : ''}`}
          >
            expand_more
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            if (
              window.confirm(
                `서류 미제출 출결 기록 ${unsubmitted.length}건을 모두 제출 완료로 처리하시겠습니까?`,
              )
            ) {
              void bulkMarkDocumentSubmitted(unsubmitted.map((r) => r.id));
            }
          }}
          className="flex items-center gap-1 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-xs hover:bg-green-500/20 transition-colors whitespace-nowrap"
        >
          <span className="material-symbols-outlined text-icon-sm">done_all</span>
          전체 제출 완료
        </button>
      </div>
      {showDoc && (
        <div className="rounded-lg bg-sp-card p-3 space-y-2 border border-sp-border">
          {docDetail.map(({ student, records: recs }) => (
            <div key={student.id} className="flex items-center gap-3 text-xs">
              <span className="font-medium text-sp-text min-w-[60px]">{student.name}</span>
              <div className="flex flex-wrap gap-1">
                {recs.map((r) => (
                  <span key={r.id} className="px-1.5 py-0.5 rounded bg-orange-500/10 text-sp-text">
                    {formatDateKR(r.date)} {getRecordChipLabel(r, categories)}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (variant === 'strip') {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setStripExpanded((v) => !v)}
          aria-expanded={stripExpanded}
          className="w-full flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sp-text text-xs text-left"
        >
          <span className="material-symbols-outlined text-icon-sm text-amber-500">warning</span>
          <span className="flex items-center gap-1 flex-wrap">
            {unreported.length > 0 && (
              <>
                나이스 미반영 <span className="font-bold text-amber-600">{unreported.length}</span>
                건
              </>
            )}
            {unreported.length > 0 && unsubmitted.length > 0 && (
              <span className="text-sp-muted">·</span>
            )}
            {unsubmitted.length > 0 && (
              <>
                서류 미제출 <span className="font-bold text-orange-600">{unsubmitted.length}</span>
                건
              </>
            )}
          </span>
          <span
            className={`material-symbols-outlined text-sm ml-auto text-sp-muted transition-transform ${stripExpanded ? 'rotate-180' : ''}`}
          >
            expand_more
          </span>
        </button>
        {stripExpanded && (
          <div className="space-y-2">
            {neisSection}
            {docSection}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {neisSection}
      {docSection}
    </div>
  );
}
