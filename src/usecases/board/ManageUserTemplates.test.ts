/**
 * ManageUserTemplates + ManageBoard.createFromUserTemplate 유스케이스 테스트
 * (PDCA-4 / G006). 실제 코덱(BoardSnapshotCodec) + in-memory 레포 페이크 조합.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import type { Board } from '@domain/entities/Board';
import type {
  OpaqueBoardElement,
  UserTemplate,
  UserTemplateMeta,
} from '@domain/entities/UserTemplate';
import type { IUserTemplateRepo } from '@domain/ports/IUserTemplateRepo';
import type { IBoardRepository } from '@domain/repositories/IBoardRepository';
import type { BoardId } from '@domain/valueObjects/BoardId';
import { BoardSnapshotCodec } from '../../infrastructure/board/boardSnapshotCodec';

import { ManageBoard } from './ManageBoard';
import { ManageUserTemplates } from './ManageUserTemplates';

const codec = new BoardSnapshotCodec();

class FakeUserTemplateRepo implements IUserTemplateRepo {
  store = new Map<string, UserTemplate>();
  private seq = 0;

  async listAll(): Promise<UserTemplateMeta[]> {
    return [...this.store.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(({ elements: _e, ...meta }) => meta);
  }

  async load(id: string): Promise<UserTemplate | null> {
    return this.store.get(id) ?? null;
  }

  async save(input: {
    readonly name: string;
    readonly versionSchema: string;
    readonly elements: ReadonlyArray<OpaqueBoardElement>;
  }): Promise<UserTemplate> {
    this.seq += 1;
    const tpl: UserTemplate = {
      id: `tpl-fake-${this.seq}`,
      name: input.name,
      createdAt: this.seq, // 단조 증가로 최신순 검증 가능
      versionSchema: input.versionSchema,
      elementCount: input.elements.length,
      elements: input.elements,
    };
    this.store.set(tpl.id, tpl);
    return tpl;
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}

class FakeBoardRepo implements IBoardRepository {
  boards = new Map<string, Board>();
  snapshots = new Map<string, Uint8Array>();
  private seq = 0;

  async listAll(): Promise<Board[]> {
    return [...this.boards.values()];
  }
  async get(id: BoardId): Promise<Board | null> {
    const b = this.boards.get(String(id));
    if (!b) return null;
    return { ...b, hasSnapshot: this.snapshots.has(String(id)) };
  }
  async create(input: { readonly name: string }): Promise<Board> {
    this.seq += 1;
    const board: Board = {
      id: `bd-fake-${this.seq}` as BoardId,
      name: input.name,
      createdAt: this.seq,
      updatedAt: this.seq,
      lastSessionEndedAt: null,
      participantHistory: [],
      hasSnapshot: false,
      templateId: null,
    };
    this.boards.set(String(board.id), board);
    return board;
  }
  async rename(): Promise<Board> {
    throw new Error('not used');
  }
  async delete(): Promise<void> {
    throw new Error('not used');
  }
  async saveSnapshot(id: BoardId, update: Uint8Array): Promise<void> {
    this.snapshots.set(String(id), update);
  }
  async loadSnapshot(id: BoardId): Promise<Uint8Array | null> {
    return this.snapshots.get(String(id)) ?? null;
  }
  async appendParticipantHistory(): Promise<void> {
    /* not used */
  }
  async touchSessionEnd(): Promise<void> {
    /* not used */
  }
}

const ELEMENTS: OpaqueBoardElement[] = [
  { id: 'el-1', type: 'rectangle', isDeleted: false },
  { id: 'el-2', type: 'text', containerId: 'el-1', isDeleted: false },
];

let tplRepo: FakeUserTemplateRepo;
let usecase: ManageUserTemplates;

beforeEach(() => {
  tplRepo = new FakeUserTemplateRepo();
  usecase = new ManageUserTemplates(tplRepo, codec);
});

