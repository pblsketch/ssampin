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
  const { code } = await params;

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/short_links?code=eq.${encodeURIComponent(code)}&select=target_path&limit=1`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      cache: 'no-store',
    },
  );

  if (!res.ok) {
    notFound();
  }

  const data = (await res.json()) as Array<{ target_path: string }>;

  if (!data || data.length === 0) {
    notFound();
  }

  redirect(data[0].target_path);
}
