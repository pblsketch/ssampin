import { describe, it, expect } from 'vitest';
import type { ProgressEntry, CurriculumProgressData } from '@domain/entities/CurriculumProgress';
import type { TeachingClassesData } from '@domain/entities/TeachingClass';
import type { AttendanceData } from '@domain/entities/Attendance';
import type { ITeachingClassRepository } from '@domain/repositories/ITeachingClassRepository';
import { ManageCurriculumProgress } from '../ManageCurriculumProgress';

/**
 * 진도 파일의 **형제 필드(파일 루트에 함께 사는 다른 키) 보존 계약**.
 *
 * 예전에는 `add`/`update`/`delete`/`saveAll`이 전부 `{ entries }`만 새로 만들어 저장해서,
 * 같은 파일에 있는 다른 키가 **다음 저장 한 번에 조용히 사라졌다.** 진도는 사용자가 가장 자주
 * 쓰는 저장 경로(수업 한 번에 한 건)라, 형제 필드를 쓰는 기능은 하루도 못 버티고 값을 잃는다.
 *
 * 이 계약이 필요한 이유는 곧 `lessonDayAdjustments`(수업일 수정 목록)가 이 파일의 형제 필드로
 * 들어오기 때문이다. 다만 이 테스트는 **그 필드에 의존하지 않는다** — 아직 없는 필드에 기대면
 * 계약이 그 기능과 함께 흔들린다. 대신 테스트 로컬 확장 타입(`ProbeProgressData`)으로 "앱이
 * 모르는 임의의 형제 키"를 세워 더 강한 조건을 건다.
 *
 * ⚠️ `any`를 쓰지 않는다(코딩 컨벤션). `CurriculumProgressData`가 닫힌 인터페이스라 확장 타입이
 * 필요하다.
 *
 * ⚠️ 리포지토리는 **도메인 포트를 직접 구현한 가짜**를 쓴다. 어댑터 구현체를 가져오면 "UseCases는
 * adapters에 의존할 수 없다"는 레이어 규칙에 걸린다(같은 폴더의 선례 테스트는 그 경고를 안고
 * 있다 — 따라 하지 말 것). 저장·조회 때 JSON 왕복을 넣어 실제 파일 저장과 같은 직렬화 경계는
 * 그대로 재현한다.
 *
 * 참고: `teachingClassUnknownFieldRoundtrip.test.ts`는 **레코드 수준** 보존을 다루며 봉투(파일
 * 루트) 수준은 의도적으로 떨어뜨린다고 적고 있다. 진도는 그 반대다 — 봉투 수준을 보존해야 한다.
 * 두 파일이 어긋나 보이면 이 주석을 먼저 읽을 것.
 */

/** 앱이 모르는 형제 키가 있는 진도 파일 — 테스트 로컬 확장(any 회피용). */
interface ProbeProgressData extends CurriculumProgressData {
  readonly __probe: string;
}

/** 실제 파일 저장과 같은 직렬화 경계 재현. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** 도메인 포트만 구현한 가짜 저장소 — 진도 외 도메인은 이 테스트와 무관하다. */
class FakeTeachingClassRepository implements ITeachingClassRepository {
  private progress: ProbeProgressData | null = null;

  /** 앱이 모르는 형제 키를 심어 둔 초기 상태를 만든다. */
  seed(data: ProbeProgressData): void {
    this.progress = clone(data);
  }

  /** 저장된 파일을 형제 키까지 그대로 들여다본다. */
  readRaw(): ProbeProgressData | null {
    return this.progress === null ? null : clone(this.progress);
  }

  getProgress(): Promise<CurriculumProgressData | null> {
    return Promise.resolve(this.progress === null ? null : clone(this.progress));
  }

  saveProgress(data: CurriculumProgressData): Promise<void> {
    this.progress = clone(data) as ProbeProgressData;
    return Promise.resolve();
  }

