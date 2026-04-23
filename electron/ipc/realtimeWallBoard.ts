/**
 * 실시간 담벼락 영속 보드 IPC 핸들러
 *
 * Design §3.4 — Stage A 범위 IPC 채널 (Main 프로세스가 fs 직접 접근):
 *
 *   realtime-wall:board:list-meta      목록 화면 로드
 *   realtime-wall:board:load           보드 열기
 *   realtime-wall:board:save           자동/수동 저장
 *   realtime-wall:board:delete         삭제
 *   realtime-wall:board:get-by-code    shortCode 역조회
 *
 * 저장 위치: `userData/data/wall-board-{id}.json` + `wall-boards-index.json`.
 * 이는 renderer의 `JsonWallBoardRepository`가 쓰는 파일명과 동일하므로, Main이
 * before-quit 동기 저장이나 shortCode 충돌 검사를 수행할 때도 같은 파일을 본다.
 *
 * Stage A는 Main 직접 저장 경로만 제공. clone/승인 정책 IPC는 Stage C/D에서 추가.
 */
import { app, ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';

import type {
  WallBoard,
  WallBoardId,
  WallBoardMeta,
} from '../../src/domain/entities/RealtimeWall';

const INDEX_FILE = 'wall-boards-index.json';
const BOARD_FILE_PREFIX = 'wall-board-';

function getDataDir(): string {
  const dir = path.join(app.getPath('userData'), 'data');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function boardFilePath(id: WallBoardId): string {
  return path.join(getDataDir(), `${BOARD_FILE_PREFIX}${id}.json`);
}

function indexFilePath(): string {
  return path.join(getDataDir(), INDEX_FILE);
}

interface WallBoardIndex {
  readonly version: 1;
  readonly boards: readonly WallBoardMeta[];
}

function readIndexSync(): WallBoardIndex {
  const p = indexFilePath();
  if (!fs.existsSync(p)) return { version: 1, boards: [] };
  try {
    const raw = fs.readFileSync(p, 'utf-8');
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      Array.isArray((parsed as WallBoardIndex).boards)
    ) {
      return parsed as WallBoardIndex;
    }
  } catch {
    /* fall through — 손상 파일은 무시 */
  }
  return { version: 1, boards: [] };
}

function writeIndexSync(idx: WallBoardIndex): void {
  fs.writeFileSync(indexFilePath(), JSON.stringify(idx, null, 2), 'utf-8');
}

function readBoardSync(id: WallBoardId): WallBoard | null {
  const p = boardFilePath(id);
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, 'utf-8');
    return JSON.parse(raw) as WallBoard;
  } catch {
    return null;
  }
}

function writeBoardSync(board: WallBoard): void {
  fs.writeFileSync(
    boardFilePath(board.id),
    JSON.stringify(board, null, 2),
    'utf-8',
  );
}

/**
 * WallBoard → WallBoardMeta 변환 (renderer 쪽 규칙과 동일).
 *
 * 도메인 규칙을 Main에서 import하면 빌드 타겟/환경 이슈가 있을 수 있으나
 * `toWallBoardMeta`는 순수 함수이며 @domain은 모든 환경에서 안전하게 import
 * 가능 (React/Zustand/Electron 의존 없음). 이로써 같은 변환을 보장한다.
 */
import {
  toWallBoardMeta,
  buildWallPreviewPosts as _buildWallPreviewPosts,
} from '../../src/domain/rules/realtimeWallRules';

// unused import 방지 (buildWallPreviewPosts는 toWallBoardMeta 내부에서 쓰임)
void _buildWallPreviewPosts;

function upsertIndexEntry(board: WallBoard): void {
  const idx = readIndexSync();
  const meta = toWallBoardMeta(board);
  const existing = idx.boards.findIndex((b) => b.id === board.id);
  const nextBoards =
    existing >= 0
      ? idx.boards.map((b, i) => (i === existing ? meta : b))
      : [...idx.boards, meta];
  writeIndexSync({ version: 1, boards: nextBoards });
}

function removeIndexEntry(id: WallBoardId): void {
  const idx = readIndexSync();
  const nextBoards = idx.boards.filter((b) => b.id !== id);
  writeIndexSync({ version: 1, boards: nextBoards });
}

export function registerRealtimeWallBoardHandlers(): void {
  ipcMain.handle(
    'realtime-wall:board:list-meta',
    async (): Promise<readonly WallBoardMeta[]> => {
      return readIndexSync().boards;
    },
  );

  ipcMain.handle(
    'realtime-wall:board:load',
    async (_e, args: { id: WallBoardId }): Promise<WallBoard | null> => {
      return readBoardSync(args.id);
    },
  );

  ipcMain.handle(
    'realtime-wall:board:save',
    async (_e, args: { board: WallBoard }): Promise<{ savedAt: number }> => {
      writeBoardSync(args.board);
      upsertIndexEntry(args.board);
      return { savedAt: Date.now() };
    },
  );

  ipcMain.handle(
    'realtime-wall:board:delete',
    async (_e, args: { id: WallBoardId }): Promise<{ ok: true }> => {
      const p = boardFilePath(args.id);
      if (fs.existsSync(p)) fs.unlinkSync(p);
      removeIndexEntry(args.id);
      return { ok: true };
    },
  );

  ipcMain.handle(
    'realtime-wall:board:get-by-code',
    async (_e, args: { shortCode: string }): Promise<WallBoard | null> => {
      const idx = readIndexSync();
      const meta = idx.boards.find((b) => b.shortCode === args.shortCode);
      if (!meta) return null;
      return readBoardSync(meta.id);
    },
  );
}
