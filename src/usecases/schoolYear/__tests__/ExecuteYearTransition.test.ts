/**
 * ExecuteYearTransition 단위 테스트 (S2.4) — 계획 §4 S2.4 AC 5건 + 재개 시나리오.
 * IPC(archive/backup)는 인메모리 fake — 실제 파일 I/O·체크섬은 electron/archiveManager.test.ts가 검증.
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { IStoragePort } from '../../../domain/ports/IStoragePort';
import {
  YEAR_TRANSITION_FILES,
  YEAR_TRANSITION_REMOVED_KEY,
  YEAR_TRANSITION_STATE_KEY,
  type YearTransitionRemovedMarker,
  createIpcYearTransitionGateway,
  deriveNextTerm,
  detectPendingTransition,
  executeYearTransition,
  revertYearTransition,
  type YearTransitionDeps,
  type YearTransitionGateway,
  type YearTransitionState,
} from '../ExecuteYearTransition';

/* ─── 인메모리 fake — data:read/write/remove 계약 모사 ─────── */

class FakeStorage implements IStoragePort {
  readonly files = new Map<string, string>(); // 직렬화된 파일 바이트(ElectronStorageAdapter와 동일 포맷)
  readonly binaries = new Map<string, Uint8Array>();
  /** 쓰기 실패 은닉 주입(함정 ⑪ 모사) — 쓰지 않고 조용히 성공한 척한다. */
  readonly swallowWriteKeys = new Set<string>();

  async read<T>(filename: string): Promise<T | null> {
    const raw = this.files.get(filename);
    return raw === undefined ? null : (JSON.parse(raw) as T);
  }
  async write<T>(filename: string, data: T): Promise<void> {
    if (this.swallowWriteKeys.has(filename)) return; // data:write의 조용한 실패
    this.files.set(filename, JSON.stringify(data, null, 2));
  }
  async remove(filename: string): Promise<void> {
    this.files.delete(filename);
  }
  async readBinary(relPath: string): Promise<Uint8Array | null> {
    return this.binaries.get(relPath) ?? null;
  }
  async writeBinary(relPath: string, bytes: Uint8Array): Promise<void> {
    this.binaries.set(relPath, bytes);
  }
  async removeBinary(relPath: string): Promise<void> {
    this.binaries.delete(relPath);
  }
  async listBinary(dirRelPath: string): Promise<readonly string[]> {
    const prefix = `${dirRelPath}/`;
    return [...this.binaries.keys()]
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(prefix.length));
  }

  snapshot(): { files: Map<string, string>; binaries: Map<string, string> } {
    return {
      files: new Map(this.files),
      binaries: new Map([...this.binaries].map(([k, v]) => [k, Buffer.from(v).toString('base64')])),
    };
  }
}

interface FakeArchiveEntry {
  readonly kind: 'data' | 'binary';
  readonly content: string; // data=utf8 원문, binary=base64
}

class FakeGateway implements YearTransitionGateway {
  readonly archives = new Map<string, Map<string, FakeArchiveEntry>>();
  safetyFail = false;
  createFail = false;
  readonly readFailPaths = new Set<string>();
  readonly createCalls: string[][] = [];
  safetyCalls = 0;

  constructor(private readonly storage: FakeStorage) {}

  async createSafetyBackup() {
    this.safetyCalls++;
    if (this.safetyFail) return { ok: false as const, error: '디스크가 가득 찼어요(모의)' };
    return { ok: true as const, path: 'C:/fake/backups/safety-x.ssampin-backup.json' };
  }