  getClasses(): Promise<TeachingClassesData | null> {
    return Promise.resolve(null);
  }
  saveClasses(): Promise<void> {
    return Promise.resolve();
  }
  getAttendance(): Promise<AttendanceData | null> {
    return Promise.resolve(null);
  }
  saveAttendance(): Promise<void> {
    return Promise.resolve();
  }
}

function entry(id: string): ProgressEntry {
  return {
    id,
    classId: 'tc-1',
    date: '2026-09-01',
    period: 3,
    unit: '1단원',
    lesson: '3',
    status: 'completed',
    note: '',
  };
}

/** 형제 키가 있는 진도 파일을 심어 둔 저장소 + 유스케이스 한 벌. */
function seed(entries: readonly ProgressEntry[]): {
  repo: FakeTeachingClassRepository;
  manage: ManageCurriculumProgress;
} {
  const repo = new FakeTeachingClassRepository();
  repo.seed({ entries, __probe: 'keep-me' });
  return { repo, manage: new ManageCurriculumProgress(repo) };
}

describe('curriculum-progress 형제 필드 보존 계약', () => {
  it('add — 진도를 한 건 더해도 형제 키가 살아남는다', async () => {
    const { repo, manage } = seed([entry('p1')]);

    await manage.add(entry('p2'));

    const saved = repo.readRaw();
    expect(saved?.__probe).toBe('keep-me');
    expect(saved?.entries.map((e) => e.id)).toEqual(['p1', 'p2']);
  });

  it('update — 진도를 고쳐도 형제 키가 살아남는다', async () => {
    const { repo, manage } = seed([entry('p1')]);

    await manage.update({ ...entry('p1'), lesson: '4' });

    const saved = repo.readRaw();
    expect(saved?.__probe).toBe('keep-me');
    expect(saved?.entries[0]?.lesson).toBe('4');
  });

  it('delete — 진도를 지워도 형제 키가 살아남는다', async () => {
    const { repo, manage } = seed([entry('p1'), entry('p2')]);

    await manage.delete('p1');

    const saved = repo.readRaw();
    expect(saved?.__probe).toBe('keep-me');
    expect(saved?.entries.map((e) => e.id)).toEqual(['p2']);
  });

  it('saveAll — 통째 저장에도 형제 키가 살아남는다', async () => {
    const { repo, manage } = seed([entry('p1')]);

    await manage.saveAll([entry('p1'), entry('p2')]);

    const saved = repo.readRaw();
    expect(saved?.__probe).toBe('keep-me');
    expect(saved?.entries).toHaveLength(2);
  });

  it('saveAll(force) — 의도적 전량 삭제에도 형제 키가 살아남는다', async () => {
    // force 경로는 예전에 기존 파일을 아예 읽지 않아서, 형제 키가 통째로 날아가던 자리다.
    // 반 삭제·학년도 전환이 이 경로를 쓴다.
    const { repo, manage } = seed([entry('p1')]);

    await manage.saveAll([], true);

    const saved = repo.readRaw();
    expect(saved?.__probe).toBe('keep-me');
    expect(saved?.entries).toEqual([]);
  });

  it('saveAll — 빈 배열 덮어쓰기 차단(기존 방어)이 그대로 동작한다', async () => {
    const { repo, manage } = seed([entry('p1')]);

    await manage.saveAll([]); // force 없음 → 차단되어야 한다

    const saved = repo.readRaw();
    expect(saved?.entries.map((e) => e.id)).toEqual(['p1']);
    expect(saved?.__probe).toBe('keep-me');
  });

  it('빈 저장소에서 시작해도 저장이 깨지지 않는다', async () => {
    // data가 null인 경로 — 스프레드가 null을 만나도 예외가 나지 않아야 한다
    const repo = new FakeTeachingClassRepository();
    const manage = new ManageCurriculumProgress(repo);

    await manage.add(entry('p1'));

    expect(repo.readRaw()?.entries.map((e) => e.id)).toEqual(['p1']);
  });
});
