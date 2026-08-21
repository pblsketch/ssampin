/**
 * summarizeRecords가 필요로 하는 최소 필드만 갖는 로컬 입력 타입.
 * (adapters 레이어의 StudentRecord 전체 — content, tags, followUp 등 자유 텍스트/개인정보
 * 인접 필드 —는 받지 않고, 집계에 필요한 category/date/학급 매칭 필드만 받는다.)
 */
export interface RecordLike {
  readonly category: string;
  /** 기록 발생일 (YYYY-MM-DD) — period 범위 필터링에 사용 */
  readonly date: string;
  /** 어느 학급 소속 기록인지 매칭용 (studentId 등에서 파생한 값을 호출자가 미리 넣어 전달) */
  readonly classId: string;
}

export interface SummarizeRecordsOptions {
  readonly classId: string;
  /** 결과에 표시할 학급명 (조회는 호출자 책임) */
  readonly className: string;
  /** 조회 기간 시작일 (YYYY-MM-DD, 포함) */
  readonly periodFrom: string;
  /** 조회 기간 종료일 (YYYY-MM-DD, 포함) */
  readonly periodTo: string;
  /** 결과에 표시할 기간 라벨 (예: "2026-08-01 ~ 2026-08-21") */
  readonly periodLabel: string;
}

export interface RecordsSummary {
  readonly className: string;
  readonly period: string;
  readonly total: number;
  readonly byCategory: readonly { readonly category: string; readonly count: number }[];
}

/**
 * 학생 기록(관찰·상담·출결 등)을 학급·기간 기준으로 카테고리별 건수 집계한다(순수 함수).
 *
 * content(자유 서술) 등 개인정보가 섞일 수 있는 필드는 애초에 인자 타입에서 받지 않는다 —
 * 이 함수는 "몇 건씩 있는지"만 계산하고 어떤 내용인지는 다루지 않는다.
 */
export function summarizeRecords(
  records: readonly RecordLike[],
  opts: SummarizeRecordsOptions,
): RecordsSummary {
  const matched = records.filter(
    (r) => r.classId === opts.classId && r.date >= opts.periodFrom && r.date <= opts.periodTo,
  );

  const byCategoryMap = new Map<string, number>();
  for (const r of matched) {
    byCategoryMap.set(r.category, (byCategoryMap.get(r.category) ?? 0) + 1);
  }

  return {
    className: opts.className,
    period: opts.periodLabel,
    total: matched.length,
    byCategory: [...byCategoryMap.entries()].map(([category, count]) => ({ category, count })),
  };
}
