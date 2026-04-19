/**
 * FileBoardRepository — IBoardRepository 구현
 *
 * BoardFilePersistence 유틸을 래핑하여 id 생성·메타 갱신·참여 이력 병합 등
 * 도메인 레포 인터페이스 계약을 구현한다.
 *
 * **위치 결정(Design §11.1 변경)**: Design 초안은 `src/adapters/repositories/`에
 * 배치하도록 적었지만 BoardFilePersistence(파일시스템 직접 접근 infra)를 사용하고
 * 기존 `Json*Repository` 패턴(IStoragePort만 주입)과 성격이 다르므로 **infrastructure**
 * 레이어로 이동. adapters → infrastructure 직접 import를 피하면서 Clean Architecture
 * 준수. container.ts가 조립 시 import (adapters/di/container.ts 예외 규칙).
 */
import crypto from 'crypto';

import type { Board } from '@domain/entities/Board';
import type { BoardId } from '@domain/valueObjects/BoardId';
import type { IBoardRepository } from '@domain/repositories/IBoardRepository';
import { mergeParticipantHistory } from '@domain/rules/boardRules';

import { BoardFilePersistence } from './BoardFilePersistence';
import {
  BOARD_ID_PREFIX,
  BOARD_ID_SUFFIX_LENGTH,
} from './constants';

export class FileBoardRepository implements IBoardRepository {
  constructor(private readonly persistence: BoardFilePersistence) {}

  async listAll(): Promise<Board[]> {
    return this.persistence.listAllMeta();
  }

  async get(id: BoardId): Promise<Board | null> {
    return this.persistence.getMeta(id);
  }

  async create(input: { readonly name: string }): Promise<Board> {
    const id = generateBoardId();
    const now = Date.now();
    const board: Board = {
      id,
      name: input.name,
      createdAt: now,
      updatedAt: now,
      lastSessionEndedAt: null,
      participantHistory: [],
      hasSnapshot: false,
    };
    await this.persistence.saveMeta(board);
    return board;
  }

  async rename(id: BoardId, name: string): Promise<Board> {
    const current = await this.persistence.getMeta(id);
    if (!current) throw new Error('BOARD_NOT_FOUND');
    const updated: Board = {
      ...current,
      name,
      updatedAt: Date.now(),
    };
    await this.persistence.saveMeta(updated);
    return updated;
  }

  async delete(id: BoardId): Promise<void> {
    await this.persistence.deleteAll(id);
  }

  async saveSnapshot(id: BoardId, update: Uint8Array): Promise<void> {
    await this.persistence.saveSnapshot(id, update);
    // 메타 touch — updatedAt 갱신
    const current = await this.persistence.getMeta(id);
    if (current) {
      await this.persistence.saveMeta({
        ...current,
        updatedAt: Date.now(),
        // hasSnapshot은 getMeta가 파일 존재로 재계산하므로 명시적 true
        hasSnapshot: true,
      });
    }
  }

  async loadSnapshot(id: BoardId): Promise<Uint8Array | null> {
    return this.persistence.loadSnapshot(id);
  }

  async appendParticipantHistory(
    id: BoardId,
    names: ReadonlyArray<string>,
  ): Promise<void> {
    const current = await this.persistence.getMeta(id);
    if (!current) return;
    const merged = mergeParticipantHistory(current.participantHistory, names);
    const now = Date.now();
    const updated: Board = {
      ...current,
      participantHistory: merged,
      lastSessionEndedAt: now,
      updatedAt: now,
    };
    await this.persistence.saveMeta(updated);
  }
}

/** `bd-` + 14자 url-safe — Design §2.2 포맷 */
function generateBoardId(): BoardId {
  const raw = crypto
    .randomBytes(11)
    .toString('base64')
    .replace(/\+/g, '_')
    .replace(/\//g, '-')
    .replace(/=/g, '')
    .slice(0, BOARD_ID_SUFFIX_LENGTH);
  return `${BOARD_ID_PREFIX}${raw}` as BoardId;
}
