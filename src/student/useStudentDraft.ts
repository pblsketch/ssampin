import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeWallCardColor } from '@domain/entities/RealtimeWall';

/**
 * v2.1 신규 (Phase A-A3 / Plan FR-A3 / Design v2.1 §2.3 / §5.1).
 *
 * 학생 카드 작성 드래프트 — localStorage 영속.
 *
 * 정책:
 * - **보드+세션 단위 키 분리**: `ssampin-realtime-wall-draft-{boardKey}-{sessionToken}`
 *   → 같은 PC에서 다보드 동시 작성 + 같은 보드 다른 세션 분리 (Plan FR-A3)
 * - **이미지/PDF는 base64 미보존** (Plan §6 Risks — localStorage quota 초과 방지)
 *   → 메타 플래그(hasImagesPending / hasPdfPending)만
 * - **debounced 1초 자동 저장** (입력마다 즉시 저장 시 quota 폭증 방지)
 * - 모달 닫을 때 보존 (clearDraft 호출은 명시적 — submit 성공 시만)
 * - 빈 텍스트 + 빈 링크 + 색상 미설정 시는 저장 X (의미없는 드래프트 stale 방지)
 * - SSR 안전 (window 미존재 시 noop)
 *
 * Plan FR-A3 / FR-A4 / FR-A6 / Design v2.1 §13 Phase A 수용 기준 #5.
 */

const DRAFT_VERSION = 2 as const;
const DRAFT_KEY_PREFIX = 'ssampin-realtime-wall-draft';
const DRAFT_SAVE_DEBOUNCE_MS = 1000;

export interface RealtimeWallDraft {
  readonly version: 2;
  readonly boardKey: string;
  readonly sessionToken: string;
  readonly nickname: string;
  readonly text: string;
  readonly linkUrl: string;
  readonly color?: RealtimeWallCardColor;
  /** 이미지/PDF는 base64 미보존 — UI 안내용 플래그만 */
  readonly hasImagesPending: boolean;
  readonly hasPdfPending: boolean;
  readonly updatedAt: number;
}

export interface DraftInput {
  readonly nickname: string;
  readonly text: string;
  readonly linkUrl: string;
  readonly color?: RealtimeWallCardColor;
  readonly hasImagesPending: boolean;
  readonly hasPdfPending: boolean;
}

export interface UseStudentDraftOptions {
  readonly boardKey: string | null | undefined;
  readonly sessionToken: string | null | undefined;
  /** 초기 로드 시 자동으로 storage에서 읽어오기 */
  readonly autoLoad?: boolean;
}

export interface UseStudentDraftResult {
  /** 현재 storage에 저장된 드래프트 (load 호출 또는 mount autoLoad 결과) */
  readonly draft: RealtimeWallDraft | null;
  /** debounced 저장 — 입력마다 호출 가능 */
  readonly saveDraft: (input: DraftInput) => void;
  /** 즉시 저장 (debounce 우회) — flush가 필요한 경우 */
  readonly flushSaveDraft: (input: DraftInput) => void;
  /** 명시 삭제 (submit 성공 시) */
  readonly clearDraft: () => void;
  /** localStorage에서 다시 읽기 */
  readonly reloadDraft: () => RealtimeWallDraft | null;
}

function buildKey(boardKey: string, sessionToken: string): string {
  // 안전: 키에 특수문자 ([:/]) 회피
  const safeBoard = boardKey.replace(/[^\w가-힣.-]/g, '_').slice(0, 100);
  const safeSession = sessionToken.replace(/[^\w-]/g, '_').slice(0, 64);
  return `${DRAFT_KEY_PREFIX}-${safeBoard}-${safeSession}`;
}

