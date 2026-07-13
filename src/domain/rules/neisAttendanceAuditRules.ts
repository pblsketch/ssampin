/**
 * 나이스 출결 대조 점검 — 도메인 코어 (M3, attendance-neis-audit-suite A).
 *
 * 나이스 "월별 출결현황"에서 파싱된 행(NeisAttendanceRow)과 쌤핀 담임 출결의
 * 일 단위 대표 엔트리(SsampinAttendanceEntry)를 비교해 3분류 리포트를 만든다:
 * 쌤핀에만 있음 / 나이스에만 있음 / 내용 불일치(구분·교시·사유 축 차이).
 *
 * 경계: 이 파일은 파일 파싱·UI를 모른다(파서 컬럼 매핑은 M5, 실물 파일 확보 후).
 * 입력은 이미 구조화된 행이며, 쌤핀 측 일 단위 접기는 호스트가
 * attendanceRules(summarizeNeisAttendance와 동일 규칙)로 수행해 전달한다.
 *
 * 별표 8 §3 정합:
 * - 규칙 라: '인정' 사유는 공식 계 미포함 — 대조에서도 공식(질병/미인정/기타)과
 *   인정을 별도 짝으로 비교한다(인정 내역은 나이스 '인정내역 표시' 체크 시 노출).
 * - 규칙 바·사: 일 단위 대표 1건 전제 — 쌤핀 측 입력은 (학생, 날짜)당
 *   공식 최대 1건 + 인정 최대 1건이다.
 *
 * 식별: (출석번호, 날짜) 키. 이름은 식별에 쓰지 않으며(표기차 완화 — 공백 제거
 * 수준의 참고 비교만 가능), 이름 차이는 불일치로 계상하지 않는다.
 */

/** 나이스식 상태 라벨 (구분2) */
export type NeisAuditStatusLabel = '결석' | '지각' | '조퇴' | '결과';

/** 사유 축 — 공식 3축 + 인정(참고) */
export type NeisAuditReasonAxis = '질병' | '미인정' | '기타' | '인정';

/** 나이스 월별 출결현황의 파싱된 한 행 (M5 파서가 생산) */
export interface NeisAttendanceRow {
  /** YYYY-MM-DD */
  readonly date: string;
  /** 출석번호 */
  readonly number: number;
  readonly name?: string;
  readonly status: NeisAuditStatusLabel;
  /** 사유 원문 (예: '질병', '미인정', '인정', 자유 서술) */
  readonly reason?: string;
  /** 결시교시 원문 (예: '4~7', '조회~종례') — 정규화 후 문자열 비교 */
  readonly periods?: string;
}

/** 쌤핀 담임 출결의 일 단위 대표 엔트리 (호스트가 접기 후 생산) */
export interface SsampinAttendanceEntry {
  /** YYYY-MM-DD */
  readonly date: string;
  readonly number: number;
  readonly name?: string;
  readonly status: NeisAuditStatusLabel;
  readonly reasonAxis: NeisAuditReasonAxis;
  /** 결시교시 표기 (예: '4~7', '조회~종례') */
  readonly periods?: string;
}

export interface AuditMismatch {
  readonly number: number;
  readonly date: string;
  readonly name?: string;
  /** 어떤 항목이 다른가 — status(구분) / periods(교시) / reason(사유 축) */
  readonly field: 'status' | 'periods' | 'reason';
  readonly ssampin: string;
  readonly neis: string;
}

export interface AuditDiff {
  readonly onlyInSsampin: readonly SsampinAttendanceEntry[];
  readonly onlyInNeis: readonly NeisAttendanceRow[];
  readonly mismatch: readonly AuditMismatch[];
}

/**
 * 사유 원문 → 사유 축. '미인정'이 '인정'을 부분 포함하므로 미인정을 먼저 본다.
 * '무단'은 미인정의 옛 표기. 그 외/공란은 '기타'(별표 8 규칙 마: 미기재=기타).
 */
export function deriveReasonAxis(reason?: string): NeisAuditReasonAxis {
  const r = (reason ?? '').trim();
  if (r.includes('미인정') || r.includes('무단')) return '미인정';
  if (r.includes('질병')) return '질병';
  if (r.includes('인정')) return '인정';
  return '기타';
}

