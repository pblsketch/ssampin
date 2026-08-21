/**
 * 연락처 공통 규칙 — 전화번호 표기, 검색 매칭, 목록 정렬.
 *
 * 화면(교직원 탭·학생 탭·보호자 탭)이 셋으로 나뉘어도 "번호를 어떻게 보여주고,
 * 무엇으로 찾을 수 있는가"는 한 곳에서만 정한다.
 *
 * domain 레이어이므로 외부 의존성을 import 하지 않는다.
 */
import type { Student } from '../entities/Student';
import type { StaffContact } from '../entities/StaffContact';
import { isChosungQuery, toChosungString } from '../services/hangulSearch';

// ─────────────────────────────────────────────────────────────
// 전화번호 표기
// ─────────────────────────────────────────────────────────────

/** 숫자만 남긴다. "010-1234-5678" → "01012345678" */
export function normalizePhoneDigits(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * 사람이 읽기 좋은 형태로 끊어 준다.
 *
 * 자릿수로만 판단하고, 규칙에 맞지 않으면 **원본을 그대로 돌려준다**.
 * 교무실 내선("1234")이나 해외 번호처럼 우리가 모르는 형태를 억지로
 * 바꿔 놓으면 오히려 잘못된 번호로 보이기 때문이다.
 */
export function formatPhoneNumber(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === '') return '';

  const d = normalizePhoneDigits(trimmed);
  if (d === '') return trimmed;

  // 서울(02)은 국번이 3자리 또는 4자리 둘 다 쓰인다.
  if (d.startsWith('02')) {
    if (d.length === 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
    if (d.length === 10) return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}`;
    return trimmed;
  }

  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  // 지역번호 없는 시내 번호 (예: 12345678 → 1234-5678)
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4)}`;

  return trimmed;
}

/** `tel:` 링크에 넣을 값. 숫자가 하나도 없으면 null(= 걸 수 없는 번호). */
export function telHref(raw: string | undefined): string | null {
  if (!raw) return null;
  const d = normalizePhoneDigits(raw);
  return d === '' ? null : `tel:${d}`;
}

// ─────────────────────────────────────────────────────────────
// 검색
// ─────────────────────────────────────────────────────────────

/**
 * 번호 검색으로 쳐 주는 최소 숫자 개수.
 *
 * 1자리까지 번호로 취급하면 "3"이 온갖 번호에 걸려 검색이 무의미해진다.
 * 반대로 너무 높이면 내선 앞자리 검색이 막힌다.
 */
const MIN_PHONE_QUERY_DIGITS = 2;

/**
 * 연락처 한 건이 검색어에 걸리는지 판정한다.
 *
 * 글자 항목을 먼저 보고, 거기서 못 찾으면 번호를 본다. 둘을 함께 보는 이유는
 * 담임 학급 "2-4"처럼 **숫자와 하이픈으로 된 글자**가 실제로 쓰이기 때문이다.
 * 번호로만 판정하면 "2-4"가 전화번호로 오인돼 아무것도 못 찾는다.
 *
 * - 초성으로 검색하면 이름·부서의 초성과 맞춘다. ("ㄱㅁㅎ" → 김민호)
 * - 번호는 하이픈을 넣든 빼든 같게 본다. ("010-1234" = "0101234")
 * - 영문 대소문자는 구분하지 않는다.
 *
 * @param textFields 이름·부서·직위·메모 등 글자 항목
 * @param phoneFields 휴대폰·내선 등 번호 항목
 */
export function matchesContactQuery(
  textFields: readonly (string | undefined)[],
  phoneFields: readonly (string | undefined)[],
  rawQuery: string,
): boolean {
  const q = rawQuery.trim();
  if (q === '') return true;

  const lower = q.toLowerCase();
  const chosung = isChosungQuery(q);

  const textHit = textFields.some((f) => {
    if (f === undefined || f === '') return false;
    if (f.toLowerCase().includes(lower)) return true;
    return chosung && toChosungString(f).includes(q);
  });
  if (textHit) return true;

  const qd = normalizePhoneDigits(q);
  if (qd.length < MIN_PHONE_QUERY_DIGITS) return false;
  return phoneFields.some((p) => p !== undefined && normalizePhoneDigits(p).includes(qd));
}

// ─────────────────────────────────────────────────────────────
// 통합 목록 (교직원 + 학생 + 보호자)
// ─────────────────────────────────────────────────────────────

export type ContactKind = 'staff' | 'student' | 'guardian';

/** 화면이 그대로 그릴 수 있게 다듬어 둔 연락처 한 줄. */
export interface ContactEntry {
  /** 목록 key. 출처가 달라도 겹치지 않도록 종류를 앞에 붙인다. */
  readonly key: string;
  readonly kind: ContactKind;
  /** 표시 이름 (보호자는 "홍길동 어머니"처럼 학생 이름을 함께 보여준다) */
  readonly name: string;
  /** 이름 아래 회색 줄 — 부서·직위 또는 학번 */
  readonly subtitle: string;
  readonly phone?: string;
  readonly email?: string;
  readonly favorite: boolean;
  /** 원본 식별자 — 눌렀을 때 교직원 편집/학생 상세로 이동하는 데 쓴다. */
  readonly sourceId: string;
}

/** 이름 앞뒤 공백만 있는 값은 없는 것으로 본다. */
function clean(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t === '' ? undefined : t;
}

export function staffToEntry(c: StaffContact): ContactEntry {
  const subtitleParts = [clean(c.department), clean(c.position), clean(c.subject)].filter(
    (v): v is string => v !== undefined,
  );
  return {
    key: `staff:${c.id}`,
    kind: 'staff',
    name: c.name,
    subtitle: subtitleParts.join(' · '),
    phone: clean(c.mobile) ?? clean(c.officePhone),
    email: clean(c.email),
    favorite: c.favorite === true,
    sourceId: c.id,
  };
}

/** 학생 본인 연락처 — 번호가 없으면 목록에 넣지 않는다. */
export function studentToEntry(s: Student): ContactEntry | null {
  const phone = clean(s.phone);
  if (phone === undefined) return null;
  return {
    key: `student:${s.id}`,
    kind: 'student',
    name: s.name,
    subtitle: s.studentNumber !== undefined ? `${s.studentNumber}` : '학생',
    phone,
    favorite: false,
    sourceId: s.id,
  };
}

/** 보호자 연락처 — 한 학생에게 최대 2명. 번호가 있는 것만 만든다. */
export function guardianEntriesOf(s: Student): ContactEntry[] {
  const out: ContactEntry[] = [];
  const slots: { phone?: string; label?: string; slot: 1 | 2 }[] = [
    { phone: clean(s.parentPhone), label: clean(s.parentPhoneLabel), slot: 1 },
    { phone: clean(s.parentPhone2), label: clean(s.parentPhone2Label), slot: 2 },
  ];

  for (const { phone, label, slot } of slots) {
    if (phone === undefined) continue;
    out.push({
      key: `guardian:${s.id}:${slot}`,
      kind: 'guardian',
      name: label !== undefined ? `${s.name} ${label}` : `${s.name} 보호자${slot}`,
      subtitle: s.studentNumber !== undefined ? `${s.studentNumber}` : '보호자',
      phone,
      favorite: false,
      sourceId: s.id,
    });
  }
  return out;
}

/**
 * 목록 정렬 — 즐겨찾기가 위로, 그 다음 이름 가나다순.
 *
 * localeCompare('ko')를 쓰면 "강"·"김"·"박" 순서가 한국어 사전 순으로 맞는다.
 */
export function sortContactEntries(entries: readonly ContactEntry[]): ContactEntry[] {
  return [...entries].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    return a.name.localeCompare(b.name, 'ko');
  });
}

/** 검색어로 걸러낸 뒤 정렬까지 마친 목록을 돌려준다. */
export function filterContactEntries(
  entries: readonly ContactEntry[],
  query: string,
): ContactEntry[] {
  const matched = entries.filter((e) =>
    matchesContactQuery([e.name, e.subtitle, e.email], [e.phone], query),
  );
  return sortContactEntries(matched);
}

/** 교직원 원본을 검색할 때는 메모·이메일까지 포함해 폭넓게 찾는다. */
export function filterStaffContacts(
  contacts: readonly StaffContact[],
  query: string,
): StaffContact[] {
  return contacts.filter((c) =>
    matchesContactQuery(
      [c.name, c.department, c.position, c.subject, c.homeroom, c.email, c.memo],
      [c.mobile, c.officePhone],
      query,
    ),
  );
}
