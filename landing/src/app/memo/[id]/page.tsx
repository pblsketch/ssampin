import { MemoBoardContent } from '@/components/memo/MemoBoardContent';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  return {
    title: '우리 반 메모 - 쌤핀',
    description: '선생님이 공유한 우리 반 메모 보드입니다.',
    robots: { index: false, follow: false },
    manifest: `/memo/${id}/manifest.webmanifest`,
  };
}

export default async function MemoPage({ params }: PageProps) {
  const { id } = await params;
  return <MemoBoardContent fileId={id} />;
}