/** 교시 표기 정규화 — 공백 제거만 (표기 자체는 M5 파서가 통일) */
function normPeriods(p?: string): string {
  return (p ?? '').replace(/\s+/g, '');
}

const key = (number: number, date: string) => `${number}|${date}`;

/**
 * 쌤핀 대표 엔트리와 나이스 행을 (출석번호, 날짜) 키로 대조한다.
 *
 * 짝짓기: 같은 키에서 양쪽 다 1건뿐이면 그대로 짝(사유 축이 달라도 mismatch로
 * 보고하는 편이 감사에 유용). 여러 건이면 공식↔공식 / 인정↔인정으로 짝짓고,
 * 남는 쪽은 각자의 '한쪽에만 있음' 목록으로 보낸다.
 */
export function compareAttendance(
  ssampinEntries: readonly SsampinAttendanceEntry[],
  neisRows: readonly NeisAttendanceRow[],
): AuditDiff {
  const onlyInSsampin: SsampinAttendanceEntry[] = [];
  const onlyInNeis: NeisAttendanceRow[] = [];
  const mismatch: AuditMismatch[] = [];

  const ssamByKey = new Map<string, SsampinAttendanceEntry[]>();
  for (const e of ssampinEntries) {
    const k = key(e.number, e.date);
    const arr = ssamByKey.get(k);
    if (arr) arr.push(e);
    else ssamByKey.set(k, [e]);
  }
  const neisByKey = new Map<string, NeisAttendanceRow[]>();
  for (const r of neisRows) {
    const k = key(r.number, r.date);
    const arr = neisByKey.get(k);
    if (arr) arr.push(r);
    else neisByKey.set(k, [r]);
  }

  const comparePair = (s: SsampinAttendanceEntry, n: NeisAttendanceRow) => {
    const base = { number: s.number, date: s.date, name: s.name ?? n.name };
    if (s.status !== n.status) {
      mismatch.push({ ...base, field: 'status', ssampin: s.status, neis: n.status });
    }
    const nAxis = deriveReasonAxis(n.reason);
    if (s.reasonAxis !== nAxis) {
      mismatch.push({ ...base, field: 'reason', ssampin: s.reasonAxis, neis: nAxis });
    }
    // 교시는 양쪽 모두 값이 있을 때만 비교(코어 수준 관용 — 없는 쪽은 판단 보류)
    const sp = normPeriods(s.periods);
    const np = normPeriods(n.periods);
    if (sp !== '' && np !== '' && sp !== np) {
      mismatch.push({ ...base, field: 'periods', ssampin: sp, neis: np });
    }
  };

  const allKeys = new Set<string>([...ssamByKey.keys(), ...neisByKey.keys()]);
  for (const k of allKeys) {
    const ss = ssamByKey.get(k) ?? [];
    const nn = neisByKey.get(k) ?? [];

    if (ss.length === 0) {
      onlyInNeis.push(...nn);
      continue;
    }
    if (nn.length === 0) {
      onlyInSsampin.push(...ss);
      continue;
    }
    if (ss.length === 1 && nn.length === 1) {
      comparePair(ss[0]!, nn[0]!);
      continue;
    }

    // 복수 건 — 공식↔공식 / 인정↔인정 클래스별 짝짓기, 잔여는 only 목록
    const ssOfficial = ss.filter((e) => e.reasonAxis !== '인정');
    const ssExcused = ss.filter((e) => e.reasonAxis === '인정');
    const nnOfficial = nn.filter((r) => deriveReasonAxis(r.reason) !== '인정');
    const nnExcused = nn.filter((r) => deriveReasonAxis(r.reason) === '인정');
    for (const [sArr, nArr] of [
      [ssOfficial, nnOfficial],
      [ssExcused, nnExcused],
    ] as const) {
      const len = Math.min(sArr.length, nArr.length);
      for (let i = 0; i < len; i += 1) comparePair(sArr[i]!, nArr[i]!);
      onlyInSsampin.push(...sArr.slice(len));
      onlyInNeis.push(...nArr.slice(len));
    }
  }

  return { onlyInSsampin, onlyInNeis, mismatch };
}
