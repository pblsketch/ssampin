import { redirect, notFound } from 'next/navigation';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

interface PageProps {
  params: Promise<{ code: string }>;
}

export async function generateMetadata() {
  return {
    title: '리다이렉트 중... - 쌤핀',
    robots: { index: false, follow: false },
  };
}

export default async function ShortLinkRedirect({ params }: PageProps) {
  const { code: rawCode } = await params;

  // Next.js may pass URL-encoded params for non-ASCII characters (한글 등)
  let code: string;
  try {
    code = decodeURIComponent(rawCode);
  } catch {
    code = rawCode;
  }

  // 예전에는 short_links 를 직접 조회했다. PostgREST 는 클라이언트가 보낸 필터를
  // 신뢰할 뿐이고, target_path 는 공유 링크 원문을 통째로 담아 관리 키까지 딸려 나온다.
  // 지금은 코드 하나만 대조해 목적지 하나를 받는다 — 마이그레이션 057.
  //
  // redirect()/notFound() 는 예외를 던져 흐름을 바꾸는 함수다. try 안에서 부르면
  // 그 예외를 catch 가 삼켜버리므로, 반드시 try 밖에서 부른다.
  let target: string | null = null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/resolve_short_link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ p_code: code }),
      cache: 'no-store',
    });
    if (res.ok) {
      // 스칼라 반환이라 본문은 "/booking/..." 또는 null 이다
      target = (await res.json()) as string | null;
    }
  } catch {
    target = null;
  }

  if (!target) {
    notFound();
  }

  redirect(target);
}
