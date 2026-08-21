import { describe, it, expect } from 'vitest';
import {
  canAddModule,
  canCloseDiscussion,
  canDeleteModule,
  canEditEvent,
  canEditTask,
  canManageModules,
  canToggleTaskDone,
  canVote,
  checkEvent,
  checkModuleName,
  checkRoomTitle,
  checkTask,
  checkVoteComment,
  defaultModuleName,
  eventCoversDate,
  isDateString,
  isStance,
  isTaskOverdue,
  isTimeString,
  tallyLabel,
  tallyTotal,
} from '../staffRoomRoomRules';
import {
  STAFFROOM_MAX_MODULES,
  STAFFROOM_MODULE_NAME_MAX_LENGTH,
  STAFFROOM_ROOM_TITLE_MAX_LENGTH,
} from '@domain/entities/StaffRoomRooms';

const ME = 'kim@school.kr';
const OTHER = 'lee@school.kr';

describe('모듈 이름 (계획서 §6 — 종류를 고르고 이름을 자유롭게 붙인다)', () => {
  it('앞뒤 공백을 다듬어 받는다', () => {
    expect(checkModuleName('  공문 보관함  ')).toEqual({ ok: true, value: '공문 보관함' });
  });

  it('빈 이름은 막는다', () => {
    expect(checkModuleName('').ok).toBe(false);
    expect(checkModuleName('   ').ok).toBe(false);
    expect(checkModuleName(null).ok).toBe(false);
  });

  it('너무 긴 이름은 막는다', () => {
    expect(checkModuleName('가'.repeat(STAFFROOM_MODULE_NAME_MAX_LENGTH)).ok).toBe(true);
    expect(checkModuleName('가'.repeat(STAFFROOM_MODULE_NAME_MAX_LENGTH + 1)).ok).toBe(false);
  });

  it('종류별 기본 이름을 준다', () => {
    expect(defaultModuleName('board')).toBe('게시판');
    expect(defaultModuleName('archive')).toBe('자료실');
    expect(defaultModuleName('discussion')).toBe('토론방');
    expect(defaultModuleName('gallery')).toBe('갤러리');
    expect(defaultModuleName('minutes')).toBe('회의록');
  });

  it('모르는 종류에도 이름이 있다', () => {
    expect(defaultModuleName('무언가')).toBe('새 공간');
  });
});

describe('모듈 개수·삭제', () => {
  it('열두 개까지 만들 수 있다 (경계값)', () => {
    expect(canAddModule(STAFFROOM_MAX_MODULES - 1).ok).toBe(true);
    expect(canAddModule(STAFFROOM_MAX_MODULES).ok).toBe(false);
  });

  const modules = [
    { id: 'b1', kind: 'board' },
    { id: 'a1', kind: 'archive' },
    { id: 'd1', kind: 'discussion' },
  ];

  it('★ 마지막 게시판은 지울 수 없다 — 지우면 안에 있던 글이 함께 사라진다', () => {
    const result = canDeleteModule(modules, 'b1');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('막혔어야 한다');
    expect(result.message).toContain('게시판');
  });

  it('★ 마지막 자료실도 지울 수 없다', () => {
    expect(canDeleteModule(modules, 'a1').ok).toBe(false);
  });

  it('게시판이 둘이면 하나는 지울 수 있다', () => {
    const two = [...modules, { id: 'b2', kind: 'board' }];
    expect(canDeleteModule(two, 'b1').ok).toBe(true);
  });

  it('토론방은 하나뿐이어도 지울 수 있다', () => {
    expect(canDeleteModule(modules, 'd1').ok).toBe(true);
  });

  it('없는 모듈은 막는다', () => {
    expect(canDeleteModule(modules, '없음').ok).toBe(false);
  });

  it('공간 관리는 관리자만', () => {
    expect(canManageModules('admin')).toBe(true);
    expect(canManageModules('member')).toBe(false);
    expect(canManageModules(null)).toBe(false);
  });
});

