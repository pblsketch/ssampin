/**
 * googleSourcedData 단위 테스트 — 쌤핀 AI 로 보내지 않을 구글 자료 판정 (ADR-136).
 */
import { describe, expect, test } from 'vitest';
import {
  eventContentDiffers,
  isGoogleSourcedEvent,
  isGoogleSourcedTodo,
  splitGoogleSourced,
  todoContentDiffers,
} from '../googleSourcedData';

describe('isGoogleSourcedEvent', () => {
  test('구글에서 가져온 일정은 구글 자료다', () => {
    expect(isGoogleSourcedEvent({ source: 'google', googleEventId: 'g1' })).toBe(true);
  });

  test('쌤핀에서 만들어 올린 일정은 구글 자료가 아니다', () => {
    expect(isGoogleSourcedEvent({ source: 'ssampin', googleEventId: 'g1' })).toBe(false);
  });

  test('쌤핀 일정이라도 구글 쪽 수정이 들어왔으면 구글 자료다 (D1)', () => {
    expect(
      isGoogleSourcedEvent({ source: 'ssampin', googleEventId: 'g1', googleContentReceived: true }),
    ).toBe(true);
  });

  test('출처 표시 전의 연결 일정은 알 수 없으니 구글 자료로 본다', () => {
    expect(isGoogleSourcedEvent({ googleEventId: 'g1' })).toBe(true);
  });

  test('구글과 연결되지 않은 일정·학사일정은 구글 자료가 아니다', () => {
    expect(isGoogleSourcedEvent({})).toBe(false);
    expect(isGoogleSourcedEvent({ source: 'neis', googleEventId: 'g1' })).toBe(false);
  });
});

describe('isGoogleSourcedTodo', () => {
  test('구글에서 온 할 일은 연결이 끊겨도 구글 자료다', () => {
    expect(isGoogleSourcedTodo({ origin: 'google' })).toBe(true);
    expect(isGoogleSourcedTodo({ origin: 'google', googleTaskId: 't1' })).toBe(true);
  });

  test('쌤핀에서 만든 할 일은 구글에 올려도 구글 자료가 아니다', () => {
    expect(isGoogleSourcedTodo({ origin: 'ssampin', googleTaskId: 't1' })).toBe(false);
  });

  test('표시 전의 연결 할 일은 구글 자료로 본다 (D2)', () => {
    expect(isGoogleSourcedTodo({ googleTaskId: 't1' })).toBe(true);
  });

  test('표시 전이라도 구글과 연결된 적 없는 할 일은 구글 자료가 아니다', () => {
    expect(isGoogleSourcedTodo({})).toBe(false);
  });
});

describe('splitGoogleSourced', () => {
  test('순서를 지키며 둘로 나눈다', () => {
    const items = [
      { id: 'a', origin: 'ssampin' as const },
      { id: 'b', origin: 'google' as const },
      { id: 'c' },
      { id: 'd', googleTaskId: 't' },
    ];
    const { kept, google } = splitGoogleSourced(items, isGoogleSourcedTodo);
    expect(kept.map((t) => t.id)).toEqual(['a', 'c']);
    expect(google.map((t) => t.id)).toEqual(['b', 'd']);
  });
});

describe('eventContentDiffers', () => {
  const base = {
    title: '학년 협의회',
    description: '회의실',
    location: '3층',
    date: '2026-09-24',
    startTime: '15:00',
    endTime: '16:00',
  };

  test('쌤핀이 올린 것이 그대로 되돌아온 메아리는 바뀐 것이 아니다', () => {
    expect(eventContentDiffers(base, { ...base })).toBe(false);
    // 빈 값과 없는 값, 끝 날짜 생략과 같은 날은 같다
    expect(
      eventContentDiffers({ ...base, description: '' }, { ...base, description: undefined }),
    ).toBe(false);
    expect(eventContentDiffers(base, { ...base, endDate: '2026-09-24' })).toBe(false);
  });

  test('제목·장소·날짜·시각이 바뀌면 바뀐 것이다', () => {
    expect(eventContentDiffers(base, { ...base, title: '학년 협의회(변경)' })).toBe(true);
    expect(eventContentDiffers(base, { ...base, location: '2층' })).toBe(true);
    expect(eventContentDiffers(base, { ...base, date: '2026-09-25' })).toBe(true);
    expect(eventContentDiffers(base, { ...base, startTime: '14:00' })).toBe(true);
  });
});

describe('todoContentDiffers', () => {
  const base = { text: '공문 회신', notes: undefined, dueDate: '2026-09-25', completed: false };

  test('메아리는 바뀐 것이 아니다', () => {
    expect(todoContentDiffers(base, { ...base })).toBe(false);
    expect(todoContentDiffers(base, { ...base, notes: '' })).toBe(false);
  });

  test('제목·메모·기한·완료가 바뀌면 바뀐 것이다', () => {
    expect(todoContentDiffers(base, { ...base, text: '공문 회신(급)' })).toBe(true);
    expect(todoContentDiffers(base, { ...base, notes: '교무부' })).toBe(true);
    expect(todoContentDiffers(base, { ...base, dueDate: undefined })).toBe(true);
    expect(todoContentDiffers(base, { ...base, completed: true })).toBe(true);
  });
});
