/**
 * 교직원 연락처 엑셀 가져오기 규칙 — 순수 로직 (외부 의존 없음).
 *
 * 엑셀 파일을 직접 읽지 않는다. 파일 읽기는 infrastructure가 맡고,
 * 여기서는 이미 **글자 표(2차원 배열)** 로 바뀐 값만 다룬다.
 * 덕분에 엑셀 라이브러리 없이도 규칙을 전부 시험해 볼 수 있다.
 *
 * domain 레이어이므로 외부 의존성을 import 하지 않는다.
 */
import type { StaffContact } from '../entities/StaffContact';
import { normalizePhoneDigits } from './contactRules';

/** 엑셀에서 받아올 수 있는 항목 */
export type StaffField =
  | 'name'
  | 'position'
  | 'department'
  | 'subject'
  | 'homeroom'
  | 'mobile'
  | 'officePhone'
  | 'email'
  | 'memo';

/** 우리가 제공하는 빈 양식의 표준 머리글 — 내보내기와 가져오기가 같은 이름을 쓴다. */
export const STAFF_IMPORT_HEADERS: Record<StaffField, string> = {
  name: '이름',
  position: '직위',
  department: '부서',
  subject: '담당과목',
  homeroom: '담임학급',
  mobile: '휴대폰',
  officePhone: '내선번호',
  email: '이메일',
  memo: '메모',
};

/** 양식 열 순서 (내보내기·양식 생성이 이 순서를 따른다) */
export const STAFF_IMPORT_FIELD_ORDER: readonly StaffField[] = [
  'name',
  'position',
  'department',
  'subject',
  'homeroom',
  'mobile',
  'officePhone',
  'email',
  'memo',
];

/**
 * 머리글 자동 인식 표.
 *
 * 학교마다 쓰는 말이 달라서(“연락처”/“전화번호”/“휴대전화”) 넉넉하게 받아 준다.
 * 공백은 미리 지우고 맞춰 보므로 "휴 대 폰"도 걸린다.
 */
const HEADER_PATTERNS: Record<StaffField, RegExp> = {
  name: /^(이름|성명|교사명|교직원명|name)$/i,
  position: /^(직위|직급|직책|position)$/i,
  department: /^(부서|소속|소속부서|department|dept)$/i,
  subject: /^(담당과목|담당교과|교과목|과목|교과|subject)$/i,
  homeroom: /^(담임|담임학급|학급|반|homeroom)$/i,
  mobile: /^(휴대폰|휴대전화|핸드폰|휴대폰번호|연락처|전화|전화번호|mobile|phone)$/i,
  officePhone: /^(내선|내선번호|사무실|사무실번호|교무실|office|ext)$/i,
  email: /^(이메일|메일|email|e-mail)$/i,
  memo: /^(메모|비고|특이사항|memo|note|remarks)$/i,
};

export interface StaffRowIssue {
  readonly field: StaffField | null;
  readonly message: string;
  readonly severity: 'error' | 'warning';
}

export interface StaffImportRow {
  /** 엑셀에서 보이는 실제 행 번호(1부터) — 오류 안내에 그대로 쓴다. */
  readonly rowNumber: number;
  readonly values: Readonly<Record<StaffField, string>>;
  readonly issues: readonly StaffRowIssue[];
  /** 오류(error)가 없어 실제로 등록할 수 있는 행인지 */
  readonly importable: boolean;
}

export interface StaffImportResult {
  /** 머리글을 찾은 행 번호(1부터). 못 찾으면 -1. */
  readonly headerRowNumber: number;
  /** 인식된 항목 → 열 위치 */
  readonly columns: Readonly<Partial<Record<StaffField, number>>>;
  /** 인식하지 못해 무시한 머리글 (사용자에게 "이 열은 안 가져옵니다"로 알린다) */
  readonly ignoredHeaders: readonly string[];
  readonly rows: readonly StaffImportRow[];
  readonly summary: {
    readonly total: number;
    readonly importable: number;
    readonly errorRows: number;
    readonly warningRows: number;
  };
}

