import Image from 'next/image';
import FadeIn from './FadeIn';

export default function Screenshot() {
  return (
    <section className="bg-sp-bg px-6 pb-20">
      <FadeIn className="mx-auto max-w-5xl">
        <div className="overflow-hidden rounded-2xl border border-sp-border bg-sp-card p-1.5 shadow-2xl shadow-slate-900/15 ring-1 ring-sp-border/60">
          <Image
            src="/images/dashboard.png"
            alt="쌤핀 대시보드 화면"
            width={1916}
            height={982}
            className="h-auto w-full rounded-xl"
            priority
          />
        </div>
      </FadeIn>
    </section>
  );
}
