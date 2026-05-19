import { MyBookingView } from '@/components/booking/MyBookingView';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata() {
  return {
    title: '내 상담 예약 - 쌤핀',
    description: '내 상담 예약을 변경하거나 취소합니다.',
    robots: { index: false, follow: false },
  };
}

export default async function MyBookingPage({ params }: PageProps) {
  const { id } = await params;
  return <MyBookingView scheduleId={id} />;
}
