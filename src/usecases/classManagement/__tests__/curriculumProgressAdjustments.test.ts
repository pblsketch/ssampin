import { describe, it, expect } from 'vitest';
import type {
  ProgressEntry,
  CurriculumProgressData,
  LessonDayAdjustment,
} from '@domain/entities/CurriculumProgress';
import type { TeachingClassesData } from '@domain/entities/TeachingClass';
import type { AttendanceData } from '@domain/entities/Attendance';
import type { ITeachingClassRepository } from '@domain/repositories/ITeachingClassRepository';
import { ManageCurriculumProgress } from '../ManageCurriculumProgress';

/**
 * 수업일 정정(`lessonDayAdjustments`) 저장 계약.
 *
 * 정정은 **계산 결과가 아니라 사용자가 준 사실**이라 저장한다. 그래서 두 가지가 보장돼야 한다:
 *  1. 정정을 세우거나 지울 때 **진도 기록이 함께 날아가지 않는다.**
 *  2. 반을 지우면 **그 반의 정정도 함께 사라진다.** 안 그러면 삭제된 반의 정정이 파일에 영구히
 *     남고, 이 필드를 진도 파일에 둔 이유(반과 수명을 같이한다)가 무너진다 — 다른 저장 위치를
 *     기각한 사유와 똑같은 결함이 된다.
 */

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

class FakeRepo implements ITeachingClassRepository {
  private progress: CurriculumProgressData | null = null;

  seed(data: CurriculumProgressData): void {
    this.progress = clone(data);
  }
  read(): CurriculumProgressData | null {
    return this.progress === null ? null : clone(this.progress);
  }
  getProgress(): Promise<CurriculumProgressData | null> {
    return Promise.resolve(this.read());
  }
  saveProgress(data: CurriculumProgressData): Promise<void> {
    this.progress = clone(data);
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

function entry(id: string, classId = 'tc-1'): ProgressEntry {
  return {
    id,
    classId,
    date: '2026-09-01',
    period: 3,
    unit: '1단원',
    lesson: '3',
    status: 'completed',
    note: '',
  };
}

function adj(
  classId: string,
  date: string,
  kind: LessonDayAdjustment['kind'],
): LessonDayAdjustment {
  return { classId, date, kind, updatedAt: '2026-09-01T00:00:00.000Z' };
}

const NOW = '2026-09-10T00:00:00.000Z';

function setup(data: CurriculumProgressData) {
  const repo = new FakeRepo();
  repo.seed(data);
  return { repo, manage: new ManageCurriculumProgress(repo) };
}

describe('수업일 정정 — 읽기', () => {
  it('없으면 빈 배열', async () => {
    const { manage } = setup({ entries: [] });
    expect(await manage.getAdjustments()).toEqual([]);
  });

  it('있으면 그대로 돌려준다', async () => {
    const { manage } = setup({
      entries: [],
      lessonDayAdjustments: [adj('tc-1', '2026-10-09', 'hasLesson')],
    });
    expect(await manage.getAdjustments()).toHaveLength(1);
  });
});

describe('수업일 정정 — 세우기·지우기', () => {
  it('새 정정을 세워도 진도 기록이 남아 있다', async () => {
    const { repo, manage } = setup({ entries: [entry('p1')] });

    await manage.saveAdjustment('tc-1', '2026-10-09', 'hasLesson', NOW);

    const saved = repo.read();
    expect(saved?.entries.map((e) => e.id)).toEqual(['p1']);
    expect(saved?.lessonDayAdjustments).toEqual([
      { classId: 'tc-1', date: '2026-10-09', kind: 'hasLesson', updatedAt: NOW },
    ]);
  });

  it('같은 날 정정을 다시 세우면 덮어쓴다 (쌓이지 않는다)', async () => {
    const { repo, manage } = setup({
      entries: [],
      lessonDayAdjustments: [adj('tc-1', '2026-10-09', 'hasLesson')],
    });

    await manage.saveAdjustment('tc-1', '2026-10-09', 'noLesson', NOW);

    expect(repo.read()?.lessonDayAdjustments).toEqual([
      { classId: 'tc-1', date: '2026-10-09', kind: 'noLesson', updatedAt: NOW },
    ]);
  });

  it('kind가 null이면 그 날 정정만 지우고 앱 판정으로 되돌린다', async () => {
    const { repo, manage } = setup({
      entries: [],
      lessonDayAdjustments: [
        adj('tc-1', '2026-10-09', 'hasLesson'),
        adj('tc-1', '2026-10-12', 'noLesson'),
      ],
    });

    await manage.saveAdjustment('tc-1', '2026-10-09', null, NOW);

    expect(repo.read()?.lessonDayAdjustments?.map((a) => a.date)).toEqual(['2026-10-12']);
  });

  it('다른 반의 같은 날짜 정정은 건드리지 않는다', async () => {
    // 정정은 반 단위다 — "체육대회라 1학년만 수업 없음"처럼 같은 날도 반마다 갈린다.
    const { repo, manage } = setup({
      entries: [],
      lessonDayAdjustments: [adj('tc-2', '2026-10-09', 'noLesson')],
    });

    await manage.saveAdjustment('tc-1', '2026-10-09', 'hasLesson', NOW);

    const saved = repo.read()?.lessonDayAdjustments ?? [];
    expect(saved).toHaveLength(2);
    expect(saved.filter((a) => a.classId === 'tc-2')).toHaveLength(1);
  });
});

describe('A-a12: 반을 지우면 그 반의 정정도 사라진다', () => {
  it('saveAll에 정정 목록을 넘기면 그 값으로 바뀐다', async () => {
    const { repo, manage } = setup({
      entries: [entry('p1', 'tc-1'), entry('p2', 'tc-2')],
      lessonDayAdjustments: [
        adj('tc-1', '2026-10-09', 'hasLesson'),
        adj('tc-2', '2026-10-09', 'noLesson'),
      ],
    });

    // 반 삭제 경로가 하는 일과 동일 — 남길 진도와 남길 정정을 함께 넘긴다
    const keepEntries = [entry('p2', 'tc-2')];
    const keepAdjustments = [adj('tc-2', '2026-10-09', 'noLesson')];
    await manage.saveAll(keepEntries, true, keepAdjustments);

    const saved = repo.read();
    expect(saved?.entries.map((e) => e.classId)).toEqual(['tc-2']);
    expect(saved?.lessonDayAdjustments?.map((a) => a.classId)).toEqual(['tc-2']);
  });

  it('saveAll에 정정을 안 넘기면 기존 정정을 그대로 둔다 (하위호환)', async () => {
    const { repo, manage } = setup({
      entries: [entry('p1')],
      lessonDayAdjustments: [adj('tc-1', '2026-10-09', 'hasLesson')],
    });

    await manage.saveAll([entry('p1'), entry('p2')]);

    expect(repo.read()?.lessonDayAdjustments).toHaveLength(1);
  });

  it('정정을 빈 배열로 넘기면 전부 지운다', async () => {
    const { repo, manage } = setup({
      entries: [],
      lessonDayAdjustments: [adj('tc-1', '2026-10-09', 'hasLesson')],
    });

    await manage.saveAll([], true, []);

    expect(repo.read()?.lessonDayAdjustments).toEqual([]);
  });
});
