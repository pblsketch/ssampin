/**
 * 근거 지도의 **카드 위치 기억**(ADR-106) — 선생님이 손으로 민 만큼을 학생별로 이 기기에만 남긴다.
 *
 * ★기기별 화면 설정이다. 설정 파일·근거 파일·동기화에 넣지 않는다(다른 기기에서 다른 창 크기로 보면 뜻이 없고,
 *   동기화 충돌만 늘린다 — 계획서 §6). `localStorage` 가 없거나 막혀 있으면(사적 모드 등) 조용히 메모리로만 든다.
 * ★값은 자동 자리에 더하는 **차이(dx, dy)** 다. 자료가 바뀌어 자동 자리가 달라져도 손으로 민 만큼은 남는다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import type { MapOffset } from '@adapters/components/RecordDraft/evidenceMapLayout';

const PREFIX = 'ssampin.evidence-map.v1:';

function keyFor(studentRef: string | null): string | null {
  return studentRef === null ? null : `${PREFIX}${studentRef}`;
}

function read(key: string | null): ReadonlyMap<string, MapOffset> {
  if (key === null || typeof window === 'undefined') return new Map();
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return new Map();
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return new Map();
    const out = new Map<string, MapOffset>();
    for (const [id, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v !== 'object' || v === null) continue;
      const { dx, dy } = v as { dx?: unknown; dy?: unknown };
      if (
        typeof dx === 'number' &&
        typeof dy === 'number' &&
        Number.isFinite(dx) &&
        Number.isFinite(dy)
      ) {
        out.set(id, { dx, dy });
      }
    }
    return out;
  } catch {
    return new Map();
  }
}

function write(key: string | null, offsets: ReadonlyMap<string, MapOffset>): void {
  if (key === null || typeof window === 'undefined') return;
  try {
    if (offsets.size === 0) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(Object.fromEntries(offsets)));
  } catch {
    // 저장 공간이 막혀도 화면은 계속 움직인다 — 위치는 있으면 좋은 것이지 자료가 아니다.
  }
}

export interface EvidenceMapPositions {
  readonly offsets: ReadonlyMap<string, MapOffset>;
  /** 카드 하나를 지금 자리에서 (dx, dy) 만큼 더 민다. */
  readonly move: (id: string, dx: number, dy: number) => void;
  /** [카드 위치 정돈] — 손으로 민 값을 전부 비운다. 내용은 바뀌지 않는다. */
  readonly reset: () => void;
  readonly hasCustom: boolean;
  readonly getOffsets: () => ReadonlyMap<string, MapOffset>;
  readonly restore: (offsets: ReadonlyMap<string, MapOffset>) => void;
}

export function useEvidenceMapPositions(studentRef: string | null): EvidenceMapPositions {
  const key = keyFor(studentRef);
  const [offsets, setOffsets] = useState<ReadonlyMap<string, MapOffset>>(() => read(key));

  const current = useRef({ key, offsets });
  const getOffsets = useCallback(
    () => (current.current.key === key ? current.current.offsets : read(key)),
    [key],
  );
  const restore = useCallback(
    (next: ReadonlyMap<string, MapOffset>): void => {
      if (current.current.key === key) {
        current.current = { key, offsets: next };
        setOffsets(next);
      }
      write(key, next);
    },
    [key],
  );

  // 학생이 바뀌면 그 학생 것을 읽는다. 앞 학생의 위치가 따라오지 않게.
  useEffect(() => {
    current.current = { key, offsets: read(key) };
    setOffsets(current.current.offsets);
  }, [key]);

  const move = useCallback(
    (id: string, dx: number, dy: number): void => {
      if (dx === 0 && dy === 0) return;
      const cur = getOffsets().get(id) ?? { dx: 0, dy: 0 };
      const next = new Map(getOffsets());
      next.set(id, { dx: cur.dx + dx, dy: cur.dy + dy });
      restore(next);
    },
    [restore, getOffsets],
  );

  const reset = useCallback((): void => {
    restore(new Map());
  }, [restore]);

  return {
    offsets,
    move,
    reset,
    hasCustom: offsets.size > 0,
    getOffsets,
    restore,
  };
}
