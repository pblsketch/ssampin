import { useMemo } from 'react';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import {
  requiresDocument,
  type AttendanceDocumentPolicy,
} from '@domain/rules/attendanceDocumentPolicy';
import { useTodayStr } from './useTodayStr';

/** 검토 대상 종류 — 나이스 반영 / 서류 제출 / 후속조치. */
export type ReviewKind = 'neis' | 'document' | 'followUp';

export interface ReviewQueueItem {
  readonly record: StudentRecord;
  /** 나이스 미반영 출결 기록인가. */
  readonly neisPending: boolean;
  /** 서류 미제출 출결 기록인가. */
  readonly documentPending: boolean;
  /** 미완료 후속조치가 달린 기록인가. */
  readonly followUpPending: boolean;
  /** followUpPending일 때 기한 상태 — 지남 / 7일 내 다가옴 / 기한 없음·먼 미래. */
  readonly followUpStatus?: 'overdue' | 'upcoming' | 'noDue';
  /** overdue=지난 일수, upcoming=남은 일수. */
  readonly followUpDays?: number;
}

export interface ReviewQueueResult {
  /** 처리 대기 기록(종류 무관 1건=1행). 기한 지난 후속조치 우선, 이후 날짜 내림차순. */
  readonly items: readonly ReviewQueueItem[];
  /** 종류별 대기 건수. total은 대기 기록 수(중복 없이). */
  readonly counts: {
    readonly neis: number;
    readonly document: number;
    readonly followUp: number;
    readonly total: number;
  };
  /** 반 전체 마감 진행률(검토 모드 상단 요약·세그먼트 배지가 공유하는 단일 소스). */
  readonly progress: {
    readonly totalAttendance: number;
    readonly neisReported: number;
    /** 서류 요구 대상 건수(M4 — 정책 게이트 후 분모). */
    readonly docRequired: number;
    /** 서류 요구 대상 중 제출 완료 건수(M4 — "N중 M"의 M). */
    readonly docSubmitted: number;
    readonly followUpTotal: number;
    readonly followUpDone: number;
  };
}

function daysBetween(todayYmd: string, dateStr: string): number {
  const today = new Date(todayYmd + 'T00:00:00');
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * 검토 큐 단일 계산 훅 (리디자인 4단계 — 안 B).
 *
 * 나이스 미반영·서류 미제출·미완료 후속조치를 하나의 처리 목록으로 통합한다.
 * 이전에는 경고 배너·진행 현황 패널·필터 토글이 각자 records.filter로 따로 세던 것을
 * 이 훅 하나가 대체한다(조회 화면 안에서 소스 단일화). 계산 조건:
 * - 나이스: category==='attendance' && !reportedToNeis
 * - 서류(M4 정책 게이트): category==='attendance' && requiresDocument(r, policy) && !documentSubmitted
 *   — 서류가 필요 없는 출결(예: 기본 정책의 질병 결석)은 미제출로 세지 않는다.
 * - 후속조치: followUp && !followUpDone (기한 지남/7일 내/기한 없음 구분)
 */
export function useReviewQueue(
  records: readonly StudentRecord[],
  documentPolicy?: AttendanceDocumentPolicy,
): ReviewQueueResult {
  // 자정을 넘기면 자동 갱신 — 기한 계산이 어제 기준으로 남지 않게 메모 의존성에 포함
  const today = useTodayStr();
  return useMemo(() => {
    const items: ReviewQueueItem[] = [];
    let neisCount = 0;
    let documentCount = 0;
    let followUpCount = 0;
    let totalAttendance = 0;
    let docRequired = 0;
    let docSubmittedCount = 0;
    let followUpTotal = 0;
    let followUpDone = 0;

    for (const r of records) {
      const isAttendance = r.category === 'attendance';
      if (isAttendance) totalAttendance++;
      if (r.followUp) {
        followUpTotal++;
        if (r.followUpDone) followUpDone++;
      }

      const docNeeded = isAttendance && requiresDocument(r, documentPolicy);
      if (docNeeded) {
        docRequired++;
        if (r.documentSubmitted) docSubmittedCount++;
      }

      const neisPending = isAttendance && !r.reportedToNeis;
      const documentPending = docNeeded && !r.documentSubmitted;
      const followUpPending = !!r.followUp && !r.followUpDone;

      if (!neisPending && !documentPending && !followUpPending) continue;

      if (neisPending) neisCount++;
      if (documentPending) documentCount++;
      if (followUpPending) followUpCount++;

      let followUpStatus: ReviewQueueItem['followUpStatus'];
      let followUpDays: number | undefined;
      if (followUpPending) {
        if (r.followUpDate) {
          if (r.followUpDate < today) {
            followUpStatus = 'overdue';
            followUpDays = -daysBetween(today, r.followUpDate);
          } else if (daysBetween(today, r.followUpDate) <= 7) {
            followUpStatus = 'upcoming';
            followUpDays = daysBetween(today, r.followUpDate);
          } else {
            followUpStatus = 'noDue';
          }
        } else {
          followUpStatus = 'noDue';
        }
      }

      items.push({
        record: r,
        neisPending,
        documentPending,
        followUpPending,
        followUpStatus,
        followUpDays,
      });
    }

    // 기한 지난 후속조치 우선(많이 지난 순), 이후 날짜 내림차순 → 같은 날은 최근 작성순
    items.sort((a, b) => {
      const aOver = a.followUpStatus === 'overdue' ? 1 : 0;
      const bOver = b.followUpStatus === 'overdue' ? 1 : 0;
      if (aOver !== bOver) return bOver - aOver;
      if (aOver && bOver && a.followUpDays !== b.followUpDays) {
        return (b.followUpDays ?? 0) - (a.followUpDays ?? 0);
      }
      if (a.record.date !== b.record.date) return b.record.date.localeCompare(a.record.date);
      return b.record.createdAt.localeCompare(a.record.createdAt);
    });

    return {
      items,
      counts: {
        neis: neisCount,
        document: documentCount,
        followUp: followUpCount,
        total: items.length,
      },
      progress: {
        totalAttendance,
        neisReported: totalAttendance - neisCount,
        docRequired,
        docSubmitted: docSubmittedCount,
        followUpTotal,
        followUpDone,
      },
    };
  }, [records, documentPolicy, today]);
}