describe('토론방 — 뜻 내기', () => {
  it('찬성·반대·기권만 받는다', () => {
    expect(isStance('agree')).toBe(true);
    expect(isStance('disagree')).toBe(true);
    expect(isStance('abstain')).toBe(true);
    expect(isStance('좋아요')).toBe(false);
    expect(isStance(1)).toBe(false);
  });

  it('마감한 안건에는 못 낸다 — 집계를 보고 뒤집는 걸 막는다', () => {
    expect(canVote(null)).toBe(true);
    expect(canVote('2026-08-21T00:00:00.000Z')).toBe(false);
  });

  it('의견은 비워도 된다 — 강제하면 투표 자체를 안 한다', () => {
    expect(checkVoteComment('')).toEqual({ ok: true, value: '' });
    expect(checkVoteComment(null)).toEqual({ ok: true, value: '' });
    expect(checkVoteComment(undefined)).toEqual({ ok: true, value: '' });
  });

  it('너무 긴 의견은 막는다', () => {
    expect(checkVoteComment('가'.repeat(1001)).ok).toBe(false);
  });

  it('마감은 낸 사람 또는 관리자', () => {
    expect(canCloseDiscussion(ME, 'member', ME)).toBe(true);
    expect(canCloseDiscussion(ME, 'admin', OTHER)).toBe(true);
    expect(canCloseDiscussion(ME, 'member', OTHER)).toBe(false);
    expect(canCloseDiscussion(ME, null, ME)).toBe(false);
  });
});

describe('토론방 — 집계 (계획서 §8-E 활동 포인트 금지)', () => {
  it('참여한 사람 수를 센다', () => {
    expect(tallyTotal({ agree: 3, disagree: 1, abstain: 2 })).toBe(6);
  });

  it('아직 아무도 안 냈으면 그렇게 말한다', () => {
    expect(tallyLabel({ agree: 0, disagree: 0, abstain: 0 }, 10)).toContain('아직 아무도');
  });

  it('숫자를 그대로 보여준다', () => {
    const label = tallyLabel({ agree: 5, disagree: 2, abstain: 1 }, 8);
    expect(label).toContain('찬성 5');
    expect(label).toContain('반대 2');
    expect(label).toContain('기권 1');
  });

  it('★ "1등"·"우세"처럼 이기고 지는 말을 쓰지 않는다', () => {
    // 부서 안의 뜻을 모으는 자리지 승부를 가리는 자리가 아니다.
    const label = tallyLabel({ agree: 9, disagree: 1, abstain: 0 }, 10);
    for (const banned of ['1등', '우세', '승', '패', '순위', '랭킹']) {
      expect(label).not.toContain(banned);
    }
  });

  it('아직 안 낸 사람이 몇인지 알려준다', () => {
    expect(tallyLabel({ agree: 3, disagree: 0, abstain: 0 }, 10)).toContain('7분');
  });

  it('모두 냈으면 남은 사람을 말하지 않는다', () => {
    expect(tallyLabel({ agree: 10, disagree: 0, abstain: 0 }, 10)).not.toContain('아직');
  });
});

describe('제목 검사', () => {
  it('빈 제목은 막는다', () => {
    expect(checkRoomTitle('  ').ok).toBe(false);
  });

  it('100자까지 (경계값)', () => {
    expect(checkRoomTitle('가'.repeat(STAFFROOM_ROOM_TITLE_MAX_LENGTH)).ok).toBe(true);
    expect(checkRoomTitle('가'.repeat(STAFFROOM_ROOM_TITLE_MAX_LENGTH + 1)).ok).toBe(false);
  });
});

describe('날짜·시각 형식', () => {
  it('YYYY-MM-DD 만 받는다', () => {
    expect(isDateString('2026-08-21')).toBe(true);
    expect(isDateString('2026-8-21')).toBe(false);
    expect(isDateString('20260821')).toBe(false);
    expect(isDateString(null)).toBe(false);
  });

  it('★ 없는 날짜를 걸러낸다', () => {
    // Date 가 2026-02-31 을 3월로 굴려 버려서 그냥 두면 통과한다
    expect(isDateString('2026-02-31')).toBe(false);
    expect(isDateString('2026-13-01')).toBe(false);
    expect(isDateString('2026-02-28')).toBe(true);
  });

  it('24시간 시각만 받는다', () => {
    expect(isTimeString('14:30')).toBe(true);
    expect(isTimeString('09:05')).toBe(true);
    expect(isTimeString('24:00')).toBe(false);
    expect(isTimeString('9:05')).toBe(false);
    expect(isTimeString('14:60')).toBe(false);
  });
});

