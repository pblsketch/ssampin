/**
 * "등록 후보 쪽지" 규칙 테스트.
 *
 * 잠그는 계약 — **손댈 것만 센다.** 인사말·공지까지 세면 숫자가 소음이 되고,
 * 이미 가져간 걸 계속 세면 영원히 안 사라진다.
 */
import { describe, it, expect } from 'vitest';
import {
  countCoolImportCandidates,
  findCoolImportCandidates,
} from '@domain/rules/coolImportCandidates';
import { EMPTY_COOL_HISTORY, addRecords } from '@domain/rules/coolImportHistory';
import type { CoolImportItem, CoolMessage } from '@domain/entities/CoolMessage';

const NOW = new Date(2026, 7, 23, 10, 0);

function msg(over: Partial<CoolMessage> = {}): CoolMessage {
  return {
    key: 1,
    sender: '교무부',
    receivedAt: new Date(2026, 7, 20, 9, 0).toISOString(),
    title: '학폭위 심의',
    body: '8월 27일(목) 14:00 회의실',
    isUnread: true,
    ...over,
  };
}

function taken(messageKey: number, start: Date, target: 'event' | 'todo'): CoolImportItem {
  return {
    sourceMessageKey: messageKey,
    title: 'x',
    start,
    end: null,
    allDay: false,
    target,
  };
}

describe('무엇을 세는가', () => {
  it('날짜가 든 쪽지를 후보로 센다', () => {
    expect(countCoolImportCandidates([msg()], EMPTY_COOL_HISTORY)).toBe(1);
  });

  it('★ 날짜가 없는 쪽지는 세지 않는다 (인사말·공지가 숫자를 부풀리면 안 된다)', () => {
    const greeting = msg({ key: 2, title: '인사말', body: '한 학기 수고 많으셨습니다.' });
    expect(countCoolImportCandidates([greeting], EMPTY_COOL_HISTORY)).toBe(0);
  });

  it('★ 이미 가져간 쪽지는 세지 않는다', () => {
    const history = addRecords(
      EMPTY_COOL_HISTORY,
      [taken(1, new Date(2026, 7, 27, 14, 0), 'event')],
      NOW,
    );
    expect(countCoolImportCandidates([msg()], history)).toBe(0);
  });

  it('★ 할일로 가져갔어도 끝난 것으로 본다 (양쪽 다 요구하면 영원히 안 사라진다)', () => {
    const history = addRecords(
      EMPTY_COOL_HISTORY,
      [taken(1, new Date(2026, 7, 27, 14, 0), 'todo')],
      NOW,
    );
    expect(countCoolImportCandidates([msg()], history)).toBe(0);
  });

  it('받은 시각을 못 읽는 쪽지는 건너뛴다', () => {
    expect(countCoolImportCandidates([msg({ receivedAt: '언젠가' })], EMPTY_COOL_HISTORY)).toBe(0);
  });

  it('쪽지가 없으면 0', () => {
    expect(countCoolImportCandidates([], EMPTY_COOL_HISTORY)).toBe(0);
  });
});

describe('여러 날짜가 든 쪽지', () => {
  const multi = msg({
    key: 5,
    title: '진로체험 안내',
    body: '사전교육 8월 26일(수) 15:00\n체험 당일 8월 31일(월) 09:00\n보고서 9월 4일(금)까지',
  });

  it('안 가져간 후보 수를 알려 준다', () => {
    const found = findCoolImportCandidates([multi], EMPTY_COOL_HISTORY);
    expect(found).toHaveLength(1);
    expect(found[0]!.remaining).toBe(3);
  });

  it('★ 일부만 가져갔으면 나머지가 남는다', () => {
    const history = addRecords(
      EMPTY_COOL_HISTORY,
      [taken(5, new Date(2026, 7, 26, 15, 0), 'event')],
      NOW,
    );
    const found = findCoolImportCandidates([multi], history);
    expect(found[0]!.remaining).toBe(2);
  });

  it('전부 가져갔으면 목록에서 빠진다', () => {
    const history = addRecords(
      EMPTY_COOL_HISTORY,
      [
        taken(5, new Date(2026, 7, 26, 15, 0), 'event'),
        taken(5, new Date(2026, 7, 31, 9, 0), 'event'),
        taken(5, new Date(2026, 8, 4, 0, 0), 'todo'),
      ],
      NOW,
    );
    expect(countCoolImportCandidates([multi], history)).toBe(0);
  });
});

describe('숫자는 쪽지 수다', () => {
  it('후보가 3개인 쪽지 하나는 "1건"이다 (읽기 쉬운 쪽)', () => {
    const multi = msg({
      key: 5,
      body: '8월 26일(수) 15:00\n8월 31일(월) 09:00\n9월 4일(금) 종일',
    });
    expect(countCoolImportCandidates([multi], EMPTY_COOL_HISTORY)).toBe(1);
  });

  it('쪽지 여럿이면 그 수만큼 센다', () => {
    const a = msg({ key: 1 });
    const b = msg({ key: 2, body: '9월 1일(화) 09:00 개학식' });
    const greeting = msg({ key: 3, body: '감사합니다' });
    expect(countCoolImportCandidates([a, b, greeting], EMPTY_COOL_HISTORY)).toBe(2);
  });

  it('보낸 사람과 제목도 함께 준다 (알림 문구에 쓸 수 있게)', () => {
    const found = findCoolImportCandidates([msg()], EMPTY_COOL_HISTORY);
    expect(found[0]!.sender).toBe('교무부');
    expect(found[0]!.title).toBe('학폭위 심의');
  });
});
