import { CheckPageContent } from '@/components/check/CheckPageContent';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata() {
  return {
    title: '설문 응답 - 쌤핀',
    description: '쌤핀 설문에 응답하세요.',
    robots: { index: false, follow: false },
  };
}

export default async function CheckPage({ params }: PageProps) {
  const { id } = await params;
  return <CheckPageContent surveyId={id} />;
}