describe('부서 일정 (계획서 §8-B)', () => {
  const base = { title: '2학년부 협의회', startsOn: '2026-08-21', endsOn: null, startTime: null };

  it('제목과 날짜만 있으면 저장된다', () => {
    expect(checkEvent(base)).toEqual({ ok: true });
  });

  it('제목이 없으면 막는다', () => {
    expect(checkEvent({ ...base, title: '' }).ok).toBe(false);
  });

  it('마지막 날이 시작 날보다 앞서면 막는다', () => {
    const result = checkEvent({ ...base, endsOn: '2026-08-20' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('막혔어야 한다');
    expect(result.message).toContain('앞설 수 없습니다');
  });

  it('같은 날은 통과한다 (경계값)', () => {
    expect(checkEvent({ ...base, endsOn: '2026-08-21' }).ok).toBe(true);
  });

  it('시각 형식이 틀리면 예를 들어 알려준다', () => {
    const result = checkEvent({ ...base, startTime: '2시반' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('막혔어야 한다');
    expect(result.message).toContain('14:30');
  });

  it('빈 문자열은 "없음"으로 본다 — 화면 입력칸이 비면 그렇게 온다', () => {
    expect(checkEvent({ ...base, endsOn: '', startTime: '' }).ok).toBe(true);
  });
});

describe('일정 겹쳐 보기 — 어느 날에 뜨는가', () => {
  it('하루짜리는 그날만', () => {
    const e = { startsOn: '2026-08-21', endsOn: null };
    expect(eventCoversDate(e, '2026-08-21')).toBe(true);
    expect(eventCoversDate(e, '2026-08-22')).toBe(false);
  });

  it('★ 여러 날 걸친 일정은 중간 날에도 뜬다', () => {
    const e = { startsOn: '2026-08-21', endsOn: '2026-08-24' };
    expect(eventCoversDate(e, '2026-08-21')).toBe(true);
    expect(eventCoversDate(e, '2026-08-23')).toBe(true);
    expect(eventCoversDate(e, '2026-08-24')).toBe(true);
    expect(eventCoversDate(e, '2026-08-25')).toBe(false);
    expect(eventCoversDate(e, '2026-08-20')).toBe(false);
  });

  it('일정 고치기는 만든 사람 또는 관리자', () => {
    expect(canEditEvent(ME, 'member', ME)).toBe(true);
    expect(canEditEvent(ME, 'admin', OTHER)).toBe(true);
    expect(canEditEvent(ME, 'member', OTHER)).toBe(false);
  });
});

describe('업무 분담 (계획서 §8-B)', () => {
  it('제목만 있으면 만들 수 있다 — 담당·기한은 나중에 정해도 된다', () => {
    expect(checkTask({ title: '체육대회 물품 신청', dueOn: null })).toEqual({ ok: true });
    expect(checkTask({ title: '체육대회 물품 신청', dueOn: '' })).toEqual({ ok: true });
  });

  it('기한 형식이 틀리면 막는다', () => {
    expect(checkTask({ title: '일', dueOn: '내일' }).ok).toBe(false);
  });

  it('★ 맡은 본인이 끝났다고 표시한다', () => {
    expect(canToggleTaskDone(ME, 'member', ME)).toBe(true);
  });

  it('★ 남의 일을 끝났다고 표시할 수 없다 — 안 끝난 일이 목록에서 사라진다', () => {
    expect(canToggleTaskDone(ME, 'member', OTHER)).toBe(false);
  });

  it('아직 아무도 안 맡은 일은 누구나 집어 갈 수 있다', () => {
    expect(canToggleTaskDone(ME, 'member', null)).toBe(true);
  });

  it('관리자는 다 할 수 있다', () => {
    expect(canToggleTaskDone(ME, 'admin', OTHER)).toBe(true);
  });

  it('멤버가 아니면 못 한다', () => {
    expect(canToggleTaskDone(ME, null, null)).toBe(false);
  });

  it('업무 고치기는 만든 사람 또는 관리자', () => {
    expect(canEditTask(ME, 'member', ME)).toBe(true);
    expect(canEditTask(ME, 'member', OTHER)).toBe(false);
  });
});

describe('기한 지남 표시', () => {
  it('기한이 지나면 알린다', () => {
    expect(isTaskOverdue({ dueOn: '2026-08-20', doneAt: null }, '2026-08-21')).toBe(true);
  });

  it('오늘까지는 지난 게 아니다 (경계값)', () => {
    expect(isTaskOverdue({ dueOn: '2026-08-21', doneAt: null }, '2026-08-21')).toBe(false);
  });

  it('★ 끝난 일은 기한이 지나도 재촉하지 않는다', () => {
    expect(
      isTaskOverdue({ dueOn: '2026-08-01', doneAt: '2026-08-02T00:00:00.000Z' }, '2026-08-21'),
    ).toBe(false);
  });

  it('기한이 없으면 지날 일도 없다', () => {
    expect(isTaskOverdue({ dueOn: null, doneAt: null }, '2026-08-21')).toBe(false);
  });
});
