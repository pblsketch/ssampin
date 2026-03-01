import Image from 'next/image';
import FadeIn from './FadeIn';

export default function Screenshot() {
  return (
    <section className="bg-sp-bg px-6 pb-20">
      <FadeIn className="mx-auto max-w-3xl">
        <div className="overflow-hidden rounded-2xl border border-white/10 shadow-2xl shadow-blue-500/10">
          <Image
            src="/images/dashboard.png"
            alt="쌤핀 대시보드 화면"
            width={1440}
            height={900}
            className="h-auto w-full"
            priority
          />
        </div>
      </FadeIn>
    </section>
  );
}
