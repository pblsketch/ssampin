/**
 * 온라인 교무실 M4 — 서버 인가 로직 테스트
 *
 * vitest.config.ts 의 include 가 `src/**` 와 `electron/**` 뿐이라
 * `supabase/functions/**` 아래 테스트는 CI 에서 돌지 않는다. 순수 함수만 상대경로로
 * 불러와 여기서 검증한다.
 *
 * ★ 이 파일의 절반은 **화면과 서버가 같은 값을 쓰는지** 확인하는 것이다.
 *   한쪽만 고치면 "화면에서는 되는데 저장이 안 되는" 상태가 조용히 생긴다.
 */
import { describe, it, expect } from 'vitest';
import {
  canDeleteModule,
  canEditRoomItem,
  canManageModules,
  canToggleTaskDone,
  checkText,
  emptyToNull,
  isDateString,
  isTimeString,
  MAX_MODULES,
  MODULE_KINDS,
  MODULE_NAME_MAX_LENGTH,
  normalizeAssignee,
  ROOM_TITLE_MAX_LENGTH,
  STANCES,
  type AccessMember,
} from '../../../../supabase/functions/_shared/staffroomAccess';
import {
  STAFFROOM_MAX_MODULES,
  STAFFROOM_MODULE_NAME_MAX_LENGTH,
  STAFFROOM_ROOM_TITLE_MAX_LENGTH,
} from '@domain/entities/StaffRoomRooms';
import { isDateString as clientIsDateString } from '@domain/rules/staffRoomRoomRules';

const ADMIN: AccessMember = { id: 'm1', email: 'admin@school.kr', role: 'admin' };
const MEMBER: AccessMember = { id: 'm2', email: 'kim@school.kr', role: 'member' };
const OTHER: AccessMember = { id: 'm3', email: 'lee@school.kr', role: 'member' };
const MEMBERS = [ADMIN, MEMBER, OTHER];

describe('★ 화면과 서버가 같은 값을 쓴다', () => {
  it('공간 개수 상한이 같다', () => {
    expect(MAX_MODULES).toBe(STAFFROOM_MAX_MODULES);
  });

  it('공간 이름 길이 상한이 같다', () => {
    expect(MODULE_NAME_MAX_LENGTH).toBe(STAFFROOM_MODULE_NAME_MAX_LENGTH);
  });

  it('제목 길이 상한이 같다', () => {
    expect(ROOM_TITLE_MAX_LENGTH).toBe(STAFFROOM_ROOM_TITLE_MAX_LENGTH);
  });

  it('★ 날짜 판정이 양쪽에서 똑같이 동작한다', () => {
    // 한쪽만 UTC 로 고치면 "화면에서는 되는데 저장이 안 되는" 상태가 된다.
    for (const sample of ['2026-08-21', '2026-02-28', '2026-02-31', '2026-13-01', '2026-8-1']) {
      expect(isDateString(sample)).toBe(clientIsDateString(sample));
    }
  });
});

describe('공간(모듈) 관리 — 관리자만 (계획서 §6)', () => {
  it('관리자는 할 수 있다', () => {
    expect(canManageModules(MEMBERS, ADMIN.email).ok).toBe(true);
  });

  it('일반 멤버는 못 한다', () => {
    expect(canManageModules(MEMBERS, MEMBER.email)).toEqual({ ok: false, reason: 'not_admin' });
  });

  it('멤버가 아니면 부서가 있는지조차 알려주지 않는다', () => {
    expect(canManageModules(MEMBERS, 'outsider@other.kr')).toEqual({
      ok: false,
      reason: 'not_member',
    });
  });

  it('만들 수 있는 공간 종류가 다섯이다', () => {
    expect([...MODULE_KINDS].sort()).toEqual(
      ['archive', 'board', 'discussion', 'gallery', 'minutes'].sort(),
    );
  });
});

describe('공간 삭제 — 마지막 게시판·자료실은 못 지운다', () => {
  const modules = [
    { id: 'b1', kind: 'board' },
    { id: 'a1', kind: 'archive' },
    { id: 'g1', kind: 'gallery' },
  ];

  it('★ 마지막 게시판은 막는다 — 지우면 안에 있던 글이 함께 사라진다', () => {
    const result = canDeleteModule(modules, 'b1');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('막혔어야 한다');
    expect(result.message).toContain('게시판');
  });

  it('★ 마지막 자료실도 막는다', () => {
    expect(canDeleteModule(modules, 'a1').ok).toBe(false);
  });

  it('갤러리는 하나뿐이어도 지울 수 있다', () => {
    expect(canDeleteModule(modules, 'g1').ok).toBe(true);
  });

  it('게시판이 둘이면 하나는 지울 수 있다', () => {
    expect(canDeleteModule([...modules, { id: 'b2', kind: 'board' }], 'b1').ok).toBe(true);
  });

  it('없는 공간은 막는다', () => {
    expect(canDeleteModule(modules, '없음').ok).toBe(false);
  });
});

