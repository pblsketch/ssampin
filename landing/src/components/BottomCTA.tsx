import FadeIn from './FadeIn';
import DownloadButton from './DownloadButton';

export default function BottomCTA() {
  return (
    <section className="bg-gradient-to-r from-blue-800 to-blue-600 py-20">
      <div className="mx-auto max-w-6xl px-6 text-center">
        <FadeIn>
          <h2 className="text-3xl font-bold text-white md:text-4xl">
            지금 바로 시작하세요 📌
          </h2>
        </FadeIn>
        <FadeIn delay={0.15}>
          <div className="mt-8">
            <DownloadButton variant="white" />
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
