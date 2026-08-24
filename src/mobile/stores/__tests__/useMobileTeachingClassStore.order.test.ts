/**
 * useMobileTeachingClassStore — 수업반 표시 순서 회귀 방지.
 *
 * 사용자 신고(2026-08-24): "노트북에서 반 순서를 정렬했는데 폰에서는 그 순서대로
 * 정렬이 안 돼요." 원인은 동기화가 아니라 **모바일이 order 필드를 안 읽은 것**이었다.
 *
 * 재배치(ManageTeachingClasses.reorder)는 저장 파일의 배열 순서를 일부러 바꾸지
 * 않는다(보관된 반 유실 방지 — teachingClassArchiveStore.test.ts 함정 ⑩). 그래서
 * 배열 순서를 그대로 그리면 PC에서 아무리 순서를 바꿔도 모바일은 그대로다.
 *
 * @mobile/di/container 의 teachingClassRepository 를 인메모리 가짜로 모킹한다.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { TeachingClass, TeachingClassesData } from '@domain/entities/TeachingClass';

const { teachingClassRepoFake } = vi.hoisted(() => {
  const repo: {
    stored: TeachingClassesData | null;
    getClasses(): Promise<TeachingClassesData | null>;
    saveClasses(data: TeachingClassesData): Promise<void>;
  } = {
    stored: null,
    async getClasses() {
      return this.stored;
    },
    async saveClasses(data) {
      this.stored = data;
    },
  };
  return { teachingClassRepoFake: repo };
});

vi.mock('@mobile/di/container', () => ({
  teachingClassRepository: teachingClassRepoFake,
}));

import { useMobileTeachingClassStore } from '../useMobileTeachingClassStore';

function makeClass(overrides: Partial<TeachingClass> = {}): TeachingClass {
  return {
    id: 'tc-1',
    name: '2-7',
    subject: '미적분',
    students: [],
    createdAt: '2026-03-02T00:00:00.000Z',
    updatedAt: '2026-03-02T00:00:00.000Z',
    ...overrides,
  };
}

/** PC에서 2-8 → 2-9 → 2-7 순으로 재배치한 뒤의 저장 파일 모습. */
const REORDERED_ON_DESKTOP: TeachingClassesData = {
  classes: [
    makeClass({ id: 'c7', name: '2-7', order: 2, createdAt: '2026-03-02T00:00:00.000Z' }),
    makeClass({ id: 'c8', name: '2-8', order: 0, createdAt: '2026-03-03T00:00:00.000Z' }),
    makeClass({ id: 'c9', name: '2-9', order: 1, createdAt: '2026-03-04T00:00:00.000Z' }),
  ],
};

beforeEach(() => {
  teachingClassRepoFake.stored = null;
  useMobileTeachingClassStore.setState({ classes: [], loaded: false });
});

describe('useMobileTeachingClassStore — 표시 순서', () => {
  it('load 는 파일 배열 순서가 아니라 PC에서 정한 order 순으로 내보낸다', async () => {
    teachingClassRepoFake.stored = REORDERED_ON_DESKTOP;

    await useMobileTeachingClassStore.getState().load();

    expect(useMobileTeachingClassStore.getState().classes.map((c) => c.name)).toEqual([
      '2-8',
      '2-9',
      '2-7',
    ]);
  });

  it('동기화 후 reload 에서도 순서가 유지된다', async () => {
    teachingClassRepoFake.stored = { classes: [makeClass({ id: 'c7', name: '2-7', order: 0 })] };
    await useMobileTeachingClassStore.getState().load();

    // 백그라운드 동기화가 PC의 재배치 결과를 받아온 상황
    teachingClassRepoFake.stored = REORDERED_ON_DESKTOP;
    await useMobileTeachingClassStore.getState().reload();

    expect(useMobileTeachingClassStore.getState().classes.map((c) => c.name)).toEqual([
      '2-8',
      '2-9',
      '2-7',
    ]);
    // 조용한 갱신이므로 loaded 를 떨어뜨리지 않는다(상세 화면 언마운트 방지).
    expect(useMobileTeachingClassStore.getState().loaded).toBe(true);
  });

  it('order 가 아직 없는 옛 데이터는 생성순으로 둔다', async () => {
    teachingClassRepoFake.stored = {
      classes: [
        makeClass({ id: 'b', name: '나중', createdAt: '2026-03-05T00:00:00.000Z' }),
        makeClass({ id: 'a', name: '먼저', createdAt: '2026-03-01T00:00:00.000Z' }),
      ],
    };

    await useMobileTeachingClassStore.getState().load();

    expect(useMobileTeachingClassStore.getState().classes.map((c) => c.name)).toEqual([
      '먼저',
      '나중',
    ]);
  });
});
