import { SubmitPageContent } from '@/components/submit/SubmitPageContent';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata() {
  return {
    title: '과제 제출 - 쌤핀',
    description: '쌤핀 과제를 제출하세요.',
    robots: { index: false, follow: false },
  };
}

export default async function SubmitPage({ params }: PageProps) {
  const { id } = await params;
  return <SubmitPageContent assignmentId={id} />;
}
