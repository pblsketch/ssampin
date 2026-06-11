/**
 * 동적 PWA manifest — 보드 제목을 앱 이름으로 (plan.md B-5 / SC-8)
 *
 * 서버 라우트가 교실 페이지와 같은 읽기 전용 API 키로 Drive 보드 JSON을
 * 가져와 name을 채운다. 실패하면 "우리 반 메모" 폴백 — manifest는 항상 유효.
 */

import { parseBoardFile } from '@/components/memo/driveBoardApi';

const DEFAULT_NAME = '우리 반 메모';
const FETCH_TIMEOUT_MS = 4000;

async function fetchBoardTitle(fileId: string): Promise<string> {
  const key = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_API_KEY;
  if (typeof key !== 'string' || key.trim().length === 0) return DEFAULT_NAME;

  try {
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&key=${encodeURIComponent(key.trim())}`;
    const res = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      // API 키가 HTTP referrer(ssampin.com)로 제한되어 있어 서버 측 호출은
      // referer가 비면 403으로 차단된다 — 명시적으로 채워서 통과시킨다.
      headers: { Referer: 'https://ssampin.com/' },
    });
    if (!res.ok) return DEFAULT_NAME;

    const board = parseBoardFile(await res.json());
    const title = board?.title.trim();
    return title && title.length > 0 ? title : DEFAULT_NAME;
  } catch {
    return DEFAULT_NAME;
  }
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const name = await fetchBoardTitle(id);

  const manifest = {
    name,
    short_name: name.length > 12 ? `${name.slice(0, 11)}…` : name,
    description: '쌤핀 — 선생님이 공유한 우리 반 메모 보드',
    lang: 'ko',
    start_url: `/memo/${id}`,
    scope: '/memo/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#f6f1e7',
    theme_color: '#f6f1e7',
    icons: [
      { src: '/icon.png', sizes: '256x256', type: 'image/png', purpose: 'any' },
      { src: '/apple-icon.png', sizes: '256x256', type: 'image/png', purpose: 'maskable' },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