function readDraftFromStorage(key: string): RealtimeWallDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const obj = parsed as Record<string, unknown>;
    if (obj['version'] !== DRAFT_VERSION) return null;
    if (typeof obj['nickname'] !== 'string' || typeof obj['text'] !== 'string') return null;
    return {
      version: DRAFT_VERSION,
      boardKey: typeof obj['boardKey'] === 'string' ? obj['boardKey'] : '',
      sessionToken: typeof obj['sessionToken'] === 'string' ? obj['sessionToken'] : '',
      nickname: obj['nickname'],
      text: obj['text'],
      linkUrl: typeof obj['linkUrl'] === 'string' ? obj['linkUrl'] : '',
      color: typeof obj['color'] === 'string' ? (obj['color'] as RealtimeWallCardColor) : undefined,
      hasImagesPending: obj['hasImagesPending'] === true,
      hasPdfPending: obj['hasPdfPending'] === true,
      updatedAt: typeof obj['updatedAt'] === 'number' ? obj['updatedAt'] : 0,
    };
  } catch {
    return null;
  }
}

function writeDraftToStorage(key: string, draft: RealtimeWallDraft): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // quota exceeded 등 — UI에는 영향 X
  }
}

function removeDraftFromStorage(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // noop
  }
}

/**
 * 드래프트가 비어있는지 — 저장하지 말아야 할 상태인지 판정.
 * (의미 없는 stale draft가 chip에 남는 것 방지)
 */
function isDraftEmpty(input: DraftInput): boolean {
  return (
    input.text.trim().length === 0 &&
    input.linkUrl.trim().length === 0 &&
    input.color === undefined &&
    !input.hasImagesPending &&
    !input.hasPdfPending
  );
}

export function useStudentDraft(options: UseStudentDraftOptions): UseStudentDraftResult {
  const { boardKey, sessionToken, autoLoad = true } = options;

  const [draft, setDraft] = useState<RealtimeWallDraft | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingInputRef = useRef<DraftInput | null>(null);

  const reloadDraft = useCallback((): RealtimeWallDraft | null => {
    if (!boardKey || !sessionToken) {
      setDraft(null);
      return null;
    }
    const key = buildKey(boardKey, sessionToken);
    const next = readDraftFromStorage(key);
    setDraft(next);
    return next;
  }, [boardKey, sessionToken]);

  // mount + key 변경 시 자동 reload
  useEffect(() => {
    if (autoLoad) reloadDraft();
  }, [autoLoad, reloadDraft]);

  const flushSaveDraft = useCallback(
    (input: DraftInput) => {
      if (!boardKey || !sessionToken) return;
      const key = buildKey(boardKey, sessionToken);
      if (isDraftEmpty(input)) {
        removeDraftFromStorage(key);
        setDraft(null);
        return;
      }
      const next: RealtimeWallDraft = {
        version: DRAFT_VERSION,
        boardKey,
        sessionToken,
        nickname: input.nickname,
        text: input.text,
        linkUrl: input.linkUrl,
        color: input.color,
        hasImagesPending: input.hasImagesPending,
        hasPdfPending: input.hasPdfPending,
        updatedAt: Date.now(),
      };
      writeDraftToStorage(key, next);
      setDraft(next);
    },
    [boardKey, sessionToken],
  );

  const saveDraft = useCallback(
    (input: DraftInput) => {
      pendingInputRef.current = input;
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        if (pendingInputRef.current) {
          flushSaveDraft(pendingInputRef.current);
          pendingInputRef.current = null;
        }
      }, DRAFT_SAVE_DEBOUNCE_MS);
    },
    [flushSaveDraft],
  );

  const clearDraft = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    pendingInputRef.current = null;
    if (!boardKey || !sessionToken) {
      setDraft(null);
      return;
    }
    const key = buildKey(boardKey, sessionToken);
    removeDraftFromStorage(key);
    setDraft(null);
  }, [boardKey, sessionToken]);

  // unmount 시 pending debounce flush (드래프트 손실 방지)
  useEffect(
    () => () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
        if (pendingInputRef.current) {
          flushSaveDraft(pendingInputRef.current);
          pendingInputRef.current = null;
        }
      }
    },
    [flushSaveDraft],
  );

  return {
    draft,
    saveDraft,
    flushSaveDraft,
    clearDraft,
    reloadDraft,
  };
}

// 테스트 / 외부 헬퍼용 export
export const REALTIME_WALL_DRAFT_VERSION = DRAFT_VERSION;
export { buildKey as buildDraftStorageKey };
