/**
 * useRecordDraftsStore — 생기부 초안 스토어 단위 테스트.
 *
 * 핵심 회귀 방어(법정기록 유실 방지):
 *   - 스토어가 통째로 저장하는 구조라, 미로드 상태에서 upsert 시 기존 record-drafts.json 을
 *     덮어쓰면 안 된다(load 가드). getRecordDrafts 로 먼저 디스크를 읽어 합쳐야 한다.
 *   - upsert 는 (area+studentRef+subject) 키로 동작(같은 키=갱신 / 다른 과목=별도).
 *
 * container 의 recordDraftsRepository 를 인메모리 가짜로 모킹한다(useStudentStore.test 패턴).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RecordDraft } from '@domain/entities/RecordDraft';

const { recordDraftsRepoFake } = vi.hoisted(() => {
  const fake: {
    stored: { records: RecordDraft[] } | null;
    saveCalls: RecordDraft[][];
    getRecordDrafts(): Promise<{ records: RecordDraft[] } | null>;
    saveRecordDrafts(data: { records: readonly RecordDraft[] }): Promise<void>;
  } = {
    stored: null,
    saveCalls: [],
    async getRecordDrafts() {
      return this.stored ? { records: [...this.stored.records] } : null;
    },
    async saveRecordDrafts(data) {
      this.stored = { records: [...data.records] };
      this.saveCalls.push([...data.records]);
    },
  };
  return { recordDraftsRepoFake: fake };
});

vi.mock('@adapters/di/container', () => ({
  recordDraftsRepository: recordDraftsRepoFake,
}));

import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import {
  RecordDraftConfirmedError,
  RecordDraftLimitError,
  useRecordDraftsStore,
} from '../useRecordDraftsStore';

function makeDraft(
  p: Partial<RecordDraft> & Pick<RecordDraft, 'area' | 'studentRef' | 'content'>,
): RecordDraft {
  return {
    id: `pre-${p.area}-${p.studentRef}`,
    requiresTeacherReview: true,
    status: 'draft',
    byteLength: p.content.length,
    basisObservationIds: [],
    createdAt: 1_000,
    updatedAt: 1_000,
    ...p,
  };
}

beforeEach(() => {
  recordDraftsRepoFake.stored = null;
  recordDraftsRepoFake.saveCalls = [];
  // 스토어를 미로드 초기 상태로 리셋.
  useRecordDraftsStore.setState({ records: [], loaded: false });
});

describe('useRecordDraftsStore — 유실 방지(load 가드)', () => {
  it('미로드 상태에서 upsert 해도 기존 디스크 초안을 덮어쓰지 않는다', async () => {
    // 디스크에는 이미 2건이 있고, 스토어는 아직 로드 전(records=[], loaded=false).
    recordDraftsRepoFake.stored = {
      records: [
        makeDraft({ area: 'autonomy', studentRef: 's1', content: '기존 자율 A' }),
        makeDraft({ area: 'career', studentRef: 's1', content: '기존 진로 B' }),
      ],
    };

    // load() 없이 곧바로 upsert — 가드가 없으면 records:[새것] 한 건으로 파일을 덮어써 2건이 유실됨.
    await useRecordDraftsStore.getState().upsert({
      area: 'behavior',
      studentRef: 's1',
      content: '새 행동특성 C',
    });

    const saved = recordDraftsRepoFake.stored!.records;
    expect(saved).toHaveLength(3); // 기존 2 + 신규 1 (유실 0)
    expect(saved.map((r) => r.area).sort()).toEqual(['autonomy', 'behavior', 'career']);
    expect(saved.find((r) => r.area === 'autonomy')?.content).toBe('기존 자율 A');
    expect(saved.find((r) => r.area === 'career')?.content).toBe('기존 진로 B');
  });

  it('setStatus 도 미로드 상태에서 기존 초안을 보존한다', async () => {
    recordDraftsRepoFake.stored = {
      records: [
        makeDraft({ id: 'd1', area: 'autonomy', studentRef: 's1', content: 'A' }),
        makeDraft({ id: 'd2', area: 'career', studentRef: 's1', content: 'B' }),
      ],
    };
    await useRecordDraftsStore.getState().setStatus('d1', 'confirmed');
    const saved = recordDraftsRepoFake.stored!.records;
    expect(saved).toHaveLength(2); // 유실 0
    expect(saved.find((r) => r.id === 'd1')?.status).toBe('confirmed');
    expect(saved.find((r) => r.id === 'd2')?.content).toBe('B');
  });
});

describe('useRecordDraftsStore — upsert 키(area+studentRef+subject)', () => {
  it('같은 키는 갱신(중복 생성 없음), requiresTeacherReview=true 강제', async () => {
    const id1 = await useRecordDraftsStore
      .getState()
      .upsert({ area: 'career', studentRef: 's1', content: '초안 1' });
    const id2 = await useRecordDraftsStore
      .getState()
      .upsert({ area: 'career', studentRef: 's1', content: '초안 1 수정' });
    expect(id1).toBe(id2); // 동일 키 → 동일 레코드
    const recs = useRecordDraftsStore.getState().records;
    expect(recs).toHaveLength(1);
    expect(recs[0]!.content).toBe('초안 1 수정');
    expect(recs[0]!.requiresTeacherReview).toBe(true);
  });

  it('과목이 다르면 별도 초안(과목별 세특)', async () => {
    await useRecordDraftsStore
      .getState()
      .upsert({ area: 'subject', studentRef: 'tc:c1:5', subject: '수학', content: '수학 세특' });
    await useRecordDraftsStore
      .getState()
      .upsert({ area: 'subject', studentRef: 'tc:c1:5', subject: '영어', content: '영어 세특' });
    expect(useRecordDraftsStore.getState().records).toHaveLength(2);
  });

  it('byteLength 는 저장 시 재계산된다(한글 3B)', async () => {
    await useRecordDraftsStore
      .getState()
      .upsert({ area: 'behavior', studentRef: 's1', content: '가나다' });
    expect(useRecordDraftsStore.getState().getDraft('behavior', 's1')?.byteLength).toBe(9);
  });

  it('getByStudentRef / getDraft 파생 조회', async () => {
    await useRecordDraftsStore
      .getState()
      .upsert({ area: 'autonomy', studentRef: 's1', content: 'A' });
    await useRecordDraftsStore
      .getState()
      .upsert({ area: 'career', studentRef: 's1', content: 'B' });
    await useRecordDraftsStore
      .getState()
      .upsert({ area: 'autonomy', studentRef: 's2', content: 'C' });
    expect(useRecordDraftsStore.getState().getByStudentRef('s1')).toHaveLength(2);
    expect(useRecordDraftsStore.getState().getDraft('career', 's1')?.content).toBe('B');
    expect(useRecordDraftsStore.getState().getDraft('career', 's2')).toBeUndefined();
  });
});

describe('바이트 한도 — 프롬프트가 아니라 코드에서 자른다 (ADR-072 결정 5)', () => {
  const long = (bytes: number): string => '가'.repeat(Math.ceil(bytes / 3));

  it('고등 과목세특 1,500B 를 넘으면 저장을 거부한다', async () => {
    await expect(
      useRecordDraftsStore.getState().upsert({
        area: 'subject',
        studentRef: 's1',
        content: long(1503),
        level: 'high',
      }),
    ).rejects.toBeInstanceOf(RecordDraftLimitError);
  });

  it('거부 메시지에 영역 이름과 두 수치가 한국어로 들어간다 — 조용한 실패 금지', async () => {
    await useRecordDraftsStore
      .getState()
      .upsert({ area: 'subject', studentRef: 's1', content: long(1503), level: 'high' })
      .catch((e: unknown) => {
        const err = e as RecordDraftLimitError;
        expect(err.message).toContain('과목별 세부능력 및 특기사항');
        expect(err.message).toContain('1,500');
        expect(err.limit).toBe(1500);
      });
  });

  it('한도와 정확히 같으면 저장된다(경계값)', async () => {
    const id = await useRecordDraftsStore
      .getState()
      .upsert({ area: 'subject', studentRef: 's2', content: long(1500), level: 'high' });
    expect(useRecordDraftsStore.getState().exists(id)).toBe(true);
  });

  it('진로활동은 2,100B 까지 허용한다(영역마다 한도가 다르다)', async () => {
    const id = await useRecordDraftsStore
      .getState()
      .upsert({ area: 'career', studentRef: 's3', content: long(2100), level: 'high' });
    expect(useRecordDraftsStore.getState().exists(id)).toBe(true);
  });

  it('초등은 한도 수치가 공식 확인되지 않아 거부하지 않는다', async () => {
    // isAreaLimitVerified=false — 확인 안 된 숫자로 교사 입력을 막지 않는다.
    const id = await useRecordDraftsStore
      .getState()
      .upsert({ area: 'autonomy', studentRef: 's4', content: long(3000), level: 'elementary' });
    expect(useRecordDraftsStore.getState().exists(id)).toBe(true);
  });
});

describe('P1-1 회귀 — level 미지정(브릿지 live-sync) 이 초등 초안을 거부하면 안 된다', () => {
  const long = (bytes: number): string => '가'.repeat(Math.ceil(bytes / 3));

  it('설정이 초등이면 level 을 안 넘겨도 자율활동 1,602B 가 저장된다', async () => {
    // 브릿지는 초등 한도를 "확인 안 됨(flag)"으로 통과시킨다. 앱이 'high' 로 굳으면
    // 전에는 되던 쓰기가 거부된다 — 그게 회귀였다.
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, schoolLevel: 'elementary' },
      loaded: true,
    }));
    const id = await useRecordDraftsStore
      .getState()
      .upsert({ area: 'autonomy', studentRef: 'e1', content: long(1602) });
    expect(useRecordDraftsStore.getState().exists(id)).toBe(true);
  });

  it('설정이 고등이면 level 을 안 넘겨도 한도가 그대로 걸린다', async () => {
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, schoolLevel: 'high' },
      loaded: true,
    }));
    await expect(
      useRecordDraftsStore
        .getState()
        .upsert({ area: 'autonomy', studentRef: 'h1', content: long(1602) }),
    ).rejects.toBeInstanceOf(RecordDraftLimitError);
  });

  it('설정이 아직 로드되지 않았으면 한도로 막지 않는다 — 잘못 거부하는 쪽이 더 나쁘다', async () => {
    // 앱 시작 직후 브릿지 쓰기가 들어오는 짧은 창. 기본값('middle')으로 판정하면 초등 교사의
    // 정상 초안이 거부된다. level 도 설정도 없으면 통과시킨다.
    useSettingsStore.setState({ loaded: false });
    const id = await useRecordDraftsStore
      .getState()
      .upsert({ area: 'autonomy', studentRef: 'u1', content: long(1602) });
    expect(useRecordDraftsStore.getState().exists(id)).toBe(true);
  });
});

describe('기재 금지 항목 — 초안 저장 시 경고만 한다(막지 않는다)', () => {
  it('금지 항목이 있으면 prohibited_item flag 가 붙고 저장은 된다', async () => {
    useSettingsStore.setState((s) => ({
      settings: { ...s.settings, schoolLevel: 'high' },
      loaded: true,
    }));
    const id = await useRecordDraftsStore.getState().upsert({
      area: 'subject',
      studentRef: 'p1',
      content: '교내 대회에서 최우수상을 수상함.',
    });
    const rec = useRecordDraftsStore.getState().records.find((r) => r.id === id);
    // 막지 않는다 — 모든 초안은 교사 최종 검토가 강제되므로 판단을 사람에게 남긴다.
    expect(rec).toBeDefined();
    expect(rec?.groundingFlags).toContain('prohibited_item');
  });

  it('깨끗한 초안에는 flag 를 달지 않는다', async () => {
    const id = await useRecordDraftsStore.getState().upsert({
      area: 'subject',
      studentRef: 'p2',
      content: '자료의 출처를 스스로 확인하고 근거를 다시 정리함.',
    });
    const rec = useRecordDraftsStore.getState().records.find((r) => r.id === id);
    expect(rec?.groundingFlags ?? []).not.toContain('prohibited_item');
  });

  it('브릿지가 보낸 기존 flag 를 덮어쓰지 않고 함께 싣는다', async () => {
    const id = await useRecordDraftsStore.getState().upsert({
      area: 'subject',
      studentRef: 'p3',
      content: '토익 점수를 언급함.',
      groundingFlags: ['low_overlap'],
    });
    const flags = useRecordDraftsStore.getState().records.find((r) => r.id === id)?.groundingFlags;
    expect(flags).toContain('low_overlap');
    expect(flags).toContain('prohibited_item');
  });
});

describe('확정 초안 잠금 — AI 는 못 덮고 교사는 고칠 수 있다', () => {
  const confirmDraft = async (studentRef: string): Promise<string> => {
    const id = await useRecordDraftsStore.getState().upsert({
      area: 'subject',
      studentRef,
      content: '교사가 검토를 마친 문장.',
    });
    await useRecordDraftsStore.getState().setStatus(id, 'confirmed');
    return id;
  };

  it('★브릿지가 확정 초안을 덮으려 하면 거부한다', async () => {
    // 브릿지 core 에는 이 잠금이 있었지만, 앱이 켜져 있으면 loopback 으로 스토어를 타서
    // 우회됐다 — 앱이 꺼져 있으면 막히고 켜져 있으면 뚫리는 상태였다.
    await confirmDraft('c1');
    await expect(
      useRecordDraftsStore.getState().upsert({
        area: 'subject',
        studentRef: 'c1',
        content: 'AI 가 새로 쓴 문장.',
        origin: 'bridge',
      }),
    ).rejects.toThrow(RecordDraftConfirmedError);
  });

  it('★쌤핀 AI(assist)도 마찬가지로 거부한다', async () => {
    await confirmDraft('c2');
    await expect(
      useRecordDraftsStore.getState().upsert({
        area: 'subject',
        studentRef: 'c2',
        content: 'AI 가 새로 쓴 문장.',
        origin: 'assist',
      }),
    ).rejects.toThrow(RecordDraftConfirmedError);
  });

  it('거부되면 원래 내용이 그대로 남는다', async () => {
    const id = await confirmDraft('c3');
    await useRecordDraftsStore
      .getState()
      .upsert({ area: 'subject', studentRef: 'c3', content: '덮어쓰기', origin: 'bridge' })
      .catch(() => undefined);
    const rec = useRecordDraftsStore.getState().records.find((r) => r.id === id);
    expect(rec?.content).toBe('교사가 검토를 마친 문장.');
    expect(rec?.status).toBe('confirmed');
  });

  it('교사 본인은 확정 초안도 고칠 수 있다 — 자기 기록이다', async () => {
    const id = await confirmDraft('c4');
    await useRecordDraftsStore
      .getState()
      .upsert({ area: 'subject', studentRef: 'c4', content: '교사가 직접 고침.' });
    const rec = useRecordDraftsStore.getState().records.find((r) => r.id === id);
    expect(rec?.content).toBe('교사가 직접 고침.');
  });

  it('확정 전(draft·reviewing)에는 AI 가 쓸 수 있다', async () => {
    await useRecordDraftsStore
      .getState()
      .upsert({ area: 'subject', studentRef: 'c5', content: '초안' });
    await expect(
      useRecordDraftsStore.getState().upsert({
        area: 'subject',
        studentRef: 'c5',
        content: 'AI 가 고쳐 씀',
        origin: 'bridge',
      }),
    ).resolves.toBeTruthy();
  });
});