  async archiveCreate(term: string, fileKeys: string[]) {
    this.createCalls.push(fileKeys);
    if (this.createFail) return { ok: false as const, error: '보관함 생성에 실패했어요(모의)' };
    // F10a — 같은 학기 재보관은 새 회차 디렉토리(실제 archiveManager와 동일 규칙).
    let round = 1;
    while (this.archives.has(round === 1 ? term : `${term}-${round}`)) round++;
    const archiveId = round === 1 ? term : `${term}-${round}`;
    const files = new Map<string, FakeArchiveEntry>();
    const entries: { path: string; kind: 'data' | 'binary' }[] = [];
    for (const key of fileKeys) {
      if (key.includes('/')) {
        const bytes = this.storage.binaries.get(key);
        if (!bytes) continue;
        files.set(key, { kind: 'binary', content: Buffer.from(bytes).toString('base64') });
        entries.push({ path: key, kind: 'binary' });
      } else {
        const raw = this.storage.files.get(key);
        if (raw === undefined) continue;
        files.set(`${key}.json`, { kind: 'data', content: raw }); // 바이트 사본(원문 그대로)
        entries.push({ path: `${key}.json`, kind: 'data' });
      }
    }
    files.set('manifest.json', {
      kind: 'data',
      content: JSON.stringify({ schemaVersion: 1, term, archiveId, entries }),
    });
    this.archives.set(archiveId, files);
    return {
      ok: true as const,
      term,
      archiveId,
      round,
      label: term,
      entryCount: entries.length,
      totalBytes: 0,
    };
  }

  async archiveRead(term: string, fileKey: string) {
    const archive = this.archives.get(term);
    if (!archive) return { ok: false as const, error: `해당 학기의 보관함이 없어요: ${term}` };
    if (this.readFailPaths.has(fileKey)) {
      return { ok: false as const, error: `체크섬 불일치(모의): ${fileKey}` };
    }
    const entry = archive.get(fileKey);
    if (!entry) return { ok: false as const, error: `보관함에 없는 파일이에요: ${fileKey}` };
    return {
      ok: true as const,
      encoding: entry.kind === 'binary' ? ('base64' as const) : ('utf8' as const),
      content: entry.content,
    };
  }
}

/* ─── 픽스처 ───────────────────────────────────────────────── */

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

function seedLiveData(storage: FakeStorage): void {
  const seed: Record<string, unknown> = {
    students: [{ id: 'stu-1', name: '학생가', studentNumber: 10203 }],
    seating: {
      rows: 2,
      cols: 3,
      seats: [
        ['1-2-3', null, null],
        [null, null, null],
      ],
    },
    'seat-constraints': {
      zones: [{ id: 'z1' }],
      separations: [],
      adjacencies: [],
      fixedSeats: [],
    },
    'student-records': {
      records: [{ id: 'rec-1', studentId: 'stu-1', date: '2026-06-01', term: '2026-1' }],
      categories: [{ id: 'custom-1', name: '내 분류', subcategories: [] }],
      deleted: [{ id: 'gone-1', deletedAt: '2026-05-01T00:00:00.000Z' }],
    },
    'record-drafts': { records: [{ id: 'd1' }] },
    'record-evidence': { records: [{ id: 'e1' }] },
    'seating-snapshots': [{ id: 'snap-1', timestamp: 1 }],
    surveys: { surveys: [{ id: 'sv1' }], localData: [] },
    assignments: { assignments: [{ id: 'a1' }] },
    'teaching-classes': { classes: [{ id: 'tc-1', name: '샘플 통합과학' }] },
    attendance: {
      records: [{ classId: 'tc-1', date: '2026-06-01', period: 1, students: [] }],
      deleted: [{ key: 'x|y|z|1', deletedAt: '2026-05-01T00:00:00.000Z' }],
    },
    'curriculum-progress': { entries: [{ id: 'p1' }] },
    observations: {
      records: [{ id: 'obs-1', date: '2026-06-01' }],
      customTags: ['발표력'],
      customCategories: ['내 분류'],
    },
    'observation-attachments': {
      attachments: [{ id: 'att-1', storageRef: 'obs-attachments/att-1.png' }],
    },
    rubrics: { rubrics: [{ id: 'r1' }], gradings: [] },
    'grade-analysis': {
      plans: [{ id: 'g1' }],
      writtenResults: [],
      performanceResults: [],
      semesterResults: [],
    },
    'class-rosters': { rosters: [{ id: 'cr1' }] },
  };
  for (const [key, value] of Object.entries(seed)) {
    storage.files.set(key, JSON.stringify(value, null, 2));
  }
  storage.binaries.set('obs-attachments/att-1.png', PNG);
}