describe('안건·회의록 고치기 — 쓴 사람 또는 관리자', () => {
  it('쓴 본인은 할 수 있다', () => {
    expect(canEditRoomItem(MEMBERS, MEMBER.email, MEMBER.email).ok).toBe(true);
  });

  it('관리자는 남의 것도 할 수 있다', () => {
    expect(canEditRoomItem(MEMBERS, ADMIN.email, MEMBER.email).ok).toBe(true);
  });

  it('남의 것을 일반 멤버가 고칠 수는 없다', () => {
    expect(canEditRoomItem(MEMBERS, MEMBER.email, OTHER.email)).toEqual({
      ok: false,
      reason: 'not_author',
    });
  });
});

describe('업무 끝냄 표시 (계획서 §8-B)', () => {
  it('★ 맡은 본인이 표시한다', () => {
    expect(canToggleTaskDone(MEMBERS, MEMBER.email, MEMBER.email).ok).toBe(true);
  });

  it('★ 남의 일을 끝났다고 표시할 수 없다 — 안 끝난 일이 목록에서 사라진다', () => {
    expect(canToggleTaskDone(MEMBERS, MEMBER.email, OTHER.email)).toEqual({
      ok: false,
      reason: 'not_author',
    });
  });

  it('아직 아무도 안 맡은 일은 누구나 집어 갈 수 있다', () => {
    expect(canToggleTaskDone(MEMBERS, MEMBER.email, null).ok).toBe(true);
  });

  it('관리자는 다 할 수 있다', () => {
    expect(canToggleTaskDone(MEMBERS, ADMIN.email, OTHER.email).ok).toBe(true);
  });
});

describe('담당자 지정 — 이 부서 멤버만', () => {
  it('멤버면 정규화해서 받는다', () => {
    expect(normalizeAssignee(MEMBERS, '  KIM@School.kr ')).toBe('kim@school.kr');
  });

  it('★ 부서 밖 사람은 담당자로 넣을 수 없다', () => {
    expect(normalizeAssignee(MEMBERS, 'outsider@other.kr')).toBeNull();
  });

  it('비우면 null — "누가 할까요"를 적어 둘 자리', () => {
    expect(normalizeAssignee(MEMBERS, '')).toBeNull();
    expect(normalizeAssignee(MEMBERS, null)).toBeNull();
  });
});

describe('글자·날짜 검사', () => {
  it('앞뒤 공백을 다듬는다', () => {
    expect(checkText('  안건  ', 100, '제목')).toEqual({ ok: true, value: '안건' });
  });

  it('비면 무엇을 입력하라고 알려준다', () => {
    const result = checkText('  ', 100, '제목');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('막혔어야 한다');
    expect(result.message).toContain('제목');
  });

  it('길이 상한을 넘기면 막는다 (경계값)', () => {
    expect(checkText('가'.repeat(100), 100, '제목').ok).toBe(true);
    expect(checkText('가'.repeat(101), 100, '제목').ok).toBe(false);
  });

  it('★ 없는 날짜를 걸러낸다', () => {
    expect(isDateString('2026-08-21')).toBe(true);
    expect(isDateString('2026-02-31')).toBe(false);
    expect(isDateString('2026-13-01')).toBe(false);
  });

  it('24시간 시각만 받는다', () => {
    expect(isTimeString('14:30')).toBe(true);
    expect(isTimeString('24:00')).toBe(false);
    expect(isTimeString('9:05')).toBe(false);
  });

  it('빈 입력칸은 "없음"으로 본다', () => {
    expect(emptyToNull('')).toBeNull();
    expect(emptyToNull('   ')).toBeNull();
    expect(emptyToNull(' 14:30 ')).toBe('14:30');
  });

  it('낼 수 있는 뜻이 셋이다', () => {
    expect([...STANCES].sort()).toEqual(['abstain', 'agree', 'disagree']);
  });
});
