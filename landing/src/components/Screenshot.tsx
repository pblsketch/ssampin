import FadeIn from './FadeIn';

export default function Screenshot() {
  return (
    <section className="bg-sp-bg px-6 pb-20">
      <FadeIn className="mx-auto max-w-5xl">
        <div className="flex h-[300px] items-center justify-center rounded-2xl border border-white/10 bg-sp-card shadow-2xl shadow-blue-500/10 md:h-[450px]">
          <div className="text-center">
            <p className="text-4xl">🖥️</p>
            <p className="mt-3 text-sp-muted">스크린샷 준비 중</p>
            <p className="mt-1 text-sm text-sp-muted/60">앱 완성 후 실제 화면으로 교체됩니다</p>
          </div>
        </div>
      </FadeIn>
    </section>
  );
}
