import { BookingPageContent } from '@/components/booking/BookingPageContent';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata() {
  return {
    title: '상담 예약 - 쌤핀',
    description: '쌤핀 상담을 예약하세요.',
    robots: { index: false, follow: false },
  };
}

export default async function BookingPage({ params }: PageProps) {
  const { id } = await params;
  return <BookingPageContent scheduleId={id} />;
}