function makeDeps(storage: FakeStorage, gateway: FakeGateway) {
  // F7g: 마법사는 2학기(학년도 말) 마감 전용 — 테스트 기본 학기도 2학기로 맞춘다.
  let currentTerm: string | undefined = '2026-2';
  let lastClosedTerm: string | undefined;
  const reloadStores = vi.fn(async (_filenames: readonly string[]) => {});
  const deps: YearTransitionDeps = {
    storage,
    gateway,
    getCurrentTerm: async () => currentTerm,
    getLastClosedTerm: async () => lastClosedTerm,
    // F9a: 두 값은 한 번의 저장에서 함께 갱신된다(테스트 하네스도 동일 계약).
    setCurrentTerm: async (term, closed) => {
      currentTerm = term;
      lastClosedTerm = closed;
    },
    reloadStores,
  };
  return {
    deps,
    reloadStores,
    getTerm: () => currentTerm,
    getLastClosed: () => lastClosedTerm,
  };
}

let storage: FakeStorage;
let gateway: FakeGateway;

beforeEach(() => {
  storage = new FakeStorage();
  gateway = new FakeGateway(storage);
  seedLiveData(storage);
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

/* ─── AC 테스트 ────────────────────────────────────────────── */

describe('executeYearTransition — 성공 경로', () => {
  test('아카이브==전환 전 라이브(원문 일치) + 리셋 봉투 정의대로 + currentTerm 갱신 + 상태 정리', async () => {
    const before = storage.snapshot();
    const { deps, reloadStores, getTerm } = makeDeps(storage, gateway);

    const result = await executeYearTransition(deps, { closingTerm: '2026-2' });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.nextTerm).toBe('2027-1');
    expect(result.safetyBackupPath).toContain('safety');
    expect(result.resetKeys).toHaveLength(YEAR_TRANSITION_FILES.length);

    // 아카이브 사본 == 전환 전 라이브 원문(해시 일치의 유닛 등가 — 바이트 문자열 동치)
    const archive = gateway.archives.get('2026-2')!;
    for (const [key, raw] of before.files) {
      expect(archive.get(`${key}.json`)?.content, key).toBe(raw);
    }
    expect(archive.get('obs-attachments/att-1.png')?.content).toBe(
      Buffer.from(PNG).toString('base64'),
    );

    // 리셋 결과 — 봉투 정의표 그대로 (F7b: 배열 루트는 [] 쓰기 — 첫 업로드가 리모트 정화)
    expect(await storage.read('students')).toEqual([]);
    // F8b(RM-a): seating은 격자 크기 승계 + seats 전부 null(학생 배치만 비움 — 업로드 정화 성립)
    expect(await storage.read('seating')).toEqual({
      rows: 2,
      cols: 3,
      seats: [
        [null, null, null],
        [null, null, null],
      ],
    });
    expect(await storage.read('seating-snapshots')).toEqual([]);
    expect(await storage.read('teaching-classes')).toEqual({ classes: [] });
    expect(await storage.read('attendance')).toEqual({ records: [] }); // 툼스톤 미승계
    expect(await storage.read('student-records')).toEqual({
      records: [],
      categories: [{ id: 'custom-1', name: '내 분류', subcategories: [] }], // 설정 성격 승계
    });
    expect(await storage.read('observations')).toEqual({
      records: [],
      customTags: ['발표력'],
      customCategories: ['내 분류'], // 사용자 어휘 승계
    });
    expect(await storage.read('grade-analysis')).toEqual({
      plans: [],
      writtenResults: [],
      performanceResults: [],
      semesterResults: [],
    });
    // 모든 리셋 파일이 유효 JSON 구조값(F7a — 짧은 빈 배열도 정상) 또는 부재(remove)
    for (const spec of YEAR_TRANSITION_FILES) {
      const raw = storage.files.get(spec.key);
      if (spec.reset.kind === 'remove') {
        expect(raw, spec.key).toBeUndefined();
      } else {
        const parsed: unknown = JSON.parse(raw!); // 파스 실패면 throw = 테스트 실패
        expect(parsed !== null && typeof parsed === 'object', spec.key).toBe(true);
      }
    }

    // 바이너리 원본은 삭제하지 않는다(비가역 삭제 배제 — 사본만 생성)
    expect(storage.binaries.has('obs-attachments/att-1.png')).toBe(true);

    expect(getTerm()).toBe('2027-1'); // settings.currentTerm 갱신
    expect(await storage.read(YEAR_TRANSITION_STATE_KEY)).toBeNull(); // 상태 파일 정리
    expect(reloadStores).toHaveBeenCalledWith(YEAR_TRANSITION_FILES.map((f) => f.key)); // 조용한 리로드
  });
});

describe('F9b·F9c — 학기 전환(1학기 마감) 완주 · 통파일 리셋·마커·정화 동일 동작', () => {
  test('allowMidYearClosing 플래그가 있으면 학기 전환이 완주하고 lastClosedTerm이 기록된다', async () => {
    const { deps, getTerm, getLastClosed } = makeDeps(storage, gateway);

    const result = await executeYearTransition(deps, {
      closingTerm: '2026-1',
      allowMidYearClosing: true,
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) return;
    expect(result.nextTerm).toBe('2026-2'); // 같은 학년도 2학기
    expect(getTerm()).toBe('2026-2');
    expect(getLastClosed()).toBe('2026-1'); // B2 방어의 기준값

    // F9b: 통파일 리셋·마커·정화 경로가 학년도 전환과 동일하게 동작한다(학년도 전제 코드 없음)
    expect(await storage.read('students')).toEqual([]); // 빈 값 쓰기 = 업로드 정화 가능
    expect(await storage.read('teaching-classes')).toEqual({ classes: [] });
    const marker = await storage.read<YearTransitionRemovedMarker>(YEAR_TRANSITION_REMOVED_KEY);
    expect(marker?.term).toBe('2026-1');
    expect([...(marker?.keys ?? [])].sort()).toEqual(['seating', 'students']);
    expect(gateway.archives.has('2026-1')).toBe(true); // 아카이브도 학기 라벨로 생성
  });
});

describe('F10a·F10b — 마무리 ↔ 복원 순환(같은 학기 재보관)', () => {
  test('전환 → 복원 → 재전환이 막히지 않고 새 회차로 보관된다 (qa1-⑥ 해소)', async () => {
    const { deps, getTerm, getLastClosed } = makeDeps(storage, gateway);

    const first = await executeYearTransition(deps, { closingTerm: '2026-2' });
    expect(first.ok, JSON.stringify(first)).toBe(true);
    if (!first.ok) return;

    // 복원(전환 취소) — 라이브가 보관 시점으로 돌아오고 lastClosedTerm 해제
    const revert = await revertYearTransition(deps, '2026-2');
    expect(revert.ok, JSON.stringify(revert)).toBe(true);
    expect(getTerm()).toBe('2026-2');
    expect(getLastClosed()).toBeUndefined();

    // 재전환 — "이미 있어요"로 막히지 않고 2회차 디렉토리 생성
    const second = await executeYearTransition(deps, { closingTerm: '2026-2' });
    expect(second.ok, JSON.stringify(second)).toBe(true);
    expect(gateway.createCalls).toHaveLength(2);
    expect([...gateway.archives.keys()].sort()).toEqual(['2026-2', '2026-2-2']);
    expect(getTerm()).toBe('2027-1');
    expect(getLastClosed()).toBe('2026-2');

    // 1회차 사본은 그대로 남아 있다(불변 계약) — 각각 독립 복원 가능
    const revertRound2 = await revertYearTransition(deps, '2026-2-2');
    expect(revertRound2.ok, JSON.stringify(revertRound2)).toBe(true);
    expect(gateway.archives.has('2026-2')).toBe(true);
    expect(getTerm()).toBe('2026-2'); // 회차본이어도 표시 학기는 논리 학기
  });
});

describe('F9a — lastClosedTerm 기록/원복 (스킵 필터 기준의 정본)', () => {
  test('전환 완료 시 currentTerm·lastClosedTerm이 같은 저장에서 함께 갱신된다', async () => {
    const { deps, getTerm, getLastClosed } = makeDeps(storage, gateway);

    const result = await executeYearTransition(deps, { closingTerm: '2026-2' });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(getTerm()).toBe('2027-1');
    expect(getLastClosed()).toBe('2026-2'); // 마감한 학기
  });

  test('완료된 전환의 원복은 lastClosedTerm을 해제한다(되살린 학기가 계속 스킵되면 안 된다)', async () => {
    const { deps, getTerm, getLastClosed } = makeDeps(storage, gateway);
    expect((await executeYearTransition(deps, { closingTerm: '2026-2' })).ok).toBe(true);
    expect(getLastClosed()).toBe('2026-2');

    const revert = await revertYearTransition(deps, '2026-2');
    expect(revert.ok, JSON.stringify(revert)).toBe(true);
    expect(getTerm()).toBe('2026-2');
    expect(getLastClosed()).toBeUndefined();
  });

  test('중단분(pending) 원복은 전환 전 두 값을 함께 되돌린다', async () => {
    const { deps, getTerm, getLastClosed } = makeDeps(storage, gateway);
    // 1차 전환 완료 → lastClosedTerm='2026-2'
    expect((await executeYearTransition(deps, { closingTerm: '2026-2' })).ok).toBe(true);
    // 새 학년도에 데이터를 입력한 뒤 2차 전환이 리셋 도중 중단(조용한 쓰기 실패 주입).
    // (리셋값과 다른 내용이 있어야 재독 검증이 실패로 잡힌다 — 빈 값 그대로면 통과해버린다.)
    storage.files.set('students', JSON.stringify([{ id: 'stu-new' }], null, 2));
    storage.swallowWriteKeys.add('students');
    const second = await executeYearTransition(deps, { closingTerm: '2027-2' });
    expect(second.ok).toBe(false);

    storage.swallowWriteKeys.clear();
    const revert = await revertYearTransition(deps, '2027-2');
    expect(revert.ok, JSON.stringify(revert)).toBe(true);
    expect(getTerm()).toBe('2027-1'); // 2차 전환 전 값
    expect(getLastClosed()).toBe('2026-2'); // 1차 전환의 마감 학기로 원복
  });
});

describe('F1(B1) — 전환 마커 기록/정리', () => {
  test('성공 전환 후 guardDownloads 키(students·seating)가 마커에 기록된다 — snapshots는 미등재(RL-a)', async () => {
    const { deps } = makeDeps(storage, gateway);
    const result = await executeYearTransition(deps, { closingTerm: '2026-2' });
    expect(result.ok).toBe(true);

    const marker = await storage.read<YearTransitionRemovedMarker>(YEAR_TRANSITION_REMOVED_KEY);
    expect(marker).not.toBeNull();
    expect(marker?.version).toBe(1);
    expect(marker?.term).toBe('2026-2');
    expect(typeof marker?.removedAt).toBe('string');
    // RL-a: seating-snapshots는 SYNC_REGISTRY 미등재(동기화 표면 없음) — 마커 대상 아님
    expect([...(marker?.keys ?? [])].sort()).toEqual(['seating', 'students']);
  });

  test('revert 후 마커가 정리된다 — 이후 치유 다운로드는 정상 동작(ADR-024 복원)', async () => {
    const { deps } = makeDeps(storage, gateway);
    const done = await executeYearTransition(deps, { closingTerm: '2026-2' });
    expect(done.ok).toBe(true);
    expect(await storage.read(YEAR_TRANSITION_REMOVED_KEY)).not.toBeNull();

    const revert = await revertYearTransition(deps, '2026-2');
    expect(revert.ok).toBe(true);
    expect(await storage.read(YEAR_TRANSITION_REMOVED_KEY)).toBeNull();
  });
});

describe('AC: 실패 시 fail-closed', () => {
  test('safety backup 실패 → 전환 미시작(아카이브 호출 0·라이브/상태 무변경)', async () => {
    gateway.safetyFail = true;
    const before = storage.snapshot();
    const { deps, getTerm } = makeDeps(storage, gateway);

    const result = await executeYearTransition(deps, { closingTerm: '2026-2' });
    expect(result).toMatchObject({ ok: false, step: 'safety-backup' });
    expect(gateway.createCalls).toHaveLength(0); // 시작 자체를 안 함
    expect(storage.snapshot().files).toEqual(before.files); // 1바이트 무변경
    expect(getTerm()).toBe('2026-2');
    expect(await detectPendingTransition(storage)).toBeNull();
  });

  test('RL-b: nextTerm은 deriveNextTerm 파생 결과만 허용 — 임의 값은 시작 전 거부', async () => {
    const before = storage.snapshot();
    const { deps } = makeDeps(storage, gateway);

    const result = await executeYearTransition(deps, {
      closingTerm: '2026-2',
      nextTerm: '2030-1', // 임의 값 — 기대는 deriveNextTerm('2026-2') = '2027-1'
    });
    expect(result).toMatchObject({ ok: false, step: 'safety-backup' });
    if (result.ok) return;
    expect(result.error).toContain('2030-1');
    expect(gateway.safetyCalls).toBe(0);
    expect(storage.snapshot().files).toEqual(before.files);

    // 파생 결과와 일치하는 명시 값은 허용된다
    const ok = await executeYearTransition(deps, { closingTerm: '2026-2', nextTerm: '2027-1' });
    expect(ok.ok, JSON.stringify(ok)).toBe(true);
  });

  test('F9c: 1학기 마감은 확인 플래그 없이는 거부된다(안전 백업조차 안 만든다)', async () => {
    const before = storage.snapshot();
    const { deps, getTerm } = makeDeps(storage, gateway);

    const result = await executeYearTransition(deps, { closingTerm: '2026-1' });
    expect(result).toMatchObject({ ok: false, step: 'safety-backup' });
    if (result.ok) return;
    expect(result.error).toContain('확인이 필요해요');
    expect(gateway.safetyCalls).toBe(0);
    expect(gateway.createCalls).toHaveLength(0);
    expect(storage.snapshot().files).toEqual(before.files);
    expect(getTerm()).toBe('2026-2');
  });

  test('② archive:create 실패 → 라이브 1바이트 무변경 + safety 경로 보고', async () => {
    gateway.createFail = true;
    const before = storage.snapshot();
    const { deps, getTerm } = makeDeps(storage, gateway);

    const result = await executeYearTransition(deps, { closingTerm: '2026-2' });
    expect(result).toMatchObject({ ok: false, step: 'archive' });
    if (result.ok) return;
    expect(result.safetyBackupPath).toContain('safety'); // 사용자 안내용 경로 동봉
    expect(storage.snapshot().files).toEqual(before.files); // 라이브+상태 전부 전환 전과 동일
    expect(storage.snapshot().binaries).toEqual(before.binaries);
    expect(getTerm()).toBe('2026-2');
  });

  test('③ 체크섬 재검증 실패 → 리셋 미진입(라이브 무변경)', async () => {
    gateway.readFailPaths.add('attendance.json');
    const before = new Map(storage.files);
    const { deps } = makeDeps(storage, gateway);

    const result = await executeYearTransition(deps, { closingTerm: '2026-2' });
    expect(result).toMatchObject({ ok: false, step: 'verify-archive' });
    for (const spec of YEAR_TRANSITION_FILES) {
      expect(storage.files.get(spec.key), spec.key).toBe(before.get(spec.key)); // 리셋 미진입
    }
  });

  test('⑤ 리셋 검증: data:write 조용한 실패 주입 → 즉시 중단 + 상태 파일 잔존(재개 유도)', async () => {
    storage.swallowWriteKeys.add('attendance'); // 함정 ⑪ 모사
    const { deps } = makeDeps(storage, gateway);

    const result = await executeYearTransition(deps, { closingTerm: '2026-2' });
    expect(result).toMatchObject({ ok: false, step: 'verify-reset' });
    if (result.ok) return;
    expect(result.error).toContain('attendance');
    expect(result.safetyBackupPath).toContain('safety');
    // 중단 지점 상태가 남아 재개/원복 안내 근거가 된다
    const state = await detectPendingTransition(storage);
    expect(state).toMatchObject({ closingTerm: '2026-2', phase: 'resetting' });
  });

  test('F7d(RB2): 마커 기록의 조용한 쓰기 실패 주입 → 전환 중단(마커 없는 비우기 금지)', async () => {
    storage.swallowWriteKeys.add(YEAR_TRANSITION_REMOVED_KEY); // data:write 실패 은닉 모사
    const { deps } = makeDeps(storage, gateway);

    const result = await executeYearTransition(deps, { closingTerm: '2026-2' });
    expect(result).toMatchObject({ ok: false, step: 'verify-reset' });
    if (result.ok) return;
    expect(result.error).toContain('마커');
    expect(result.safetyBackupPath).toContain('safety');
  });
});

describe('중단 지점 재개 시나리오', () => {
  test('리셋 중단 후 재실행 → 기존 아카이브 재검증 후 이어서 완료', async () => {
    const before = storage.snapshot();
    storage.swallowWriteKeys.add('attendance');
    const { deps, getTerm } = makeDeps(storage, gateway);
    const first = await executeYearTransition(deps, { closingTerm: '2026-2' });
    expect(first.ok).toBe(false);

    // 장애 해소 후 재실행 — archive:create는 "이미 존재"를 반환하지만 재개 모드가 흡수한다
    storage.swallowWriteKeys.clear();
    const second = await executeYearTransition(deps, { closingTerm: '2026-2' });
    expect(second.ok, JSON.stringify(second)).toBe(true);
    expect(getTerm()).toBe('2027-1');
    expect(await storage.read(YEAR_TRANSITION_STATE_KEY)).toBeNull();
    expect(await storage.read('attendance')).toEqual({ records: [] });
    // 아카이브 사본은 첫 시도의 전환 전 원문 그대로(재개가 사본을 덮지 않는다)
    expect(gateway.archives.get('2026-2')!.get('attendance.json')?.content).toBe(
      before.files.get('attendance'),
    );
  });

  test('F7g 예외: 1학기 중단분(pending)의 재개는 학기 가드를 통과한다', async () => {
    // 과거(가드 도입 전) 1학기 전환이 중단된 상태를 심는다 — 이어하기를 막으면 반쯤 전환에 갇힌다.
    const state: YearTransitionState = {
      version: 1,
      closingTerm: '2026-1',
      nextTerm: '2026-2',
      previousTerm: '2026-1',
      startedAt: '2026-08-01T00:00:00.000Z',
      safetyBackupPath: 'C:/fake/old-safety.json',
      phase: 'resetting',
      resetDone: [],
    };
    await storage.write(YEAR_TRANSITION_STATE_KEY, state);
    const { deps, getTerm } = makeDeps(storage, gateway);

    const result = await executeYearTransition(deps, { closingTerm: '2026-1' });
    expect(result.ok, JSON.stringify(result)).toBe(true); // 재개는 차단하지 않는다
    expect(getTerm()).toBe('2026-2');
    expect(await storage.read(YEAR_TRANSITION_STATE_KEY)).toBeNull();
  });

  test('다른 학기의 중단분이 남아 있으면 새 전환을 거부한다', async () => {
    const { deps } = makeDeps(storage, gateway);
    const state: YearTransitionState = {
      version: 1,
      closingTerm: '2025-2',
      nextTerm: '2026-1',
      previousTerm: null,
      startedAt: '2026-02-01T00:00:00.000Z',
      safetyBackupPath: 'C:/fake/old-safety.json',
      phase: 'resetting',
      resetDone: [],
    };
    await storage.write(YEAR_TRANSITION_STATE_KEY, state);
    const result = await executeYearTransition(deps, { closingTerm: '2026-1' });
    expect(result).toMatchObject({ ok: false, step: 'safety-backup' });
    if (result.ok) return;
    expect(result.error).toContain('2025-2');
  });
});

describe('AC: 전환 취소(원복) 후 전환 전과 동일', () => {
  test('성공한 전환을 원복 → 17키 데이터·바이너리·currentTerm이 전환 전과 동일 + 사본 유지', async () => {
    const before = storage.snapshot();
    const { deps, getTerm } = makeDeps(storage, gateway);
    const done = await executeYearTransition(deps, { closingTerm: '2026-2' });
    expect(done.ok).toBe(true);

    const revert = await revertYearTransition(deps, '2026-2');
    expect(revert.ok, JSON.stringify(revert)).toBe(true);

    for (const [key, raw] of before.files) {
      expect(JSON.parse(storage.files.get(key) ?? 'null')).toEqual(JSON.parse(raw)); // 값 동일
    }
    expect(Buffer.from(storage.binaries.get('obs-attachments/att-1.png')!).toString('base64')).toBe(
      before.binaries.get('obs-attachments/att-1.png'),
    );
    expect(getTerm()).toBe('2026-2'); // 되돌린 데이터의 학기로 복귀
    expect(gateway.archives.has('2026-2')).toBe(true); // 보관 사본은 유지
    expect(await storage.read(YEAR_TRANSITION_STATE_KEY)).toBeNull();
  });

  test('사본 손상(체크섬 불일치) 시 원복이 진행되지 않는다', async () => {
    const { deps } = makeDeps(storage, gateway);
    await executeYearTransition(deps, { closingTerm: '2026-2' });
    gateway.readFailPaths.add('students.json');
    const revert = await revertYearTransition(deps, '2026-2');
    expect(revert.ok).toBe(false);
  });
});

describe('AC: loaded:false 미사용 + 게이트웨이 경계', () => {
  test('소스에 loaded:false 상태 조작이 없다 (함정 ⑦ — grep 강제)', () => {
    const src = readFileSync(resolve(__dirname, '..', 'ExecuteYearTransition.ts'), 'utf-8');
    // 주석은 규칙을 문서화하느라 금지 문구를 인용한다 — 코드만 검사(주석 제거 후 grep).
    const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(/loaded\s*:\s*false/.test(codeOnly)).toBe(false);
    expect(/setState\s*\(/.test(codeOnly)).toBe(false); // 스토어 상태 직접 조작 자체가 없다
  });

  test('브라우저 모드(electronAPI 부재) → 게이트웨이 null(호출자가 명시 비활성)', () => {
    expect(createIpcYearTransitionGateway()).toBeNull(); // node 환경 = window 부재
  });

  test('deriveNextTerm — 1학기→2학기, 2학기→다음 학년도 1학기, 비형식→null', () => {
    expect(deriveNextTerm('2026-1')).toBe('2026-2');
    expect(deriveNextTerm('2026-2')).toBe('2027-1');
    expect(deriveNextTerm('unknown')).toBeNull();
  });
});
