import type { AttendanceStatus, AttendanceReason } from '@domain/entities/Attendance';
import { PERIOD_MORNING, PERIOD_CLOSING, formatPeriodLabel } from '@domain/entities/Attendance';
import { computeAutoPeriods } from '@domain/rules/attendanceRules';

/**
 * 출결 텍스트 빠른 입력 파서 — 순수 도메인 함수 (attendance-grid-v2 §3.10-3).
 *
 * 한 줄 = 학생 한 명. `학생 [교시] [사유] 종류 [비고…]`
 * - 학생 = 이름 또는 번호(맨 앞 고정). 동명이인이면 번호로 입력.
 * - 종류 = 결석/지각/조퇴/결과 (필수, 첫 매칭 1개).
 * - 교시 = 조회/종례/N교시/순수 N. 결석은 생략 허용(전 교시), 나머지는 필수.
 *   (교시 개념이 없는 화면 — 모바일 담임 출결 — 은 requirePeriod:false로 전 종류 생략 허용)
 * - 사유 = 질병/미인정/기타/인정 (생략 시 기타).
 * - 남은 토큰 전부 = 비고 (종류·사유 예약어의 2번째 출현도 비고).
 *
 * 저장/적용은 호출자가 담당한다 — 파서는 해석·검증·미리보기 데이터만 만든다.
 */

const TYPE_MAP: Record<string, Exclude<AttendanceStatus, 'present'>> = {
  결석: 'absent',
  지각: 'late',
  조퇴: 'earlyLeave',
  결과: 'classAbsence',
};

const REASON_TOKENS: readonly AttendanceReason[] = ['질병', '미인정', '기타', '인정'];

const STATUS_LABEL: Record<Exclude<AttendanceStatus, 'present'>, string> = {
  absent: '결석',
  late: '지각',
  earlyLeave: '조퇴',
  classAbsence: '결과',
};

export interface QuickTextParsedResult {
  studentNumber: number;
  studentName: string;
  status: Exclude<AttendanceStatus, 'present'>;
  reason: AttendanceReason;
  /** computeAutoPeriods 앵커(기준 교시). 결석은 조회(전 교시 무관). */
  referencePeriod: number;
  memo?: string;
  /** 적용될 교시 집합(정렬) — computeAutoPeriods 결과 */
  periods: number[];
  /** 미리보기 문자열: "김정민 — 지각(질병) 조회~2교시 · 감기" */
  preview: string;
}

export interface QuickTextParsedLine {
  /** 원본 줄(트림) */
  raw: string;
  /** 1-기반 줄 번호(전체 입력 기준) */
  lineNo: number;
  ok: boolean;
  /** ok=false 일 때 사용자 메시지 */
  error?: string;
  result?: QuickTextParsedResult;
}

export interface QuickTextParseOptions {
  /**
   * false면 지각·조퇴·결과도 교시 생략을 허용한다(기준 교시=조회).
   * 하루 단위 상태만 저장하는 화면(모바일 담임 출결)처럼 교시 개념이 없는 호출자용.
   * 기본 true — 데스크톱 그리드 동작 불변.
   */
  requirePeriod?: boolean;
}

/** 교시 토큰 해석 — 조회/종례/N교시/순수 N. 실패 시 null. */
function parsePeriodToken(tok: string, periodCount: number): number | null {
  if (tok === '조회') return PERIOD_MORNING;
  if (tok === '종례') return PERIOD_CLOSING;
  const m = /^(\d+)교시$/.exec(tok);
  if (m) {
    const n = Number(m[1]);
    return n >= 1 && n <= periodCount ? n : null;
  }
  if (/^\d+$/.test(tok)) {
    const n = Number(tok);
    return n >= 1 && n <= periodCount ? n : null;
  }
  return null;
}

function rangeLabel(periods: number[]): string {
  if (periods.length === 0) return '';
  const sorted = [...periods].sort((a, b) => a - b);
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  if (first === last) return formatPeriodLabel(first);
  // 연속이면 범위, 아니면 나열(대부분 연속)
  const isContiguous = sorted.every((p, i) => i === 0 || p === sorted[i - 1]! + 1);
  return isContiguous
    ? `${formatPeriodLabel(first)}~${formatPeriodLabel(last)}`
    : sorted.map(formatPeriodLabel).join(',');
}