describe('ManageUserTemplates.saveFromSnapshot (AC-4.1)', () => {
  it('스냅샷에서 살아있는 요소를 추출해 저장한다', async () => {
    const snapshot = codec.buildSnapshot([
      ...ELEMENTS,
      { id: 'ghost', type: 'rectangle', isDeleted: true },
    ]);
    const saved = await usecase.saveFromSnapshot('수업 시작 보드', snapshot);
    expect(saved.name).toBe('수업 시작 보드');
    expect(saved.versionSchema).toBe('0.17.6');
    expect(saved.elements.map((el) => el.id)).toEqual(['el-1', 'el-2']);
  });

  it('빈 보드(요소 0)는 USER_TEMPLATE_EMPTY 로 거부한다', async () => {
    await expect(usecase.saveFromSnapshot('빈 것', codec.buildSnapshot([]))).rejects.toThrow(
      'USER_TEMPLATE_EMPTY',
    );
  });

  it('이름이 비면 "내 템플릿 N" 자동 부여 + 40자 초과는 자른다', async () => {
    const snapshot = codec.buildSnapshot(ELEMENTS);
    const first = await usecase.saveFromSnapshot('   ', snapshot);
    expect(first.name).toBe('내 템플릿 1');
    const second = await usecase.saveFromSnapshot(undefined, snapshot);
    expect(second.name).toBe('내 템플릿 2');
    const long = await usecase.saveFromSnapshot('가'.repeat(50), snapshot);
    expect(long.name).toBe('가'.repeat(40));
  });
});

describe('ManageBoard.createFromUserTemplate (AC-4.2)', () => {
  it('저장된 요소가 새 보드 스냅샷에 verbatim 재시딩된다', async () => {
    const tpl = await usecase.saveFromSnapshot('모둠판', codec.buildSnapshot(ELEMENTS));
    const boardRepo = new FakeBoardRepo();
    const manage = new ManageBoard(boardRepo, undefined, tplRepo, codec);

    const board = await manage.createFromUserTemplate(undefined, tpl.id);
    expect(board.name).toBe('모둠판'); // 이름 비우면 템플릿 이름 승계
    expect(board.hasSnapshot).toBe(true);

    const snapshot = await boardRepo.loadSnapshot(board.id);
    expect(codec.extractElements(snapshot as Uint8Array)).toEqual(ELEMENTS);
  });

  it('보드 이름을 지정하면 그 이름을 쓴다', async () => {
    const tpl = await usecase.saveFromSnapshot('모둠판', codec.buildSnapshot(ELEMENTS));
    const boardRepo = new FakeBoardRepo();
    const manage = new ManageBoard(boardRepo, undefined, tplRepo, codec);
    const board = await manage.createFromUserTemplate('3반 토론', tpl.id);
    expect(board.name).toBe('3반 토론');
  });

  it('없는 템플릿 id 는 USER_TEMPLATE_NOT_FOUND', async () => {
    const manage = new ManageBoard(new FakeBoardRepo(), undefined, tplRepo, codec);
    await expect(manage.createFromUserTemplate(undefined, 'tpl-missing')).rejects.toThrow(
      'USER_TEMPLATE_NOT_FOUND',
    );
  });

  it('의존 미주입이면 USER_TEMPLATE_UNAVAILABLE (방어)', async () => {
    const manage = new ManageBoard(new FakeBoardRepo());
    await expect(manage.createFromUserTemplate(undefined, 'tpl-x')).rejects.toThrow(
      'USER_TEMPLATE_UNAVAILABLE',
    );
  });
});

describe('ManageUserTemplates 목록·삭제 (AC-4.3)', () => {
  it('listAll 은 최신순, delete 후 목록에서 사라진다', async () => {
    const snapshot = codec.buildSnapshot(ELEMENTS);
    const a = await usecase.saveFromSnapshot('A', snapshot);
    const b = await usecase.saveFromSnapshot('B', snapshot);
    expect((await usecase.listAll()).map((t) => t.id)).toEqual([b.id, a.id]);
    await usecase.delete(b.id);
    expect((await usecase.listAll()).map((t) => t.id)).toEqual([a.id]);
  });
});
