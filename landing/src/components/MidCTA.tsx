import FadeIn from './FadeIn';
import DownloadButton from './DownloadButton';

export default function MidCTA() {
  return (
    <section className="bg-sp-surface py-14">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <FadeIn>
          <p className="mb-5 text-lg font-semibold text-sp-text">
            무료로 시작해 보세요
          </p>
          <DownloadButton />
        </FadeIn>
      </div>
    </section>
  );
}