function parseLine(
  raw: string,
  lineNo: number,
  roster: readonly { number: number; name: string }[],
  periodCount: number,
  requirePeriod: boolean,
): QuickTextParsedLine | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null; // 빈 줄 무시

  const tokens = trimmed.split(/\s+/);
  const first = tokens[0]!;

  // 1) 학생 해석 (맨 앞 고정)
  let student: { number: number; name: string } | undefined;
  if (/^\d+$/.test(first)) {
    const num = Number(first);
    student = roster.find((s) => s.number === num);
    if (!student)
      return { raw: trimmed, lineNo, ok: false, error: `${num}번 학생이 명단에 없어요` };
  } else {
    const matches = roster.filter((s) => s.name === first);
    if (matches.length === 0)
      return { raw: trimmed, lineNo, ok: false, error: `'${first}' 학생이 명단에 없어요` };
    if (matches.length > 1)
      return {
        raw: trimmed,
        lineNo,
        ok: false,
        error: `'${first}'는 동명이인이에요. 번호로 입력해주세요`,
      };
    student = matches[0]!;
  }

  const rest = tokens.slice(1);

  // 2) 종류(첫 매칭, 필수)
  let status: Exclude<AttendanceStatus, 'present'> | undefined;
  let statusIdx = -1;
  for (let i = 0; i < rest.length; i += 1) {
    const t = TYPE_MAP[rest[i]!];
    if (t !== undefined) {
      status = t;
      statusIdx = i;
      break;
    }
  }
  if (!status) {
    return { raw: trimmed, lineNo, ok: false, error: '종류(결석·지각·조퇴·결과)가 없어요' };
  }

  // 3) 교시(첫 해석 성공, statusIdx 제외)
  let period: number | undefined;
  let periodIdx = -1;
  for (let i = 0; i < rest.length; i += 1) {
    if (i === statusIdx) continue;
    const p = parsePeriodToken(rest[i]!, periodCount);
    if (p !== null) {
      period = p;
      periodIdx = i;
      break;
    }
  }

  // 4) 사유(첫 예약어, status/period idx 제외; 생략=기타)
  let reason: AttendanceReason = '기타';
  let reasonIdx = -1;
  for (let i = 0; i < rest.length; i += 1) {
    if (i === statusIdx || i === periodIdx) continue;
    if ((REASON_TOKENS as readonly string[]).includes(rest[i]!)) {
      reason = rest[i] as AttendanceReason;
      reasonIdx = i;
      break;
    }
  }

  // 5) 비고 = 소비되지 않은 나머지 토큰 전부(예약어 2번째 출현 포함)
  const memoTokens = rest.filter((_, i) => i !== statusIdx && i !== periodIdx && i !== reasonIdx);
  const memo = memoTokens.length > 0 ? memoTokens.join(' ') : undefined;

  // 6) 교시 필수 검증(결석만 생략 허용 — requirePeriod:false면 전 종류 생략 허용)
  if (status !== 'absent' && period === undefined && requirePeriod) {
    return {
      raw: trimmed,
      lineNo,
      ok: false,
      error: '교시가 없어요 (지각·조퇴·결과는 몇 교시인지 필요해요)',
    };
  }

  const referencePeriod = status === 'absent' ? PERIOD_MORNING : (period ?? PERIOD_MORNING);
  const periods = [...computeAutoPeriods(status, referencePeriod, periodCount)].sort(
    (a, b) => a - b,
  );
  const preview = `${student.name} — ${STATUS_LABEL[status]}(${reason}) ${rangeLabel(periods)}${
    memo ? ` · ${memo}` : ''
  }`;

  return {
    raw: trimmed,
    lineNo,
    ok: true,
    result: {
      studentNumber: student.number,
      studentName: student.name,
      status,
      reason,
      referencePeriod,
      memo,
      periods,
      preview,
    },
  };
}

/**
 * 텍스트를 줄 단위로 파싱한다. 빈 줄은 결과에서 제외된다.
 * @param text        여러 줄 입력
 * @param roster      명렬(번호·이름) — 동명이인 판정용
 * @param periodCount 정규 교시 수(1..N)
 * @param options     파싱 옵션 — 생략 시 데스크톱 그리드 동작(교시 필수)
 */
export function parseAttendanceQuickText(
  text: string,
  roster: readonly { number: number; name: string }[],
  periodCount: number,
  options?: QuickTextParseOptions,
): QuickTextParsedLine[] {
  const requirePeriod = options?.requirePeriod ?? true;
  const out: QuickTextParsedLine[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const parsed = parseLine(lines[i]!, i + 1, roster, periodCount, requirePeriod);
    if (parsed) out.push(parsed);
  }
  return out;
}
