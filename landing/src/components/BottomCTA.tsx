import FadeIn from './FadeIn';
import DownloadButton from './DownloadButton';

export default function BottomCTA() {
  return (
    <section className="border-t-2 border-sp-accent bg-sp-card py-20">
      <div className="mx-auto max-w-6xl px-6 text-center">
        <FadeIn>
          <p className="mb-3 text-[0.7rem] font-semibold uppercase tracking-widest text-sp-accent">
            무료 · Windows 10/11
          </p>
          <h2 className="text-3xl font-bold text-sp-text md:text-4xl">
            지금 바로 시작하세요
          </h2>
        </FadeIn>
        <FadeIn delay={0.15}>
          <div className="mt-10">
            <DownloadButton />
            <div className="mt-5 flex justify-center">
              <a
                href="https://supsori.notion.site/SsamPin-v0-3-7-32176e6c2ab781dc905ce780e03c5be4"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-medium text-sp-muted transition-colors hover:text-sp-text"
              >
                <span className="text-base">📖</span>
                사용 가이드 보기
                <span className="text-xs">→</span>
              </a>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