/** 머리글을 찾을 때 훑어볼 최대 행 수 — 제목·안내 문구가 위에 몇 줄 있는 양식이 흔하다. */
const HEADER_SCAN_LIMIT = 20;

function squash(v: string): string {
  return v.replace(/\s+/g, '').trim();
}

/** 머리글 한 칸이 어떤 항목인지 알아본다. 모르면 null. */
export function detectStaffField(headerCell: string): StaffField | null {
  const key = squash(headerCell);
  if (key === '') return null;
  for (const field of STAFF_IMPORT_FIELD_ORDER) {
    if (HEADER_PATTERNS[field].test(key)) return field;
  }
  return null;
}

/**
 * 머리글 행을 찾는다. **이름 열이 있는 행**을 머리글로 본다 —
 * 이름은 유일한 필수 항목이라 이게 없으면 어차피 가져올 수 없다.
 * 못 찾으면 -1.
 */
export function findStaffHeaderRow(grid: readonly (readonly string[])[]): number {
  const limit = Math.min(grid.length, HEADER_SCAN_LIMIT);
  for (let i = 0; i < limit; i++) {
    const row = grid[i];
    if (!row) continue;
    if (row.some((cell) => detectStaffField(cell) === 'name')) return i;
  }
  return -1;
}

/** 머리글 행에서 항목 → 열 위치를 뽑는다. 같은 항목이 두 번 나오면 **앞쪽 열**을 쓴다. */
export function detectStaffColumns(headerCells: readonly string[]): {
  columns: Partial<Record<StaffField, number>>;
  ignoredHeaders: string[];
} {
  const columns: Partial<Record<StaffField, number>> = {};
  const ignoredHeaders: string[] = [];

  headerCells.forEach((cell, index) => {
    const text = cell.trim();
    if (text === '') return;
    const field = detectStaffField(text);
    if (field === null) {
      ignoredHeaders.push(text);
      return;
    }
    if (columns[field] === undefined) columns[field] = index;
  });

  return { columns, ignoredHeaders };
}

/** 전화번호로 인정할 자릿수 — 내선(3자리)부터 휴대폰(11자리)까지. */
const MIN_PHONE_DIGITS = 3;
const MAX_PHONE_DIGITS = 11;

function checkPhone(field: StaffField, raw: string, label: string): StaffRowIssue | null {
  if (raw === '') return null;
  const digits = normalizePhoneDigits(raw);
  if (digits.length === 0) {
    return { field, message: `${label}에 숫자가 없습니다`, severity: 'warning' };
  }
  if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS) {
    return {
      field,
      message: `${label} 자릿수가 이상합니다 (${digits.length}자리)`,
      severity: 'warning',
    };
  }
  return null;
}

/** 아주 느슨한 이메일 확인 — 오타를 잡아주되 등록을 막지는 않는다. */
function checkEmail(raw: string): StaffRowIssue | null {
  if (raw === '') return null;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return null;
  return { field: 'email', message: '이메일 형식이 아닙니다', severity: 'warning' };
}

const EMPTY_VALUES: Readonly<Record<StaffField, string>> = {
  name: '',
  position: '',
  department: '',
  subject: '',
  homeroom: '',
  mobile: '',
  officePhone: '',
  email: '',
  memo: '',
};

/** 행 전체가 비었는지 — 엑셀 아래쪽 빈 줄을 오류로 세지 않기 위해. */
function isBlankRow(cells: readonly string[]): boolean {
  return cells.every((c) => c.trim() === '');
}

/**
 * 빈 양식에 넣어 두는 예시 줄의 이름 앞머리.
 *
 * 양식에 "홍길동 / 부장 / 3학년부" 같은 예시가 있으면 처음 쓰는 사람이 훨씬 쉽지만,
 * 그 줄을 **안 지우고 그대로 올리는 일이 반드시 생긴다.** 그러면 있지도 않은
 * 교직원이 명부에 등록된다. 그래서 이 표시가 붙은 줄은 아예 읽지 않는다.
 */
export const EXAMPLE_ROW_PREFIX = '(예시)';

