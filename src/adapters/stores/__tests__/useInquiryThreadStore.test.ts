/**
 * useInquiryThreadStore — 탐구 흐름 스토어 단위 테스트.
 *
 * 통째로 저장하는 구조라 미로드 상태에서 add 하면 디스크의 기존 흐름을 덮어쓰면 안 된다(load 가드).
 * container 의 inquiryThreadRepository 를 인메모리 가짜로 모킹한다(useRecordDraftsStore.test 패턴).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { InquiryThread } from '@domain/entities/InquiryThread';

const { repoFake } = vi.hoisted(() => {
  const fake: {
    stored: { records: InquiryThread[] } | null;
    saveCalls: number;
    getInquiryThreads(): Promise<{ records: InquiryThread[] } | null>;
    saveInquiryThreads(data: { records: readonly InquiryThread[] }): Promise<void>;
  } = {
    stored: null,
    saveCalls: 0,
    async getInquiryThreads() {
      return this.stored ? { records: [...this.stored.records] } : null;
    },
    async saveInquiryThreads(data) {
      this.stored = { records: [...data.records] };
      this.saveCalls += 1;
    },
  };
  return { repoFake: fake };
});

vi.mock('@adapters/di/container', () => ({
  inquiryThreadRepository: repoFake,
}));

import { useInquiryThreadStore } from '@adapters/stores/useInquiryThreadStore';

const existing: InquiryThread = {
  id: 'thr-old',
  studentRef: 'tc:c1:1-2-3',
  title: '기존 주제',
  keywords: ['기존'],
  status: 'open',
  createdAt: 1,
  updatedAt: 1,
};

beforeEach(() => {
  repoFake.stored = null;
  repoFake.saveCalls = 0;
  useInquiryThreadStore.setState({ records: [], loaded: false });
});

describe('useInquiryThreadStore', () => {
  it('★미로드 상태에서 add 해도 디스크의 기존 흐름을 덮어쓰지 않는다', async () => {
    repoFake.stored = { records: [existing] };
    const id = await useInquiryThreadStore.getState().add({
      studentRef: 'tc:c1:1-2-3',
      title: ' 프레이밍 효과 ',
      keywords: ['프레이밍', ' 프레이밍', '', '합리적 선택'],
      classId: 'c1',
    });
    const saved = repoFake.stored!.records;
    expect(saved.map((r) => r.id)).toEqual(['thr-old', id]);
    const added = saved[1]!;
    expect(added.title).toBe('프레이밍 효과');
    expect(added.keywords).toEqual(['프레이밍', '합리적 선택']); // 정리·중복 제거
    expect(added.status).toBe('open');
    expect(added.classId).toBe('c1');
    expect(typeof added.term).toBe('string'); // 저장 시각의 학기 표식
    expect('standardCodes' in added).toBe(false); // 부재는 칸을 만들지 않는다
  });

  it('빈 제목은 거부한다', async () => {
    await expect(
      useInquiryThreadStore.getState().add({ studentRef: 's', title: '  ' }),
    ).rejects.toThrow();
    expect(repoFake.saveCalls).toBe(0);
  });

  it('update 는 준 칸만 바꾸고, 닫기(status) 후 열린 흐름 조회에서 빠진다', async () => {
    repoFake.stored = { records: [existing] };
    const store = useInquiryThreadStore.getState();
    await store.update('thr-old', {
      competencyKeywords: ['경제 현상에 대한 자료 해석력'],
      nextNotes: '광고 규제로 이어 볼 것',
    });
    let rec = repoFake.stored!.records[0]!;
    expect(rec.title).toBe('기존 주제');
    expect(rec.competencyKeywords).toEqual(['경제 현상에 대한 자료 해석력']);
    expect(rec.nextNotes).toBe('광고 규제로 이어 볼 것');
    expect(rec.updatedAt).toBeGreaterThan(1);

    await useInquiryThreadStore.getState().update('thr-old', { status: 'closed' });
    rec = repoFake.stored!.records[0]!;
    expect(rec.status).toBe('closed');
    expect(useInquiryThreadStore.getState().getOpenByStudentRef('tc:c1:1-2-3')).toEqual([]);
    expect(useInquiryThreadStore.getState().getByStudentRef('tc:c1:1-2-3')).toHaveLength(1);
  });

  it('remove 는 그 흐름만 지운다', async () => {
    repoFake.stored = { records: [existing, { ...existing, id: 'thr-2', title: '둘' }] };
    await useInquiryThreadStore.getState().remove('thr-old');
    expect(repoFake.stored!.records.map((r) => r.id)).toEqual(['thr-2']);
    expect(useInquiryThreadStore.getState().exists('thr-old')).toBe(false);
  });

  it('load(force) 는 loaded 를 유지한 채 디스크 내용으로 갱신한다(동기화 리로드)', async () => {
    await useInquiryThreadStore.getState().load();
    expect(useInquiryThreadStore.getState().records).toEqual([]);
    repoFake.stored = { records: [existing] };
    await useInquiryThreadStore.getState().load(); // loaded 라 무시
    expect(useInquiryThreadStore.getState().records).toEqual([]);
    await useInquiryThreadStore.getState().load(true);
    expect(useInquiryThreadStore.getState().records).toHaveLength(1);
  });
});
