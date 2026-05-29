import { describe, it, expect } from 'vitest';
import { SessionOnlyStudentPiiRepository } from './SessionOnlyStudentPiiRepository';
import type { StudentPiiOverlay } from '@domain/entities/StudentPiiOverlay';

/**
 * SessionOnlyStudentPiiRepository test
 *
 * Acceptance: 'writes vanish on dispose'
 */

describe('SessionOnlyStudentPiiRepository', () => {
  it('saves and reads back overlays before dispose', async () => {
    const repo = new SessionOnlyStudentPiiRepository();
    const overlay: StudentPiiOverlay = { studentId: 's1', gender: 'M', academicLevel: 'A' };
    await repo.save(overlay);

    expect(await repo.get('s1')).toEqual(overlay);
    expect(await repo.getAll()).toEqual([overlay]);
    expect(repo.version()).toBeGreaterThan(0);
  });

  it('writes vanish on dispose (Acceptance C#7 + Decision 10)', async () => {
    const repo = new SessionOnlyStudentPiiRepository();
    await repo.save({ studentId: 's1', gender: 'F' });
    await repo.save({ studentId: 's2', academicLevel: 'B' });

    await repo.dispose();

    expect(await repo.getAll()).toEqual([]);
    expect(await repo.get('s1')).toBeNull();
    expect(await repo.get('s2')).toBeNull();
  });

  it('throws on save() after dispose', async () => {
    const repo = new SessionOnlyStudentPiiRepository();
    await repo.dispose();
    await expect(repo.save({ studentId: 's1' })).rejects.toThrow(/disposed/);
  });

  it('delete() before dispose increments version', async () => {
    const repo = new SessionOnlyStudentPiiRepository();
    await repo.save({ studentId: 's1' });
    const v1 = repo.version();
    await repo.delete('s1');
    const v2 = repo.version();
    expect(v2).toBeGreaterThan(v1);
    expect(await repo.get('s1')).toBeNull();
  });

  it('saveAll() replaces full snapshot', async () => {
    const repo = new SessionOnlyStudentPiiRepository();
    await repo.save({ studentId: 's1', gender: 'M' });
    await repo.saveAll([
      { studentId: 's2', gender: 'F' },
      { studentId: 's3', academicLevel: 'C' },
    ]);
    expect(await repo.get('s1')).toBeNull();
    const all = await repo.getAll();
    expect(all).toHaveLength(2);
  });
});