/** 양식의 예시 줄인지 — 이름 칸이 "(예시)"로 시작하면 예시로 본다. */
export function isExampleRow(values: Readonly<Record<StaffField, string>>): boolean {
  return values.name.trim().startsWith(EXAMPLE_ROW_PREFIX);
}

/**
 * 글자 표를 훑어 등록 후보 행 목록을 만든다.
 *
 * 여기서는 **아무것도 저장하지 않는다.** 사용자가 미리 보고 확인을 누른 뒤에야
 * toStaffContacts()로 실제 연락처를 만든다.
 */
export function parseStaffContactGrid(grid: readonly (readonly string[])[]): StaffImportResult {
  const headerIndex = findStaffHeaderRow(grid);
  if (headerIndex === -1) {
    return {
      headerRowNumber: -1,
      columns: {},
      ignoredHeaders: [],
      rows: [],
      summary: { total: 0, importable: 0, errorRows: 0, warningRows: 0 },
    };
  }

  const { columns, ignoredHeaders } = detectStaffColumns(grid[headerIndex] ?? []);
  const rows: StaffImportRow[] = [];
  /** 이름+휴대폰이 같은 줄이 파일 안에 두 번 있으면 뒤엣것에 경고를 붙인다. */
  const seen = new Set<string>();

  for (let i = headerIndex + 1; i < grid.length; i++) {
    const cells = grid[i] ?? [];
    if (isBlankRow(cells)) continue;

    const values: Record<StaffField, string> = { ...EMPTY_VALUES };
    for (const field of STAFF_IMPORT_FIELD_ORDER) {
      const col = columns[field];
      if (col === undefined) continue;
      values[field] = (cells[col] ?? '').trim();
    }

    // 양식에 딸려 온 예시 줄은 없는 셈 친다 (사용자가 지우지 않아도 안전하도록).
    if (isExampleRow(values)) continue;

    const issues: StaffRowIssue[] = [];

    if (values.name === '') {
      issues.push({ field: 'name', message: '이름이 비어 있습니다', severity: 'error' });
    }
    if (values.mobile === '' && values.officePhone === '' && values.email === '') {
      issues.push({
        field: null,
        message: '휴대폰·내선·이메일이 모두 비어 있습니다',
        severity: 'warning',
      });
    }

    const mobileIssue = checkPhone('mobile', values.mobile, '휴대폰');
    if (mobileIssue) issues.push(mobileIssue);
    const officeIssue = checkPhone('officePhone', values.officePhone, '내선번호');
    if (officeIssue) issues.push(officeIssue);
    const emailIssue = checkEmail(values.email);
    if (emailIssue) issues.push(emailIssue);

    if (values.name !== '') {
      const key = `${values.name}|${normalizePhoneDigits(values.mobile)}`;
      if (seen.has(key)) {
        issues.push({
          field: null,
          message: '파일 안에 같은 사람이 또 있습니다',
          severity: 'warning',
        });
      }
      seen.add(key);
    }

    rows.push({
      rowNumber: i + 1,
      values,
      issues,
      importable: !issues.some((issue) => issue.severity === 'error'),
    });
  }

  return {
    headerRowNumber: headerIndex + 1,
    columns,
    ignoredHeaders,
    rows,
    summary: {
      total: rows.length,
      importable: rows.filter((r) => r.importable).length,
      errorRows: rows.filter((r) => !r.importable).length,
      warningRows: rows.filter(
        (r) => r.importable && r.issues.some((issue) => issue.severity === 'warning'),
      ).length,
    },
  };
}

/** 빈 문자열은 저장하지 않는다 — 없는 항목은 아예 자리를 만들지 않는다. */
function omitEmpty(v: string): string | undefined {
  const t = v.trim();
  return t === '' ? undefined : t;
}

export interface ToStaffContactsOptions {
  /** id 만들기 — domain은 crypto를 쓸 수 없으므로 바깥에서 넣어 준다. */
  readonly makeId: (index: number) => string;
  /** 생성 시각 (ISO 8601) */
  readonly now: string;
}

