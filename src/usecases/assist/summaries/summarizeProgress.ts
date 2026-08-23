/**
 * 수업 진도 기록을 모델에 보낼 요약으로 바꾼다(순수 함수).
 *
 * 진도는 **학생이 아니라 수업**의 기록이라 개별 학생 데이터가 아니다. 다만 단원·차시·메모는
 * 선생님이 자유롭게 적는 자리라 "3반 김지훈 발표" 처럼 이름이 섞일 수 있다 — 전부
 * freeTextFields 로 선언해 전송 직전 관문(그물 ③)을 거치게 한다.
 *
 * ★학급은 **이름으로 바꿔서** 내보낸다. 저장된 값은 UUID(`classId`)인데, 그대로 보내면
 * 모델이 읽을 수 없는 데다 전화번호 정규식에 걸릴 위험(실측 0.24%)만 짊어진다.
 */
import { clip } from './clip';

/** summarizeProgress 가 필요로 하는 최소 필드 (ProgressEntry 와 호환) */
export interface ProgressLike {
  readonly classId: string;
  /** YYYY-MM-DD */
  readonly date: string;
  readonly period: number;
  readonly unit: string;
  readonly lesson: string;
  readonly status: string;
  readonly note: string;
}

export interface SummarizeProgressOptions {
  /** YYYY-MM-DD (포함) */
  readonly from: string;
  /** YYYY-MM-DD (포함) */
  readonly to: string;
  /** classId → 학급 이름. 없는 id 는 '(삭제된 학급)' 으로 나간다 */
  readonly classNames: Readonly<Record<string, string>>;
  /** 특정 학급만 볼 때의 이름. 생략하면 전부 */
  readonly className?: string;
  /** 담을 건수 상한. 기본 60건 */
  readonly maxItems?: number;
  /** 메모 한 건의 길이 상한. 기본 300자 */
  readonly maxNoteChars?: number;
}

export interface ProgressSummary {
  readonly period: string;
  /** 기간 안의 **전체** 건수. 잘려도 이 숫자는 사실 그대로다 */
  readonly total: number;
  readonly truncated: boolean;
  readonly items: readonly {
    readonly date: string;
    readonly className: string;
    readonly periodNo: number;
    readonly unit: string;
    readonly lesson: string;
    /** planned(예정) · completed(완료) · skipped(건너뜀) */
    readonly status: string;
    readonly note: string;
  }[];
}

export function summarizeProgress(
  entries: readonly ProgressLike[],
  opts: SummarizeProgressOptions,
): ProgressSummary {
  const maxItems = opts.maxItems ?? 60;
  const maxNoteChars = opts.maxNoteChars ?? 300;

  const matched = entries
    .filter((e) => e.date >= opts.from && e.date <= opts.to)
    .map((e) => ({ entry: e, className: opts.classNames[e.classId] ?? '(삭제된 학급)' }))
    .filter((row) => opts.className === undefined || row.className === opts.className)
    .sort((a, b) => a.entry.date.localeCompare(b.entry.date) || a.entry.period - b.entry.period);

  return {
    period: `${opts.from} ~ ${opts.to}`,
    total: matched.length,
    truncated: matched.length > maxItems,
    items: matched.slice(0, maxItems).map(({ entry, className }) => ({
      date: entry.date,
      className,
      periodNo: entry.period,
      unit: entry.unit,
      lesson: entry.lesson,
      status: entry.status,
      note: clip(entry.note, maxNoteChars),
    })),
  };
}
