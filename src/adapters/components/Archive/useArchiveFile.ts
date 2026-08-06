/**
 * useArchiveFile — 보관함 파일 읽기 전용 훅 (P3 S3.2).
 *
 * archive:read IPC(체크섬 검증 포함)로 아카이브 JSON을 읽는다.
 * 라이브 스토어에 절대 넣지 않는다 — 컴포넌트 로컬 상태 + 모듈 캐시뿐.
 * 파일 부재·검증 실패는 error 문자열로 표면화한다(조용한 무시 금지).
 */

import { useEffect, useState } from 'react';

interface ArchiveFileState {
  readonly loading: boolean;
  /** JSON.parse 결과(관대 파서에 그대로 전달). 부재·오류면 null. */
  readonly data: unknown;
  readonly error: string | null;
}

const cache = new Map<string, unknown>();

/** 테스트·전환 후 최신화용 캐시 무효화. */
export function invalidateArchiveFileCache(): void {
  cache.clear();
}

export function useArchiveFile(term: string, fileKey: string): ArchiveFileState {
  const cacheKey = `${term}/${fileKey}`;
  const [state, setState] = useState<ArchiveFileState>(() =>
    cache.has(cacheKey)
      ? { loading: false, data: cache.get(cacheKey), error: null }
      : { loading: true, data: null, error: null },
  );

  useEffect(() => {
    let alive = true;
    if (cache.has(cacheKey)) {
      setState({ loading: false, data: cache.get(cacheKey), error: null });
      return;
    }
    const api = window.electronAPI?.archive;
    if (!api) {
      setState({ loading: false, data: null, error: '데스크톱 앱에서만 열람할 수 있어요.' });
      return;
    }
    setState({ loading: true, data: null, error: null });
    void api
      .read(term, fileKey)
      .then((res) => {
        if (!alive) return;
        if (!res.ok) {
          setState({ loading: false, data: null, error: res.error });
          return;
        }
        try {
          const parsed: unknown = JSON.parse(res.content);
          cache.set(cacheKey, parsed);
          setState({ loading: false, data: parsed, error: null });
        } catch {
          setState({ loading: false, data: null, error: '보관된 파일을 해석할 수 없어요.' });
        }
      })
      .catch(() => {
        if (alive) setState({ loading: false, data: null, error: '보관함을 읽지 못했어요.' });
      });
    return () => {
      alive = false;
    };
  }, [term, fileKey, cacheKey]);

  return state;
}

/** 바이너리(관찰 첨부) 읽기 — data URL 반환. 실패 시 null+오류. */
export async function readArchiveBinaryAsDataUrl(
  term: string,
  fileKey: string,
  mimeType: string,
): Promise<{ url: string | null; error: string | null }> {
  const api = window.electronAPI?.archive;
  if (!api) return { url: null, error: '데스크톱 앱에서만 열람할 수 있어요.' };
  try {
    const res = await api.read(term, fileKey);
    if (!res.ok) return { url: null, error: res.error };
    if (res.encoding !== 'base64') return { url: null, error: '첨부 형식을 해석할 수 없어요.' };
    return { url: `data:${mimeType};base64,${res.content}`, error: null };
  } catch {
    return { url: null, error: '첨부를 읽지 못했어요.' };
  }
}
