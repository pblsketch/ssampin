import { beforeEach, describe, expect, it } from 'vitest';
import type { IStoragePort } from '@domain/ports/IStoragePort';
import type { ClassroomAgreementSession } from '@domain/entities/ClassroomAgreement';
import { CLASSROOM_AGREEMENT_SCHEMA_VERSION } from '@domain/entities/ClassroomAgreement';
import {
  CLASSROOM_AGREEMENTS_STORAGE_KEY,
  JsonClassroomAgreementRepository,
} from './JsonClassroomAgreementRepository';

class FakeStorage implements IStoragePort {
  readonly files = new Map<string, unknown>();

  async read<T>(filename: string): Promise<T | null> {
    return this.files.has(filename) ? (this.files.get(filename) as T) : null;
  }

  async write<T>(filename: string, data: T): Promise<void> {
    this.files.set(filename, data);
  }

  async remove(filename: string): Promise<void> {
    this.files.delete(filename);
  }

  async readBinary(): Promise<Uint8Array | null> {
    return null;
  }

  async writeBinary(): Promise<void> {
    return undefined;
  }

  async removeBinary(): Promise<void> {
    return undefined;
  }

  async listBinary(): Promise<readonly string[]> {
    return [];
  }
}

const buildSession = (
  overrides: Partial<ClassroomAgreementSession> = {},
): ClassroomAgreementSession => ({
  schemaVersion: CLASSROOM_AGREEMENT_SCHEMA_VERSION,
  id: 'session-1',
  title: '수업 약속',
  agreementType: 'lesson-rule',
  classContext: { kind: 'manual', label: '3학년 2반' },
  scenes: [{ id: 'scene-1', label: '수업 시작', order: 1 }],
  activeSceneId: 'scene-1',
  phase: 'finalized',
  settings: {
    maxProposalsPerStudent: 2,
    priorityVoteLimit: 2,
    allowNickname: true,
    defaultShowAuthor: false,
    allowProposalsDuringReview: false,
    saveMode: 'finalOnly',
  },
  participants: [
    {
      studentToken: 'token-1',
      displayName: '학생1',
      joinedAt: 1000,
      lastSeenAt: 2000,
    },
  ],
  proposals: [
    {
      id: 'proposal-1',
      sceneId: 'scene-1',
      studentToken: 'token-1',
      displayName: '학생1',
      ifText: '만약 수업 시작 종이 울리면',
      thenText: '우리는 자리에 앉아 책과 노트를 펼친다',
      submittedAt: 1200,
    },
  ],
  candidates: [
    {
      id: 'candidate-1',
      sceneId: 'scene-1',
      sourceProposalIds: ['proposal-1'],
      authorLabels: ['학생1'],
      ifText: '만약 수업 시작 종이 울리면',
      thenText: '우리는 자리에 앉아 책과 노트를 펼친다',
      showAuthors: false,
      validationIssues: [],
      refinementVotes: [],
      priorityVotes: [],
      status: 'finalized',
    },
  ],
  finalItems: [
    {
      sceneId: 'scene-1',
      sceneLabel: '수업 시작',
      items: [
        {
          id: 'final-1',
          sceneId: 'scene-1',
          ifText: '만약 수업 시작 종이 울리면',
          thenText: '우리는 자리에 앉아 책과 노트를 펼친다',
          showAuthors: false,
          authorLabels: ['학생1'],
          priorityRank: 1,
        },
      ],
    },
  ],
  createdAt: 1000,
  updatedAt: 2000,
  ...overrides,
});

describe('JsonClassroomAgreementRepository', () => {
  let storage: FakeStorage;
  let repo: JsonClassroomAgreementRepository;

  beforeEach(() => {
    storage = new FakeStorage();
    repo = new JsonClassroomAgreementRepository(storage);
  });

  it('saves finalOnly sessions without raw student process data', async () => {
    const saved = await repo.saveSession(buildSession(), { savedAt: 3000 });

    expect(saved.process).toBeUndefined();
    expect(saved.finalItems[0]!.items[0]!.authorLabels).toEqual([]);

    const raw = JSON.stringify(storage.files.get(CLASSROOM_AGREEMENTS_STORAGE_KEY));
    expect(raw).not.toContain('studentToken');
    expect(raw).not.toContain('token-1');
    expect(raw).not.toContain('proposals');
  });

  it('keeps process data when includeProcess is explicitly selected', async () => {
    const saved = await repo.saveSession(buildSession(), {
      saveMode: 'includeProcess',
      savedAt: 3000,
    });

    expect(saved.process?.participants).toHaveLength(1);
    expect(saved.process?.proposals).toHaveLength(1);
    expect(JSON.stringify(storage.files.get(CLASSROOM_AGREEMENTS_STORAGE_KEY))).toContain(
      'studentToken',
    );
  });

  it('replaces a saved session with the same id and keeps newest first', async () => {
    await repo.saveSession(buildSession({ id: 'old-session', title: '이전' }));
    await repo.saveSession(buildSession({ id: 'session-1', title: '처음' }));
    await repo.saveSession(buildSession({ id: 'session-1', title: '수정' }));

    const items = await repo.list();
    expect(items.map((item) => item.title)).toEqual(['수정', '이전']);
  });

  it('deletes saved sessions by id', async () => {
    await repo.saveSession(buildSession({ id: 'session-1' }));
    await repo.saveSession(buildSession({ id: 'session-2' }));

    await repo.delete('session-1');

    expect((await repo.list()).map((item) => item.id)).toEqual(['session-2']);
  });
});