/** 빈 항목은 자리 자체를 만들지 않는 선택 항목 목록 (name은 필수라 제외). */
type OptionalStaffField = Exclude<StaffField, 'name'>;

const OPTIONAL_FIELDS: readonly OptionalStaffField[] = [
  'position',
  'department',
  'subject',
  'homeroom',
  'mobile',
  'officePhone',
  'email',
  'memo',
];

/**
 * 확인을 마친 행들을 실제 연락처로 바꾼다. 오류 행은 조용히 건너뛴다.
 *
 * 빈 칸은 `position: undefined`처럼 **자리만 남기지 않고 아예 만들지 않는다.**
 * 빈 자리가 남으면 저장 파일이 지저분해지고, 동기화가 "바뀌었다"고 잘못 볼 수 있다.
 */
export function toStaffContacts(
  rows: readonly StaffImportRow[],
  options: ToStaffContactsOptions,
): StaffContact[] {
  return rows
    .filter((r) => r.importable)
    .map((r, index) => {
      const optional: Partial<Record<OptionalStaffField, string>> = {};
      for (const field of OPTIONAL_FIELDS) {
        const value = omitEmpty(r.values[field]);
        if (value !== undefined) optional[field] = value;
      }
      return {
        id: options.makeId(index),
        name: r.values.name.trim(),
        createdAt: options.now,
        ...optional,
      };
    });
}

/** 이미 있는 연락처와 어떻게 합칠지 */
export type StaffImportMode =
  /** 기존 목록 뒤에 더한다. 같은 사람(이름+휴대폰)은 새 값으로 덮어쓴다. */
  | 'merge'
  /** 기존 목록을 버리고 파일 내용으로 통째로 바꾼다. */
  | 'replace';

/**
 * 같은 사람인지 판정하는 열쇠 — 이름과 휴대폰이 모두 같아야 같은 사람으로 본다.
 *
 * ★휴대폰이 비어 있으면 같은 사람으로 판정하지 않는다 (2026-08-24 UltraQA) —
 * 휴대폰을 안 적는 학교(내선만 쓰는 경우가 흔하다)에서 열쇠가 `"김철수|"` 로 겹쳐,
 * 기존 동명이인 두 명이 병합 한 번에 한 명으로 **조용히 소실**됐다. 빈 휴대폰은
 * id 를 열쇠에 넣어 각자 고유하게 남긴다(대가: 휴대폰 없는 같은 사람은 중복 등록될 수
 * 있지만, 중복은 눈에 보이고 소실은 보이지 않는다).
 */
function identityKey(c: StaffContact): string {
  const phone = normalizePhoneDigits(c.mobile ?? '');
  if (phone === '') return `__uniq:${c.id}`;
  return `${c.name.trim()}|${phone}`;
}

/**
 * 가져온 연락처를 기존 목록에 반영한다.
 *
 * merge에서 같은 사람을 만나면 **기존 id와 만든 날짜는 지키고 내용만 갱신**한다.
 * id가 바뀌면 즐겨찾기 같은 다른 표시가 끊기기 때문이다.
 */
export function mergeStaffContacts(
  existing: readonly StaffContact[],
  incoming: readonly StaffContact[],
  mode: StaffImportMode,
  now: string,
): StaffContact[] {
  if (mode === 'replace') return [...incoming];

  const byKey = new Map<string, StaffContact>();
  const order: string[] = [];

  for (const c of existing) {
    const key = identityKey(c);
    if (!byKey.has(key)) order.push(key);
    byKey.set(key, c);
  }

  for (const c of incoming) {
    const key = identityKey(c);
    const prev = byKey.get(key);
    if (prev === undefined) {
      order.push(key);
      byKey.set(key, c);
      continue;
    }
    byKey.set(key, {
      ...c,
      id: prev.id,
      createdAt: prev.createdAt,
      favorite: prev.favorite,
      group: c.group ?? prev.group,
      updatedAt: now,
    });
  }

  return order.map((key) => byKey.get(key)).filter((c): c is StaffContact => c !== undefined);
}
