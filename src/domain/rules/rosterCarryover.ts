/**
 * rosterCarryover — 학생 승계(S4.3) 순수 계획 규칙.
 *
 * 아카이브의 students.json(과거 앱 버전 파일 — 관대 파싱)에서 담임 연속 케이스의
 * "명렬 가져오기" 입력(ImportReadyStudent[])을 만든다.
 *
 *  - **자동 연결 금지**(S4.3 AC — 잘못된 매칭 = 개인정보 오병합): 이 모듈은 목록만
 *    만들고, 적용은 반드시 명시 버튼 + 확인을 거쳐 rosterImportPlan.planImport →
 *    applyImportPlan(기존 참조 보존)으로만 수행한다.
 *  - 비활성 학생(전출·휴학 등)은 승계 대상에서 제외하고 개수만 보고한다 —
 *    새 학년도에 재적하지 않는 학생을 되살리지 않는다.
 */

import type { ImportReadyStudent } from './rosterImportRules';

export interface RosterCarryoverPlan {
  /** 승계 가능한(재학 상태) 학생 — 번호 오름차순. */
  readonly importable: readonly ImportReadyStudent[];
  /** 비활성(전출·휴학 등)으로 제외된 학생 수 — 확인 문구에 표기한다. */
  readonly excludedInactive: number;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** 아카이브 students.json 원문(unknown) → 승계 계획. 절대 throw하지 않는다. */
export function planRosterCarryover(raw: unknown): RosterCarryoverPlan {
  const root = asRecord(raw);
  const list = Array.isArray(raw) ? raw : Array.isArray(root?.['students']) ? root['students'] : [];

  interface Row {
    readonly student: Omit<ImportReadyStudent, 'studentNumber'>;
    readonly number: number | null;
  }

  const rows: Row[] = [];
  let excludedInactive = 0;
  for (const v of list) {
    const rec = asRecord(v);
    if (!rec) continue;
    const name = str(rec['name']).trim();
    if (!name) continue;
    const status = str(rec['status']);
    if (status !== '' && status !== 'active') {
      excludedInactive += 1;
      continue;
    }
    const numberRaw = rec['studentNumber'];
    rows.push({
      student: {
        name,
        phone: str(rec['phone']),
        parentPhone: str(rec['parentPhone']),
        parentPhoneLabel: str(rec['parentPhoneLabel']),
        parentPhone2: str(rec['parentPhone2']),
        parentPhone2Label: str(rec['parentPhone2Label']),
        birthDate: str(rec['birthDate']),
        isVacant: rec['isVacant'] === true,
      },
      number:
        typeof numberRaw === 'number' && Number.isFinite(numberRaw) && numberRaw > 0
          ? numberRaw
          : null,
    });
  }

  // 번호 부재 학생은 기존 최대 번호 다음부터 이어 붙인다(번호 0·중복 주입 방지 —
  // planImport의 학번 매칭이 번호 충돌로 오판하지 않게 한다).
  let maxNumber = 0;
  for (const r of rows) {
    if (r.number !== null && r.number > maxNumber) maxNumber = r.number;
  }
  const importable: ImportReadyStudent[] = rows.map((r) => {
    const studentNumber = r.number ?? ++maxNumber;
    return { ...r.student, studentNumber };
  });
  importable.sort((a, b) => a.studentNumber - b.studentNumber);

  return { importable, excludedInactive };
}
