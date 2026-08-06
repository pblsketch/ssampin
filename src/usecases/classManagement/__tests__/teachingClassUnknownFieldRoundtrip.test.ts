import { describe, it, expect } from 'vitest';
import type { TeachingClassesData } from '@domain/entities/TeachingClass';
import type { IStoragePort } from '@domain/ports/IStoragePort';
import { JsonTeachingClassRepository } from '@adapters/repositories/JsonTeachingClassRepository';
import { ManageTeachingClasses } from '../ManageTeachingClasses';

/**
 * 알 수 없는 필드 왕복 보존 계약 (plan S1.1 AC-6 — 2기기 Drive 왕복의 값싼 대체).
 *
 * 구버전 앱(v2.2.13)이 archived를 모르는 채 저장해도 레코드 수준 필드가 살아남는다는
 * 전제를 신버전 트리에서 잠근다: 리포지토리는 pass-through, ManageTeachingClasses는
 * 레코드 통째 교체(스프레드/원본 유지)라 "모르는 레코드 필드"가 저장을 통과해야 한다.
 * 단, 이 보존은 **레코드 수준에서만** 참이다 — 봉투(파일 루트) 수준 키는
 * `{ classes: ... }` 재조립으로 의도적으로 떨어진다(plan §6.1-㉖, ADR-034가 소유).
 */

class InMemoryStorage implements IStoragePort {
  private files = new Map<string, unknown>();

  read<T>(filename: string): Promise<T | null> {
    // JSON 왕복으로 실제 파일 저장과 같은 직렬화 경계를 재현한다
    const raw = this.files.get(filename);
    return Promise.resolve(raw === undefined ? null : (JSON.parse(JSON.stringify(raw)) as T));
  }

  write<T>(filename: string, data: T): Promise<void> {
    this.files.set(filename, JSON.parse(JSON.stringify(data)));
    return Promise.resolve();
  }

  remove(filename: string): Promise<void> {
    this.files.delete(filename);
    return Promise.resolve();
  }

  readBinary(): Promise<Uint8Array | null> {
    return Promise.resolve(null);
  }
  writeBinary(): Promise<void> {
    return Promise.resolve();
  }
  removeBinary(): Promise<void> {
    return Promise.resolve();
  }
  listBinary(): Promise<readonly string[]> {
    return Promise.resolve([]);
  }
}

const BASE_CLASS = {
  id: 'tc-known',
  name: '3학년 1반',
  subject: '통합과학',
  students: [],
  createdAt: '2026-03-02T00:00:00.000Z',
  updatedAt: '2026-03-02T00:00:00.000Z',
};

describe('teaching-classes 알 수 없는 레코드 필드 왕복 보존', () => {
  it('리포지토리 read→save 왕복이 내용을 바꾸지 않는다 (pass-through)', async () => {
    const storage = new InMemoryStorage();
    const seeded = {
      classes: [{ ...BASE_CLASS, archived: true, futureUnknownField: 'keep-me' }],
    };
    await storage.write('teaching-classes', seeded);

    const repo = new JsonTeachingClassRepository(storage);
    const loaded = await repo.getClasses();
    await repo.saveClasses(loaded as TeachingClassesData);

    const after = await storage.read<unknown>('teaching-classes');
    expect(after).toEqual(seeded);
  });

  it('다른 반을 update해도 건드리지 않은 반의 미지 필드·archived가 살아남는다', async () => {
    const storage = new InMemoryStorage();
    await storage.write('teaching-classes', {
      classes: [
        { ...BASE_CLASS, archived: true, archivedTerm: '2026-1', futureUnknownField: 'keep-me' },
        { ...BASE_CLASS, id: 'tc-other', name: '3학년 2반' },
      ],
    });

    const manage = new ManageTeachingClasses(new JsonTeachingClassRepository(storage));
    await manage.update({ ...BASE_CLASS, id: 'tc-other', name: '3학년 2반 (수정)' });

    const after = await storage.read<{ classes: Array<Record<string, unknown>> }>(
      'teaching-classes',
    );
    const untouched = after?.classes.find((c) => c.id === 'tc-known');
    expect(untouched?.archived).toBe(true);
    expect(untouched?.archivedTerm).toBe('2026-1');
    expect(untouched?.futureUnknownField).toBe('keep-me');
    expect(after?.classes.find((c) => c.id === 'tc-other')?.name).toBe('3학년 2반 (수정)');
  });

  it('add를 해도 기존 반의 미지 필드가 살아남는다', async () => {
    const storage = new InMemoryStorage();
    await storage.write('teaching-classes', {
      classes: [{ ...BASE_CLASS, futureUnknownField: 'keep-me' }],
    });

    const manage = new ManageTeachingClasses(new JsonTeachingClassRepository(storage));
    await manage.add({ ...BASE_CLASS, id: 'tc-new', name: '신규 반' });

    const after = await storage.read<{ classes: Array<Record<string, unknown>> }>(
      'teaching-classes',
    );
    expect(after?.classes.find((c) => c.id === 'tc-known')?.futureUnknownField).toBe('keep-me');
    expect(after?.classes).toHaveLength(2);
  });
});
