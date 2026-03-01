import FadeIn from './FadeIn';

const checklist = [
  '시간표 + 일정 한눈에',
  '투명도 자유롭게 조절',
  '항상 위에 표시',
  '크기 자유롭게 조절',
];

export default function WidgetMode() {
  return (
    <section className="bg-sp-bg py-20">
      <div className="mx-auto max-w-6xl px-6">
        <FadeIn className="text-center md:text-left">
          <h2 className="text-center text-3xl font-bold text-sp-text md:text-4xl">
            바탕화면 위의 작은 비서 💡
          </h2>
        </FadeIn>

        <div className="mt-12 flex flex-col items-center gap-10 md:flex-row md:gap-16">
          <FadeIn className="w-full md:w-1/2">
            <div className="flex h-[250px] items-center justify-center rounded-2xl border border-white/10 bg-sp-card md:h-[300px]">
              <div className="text-center">
                <p className="text-4xl">🖼️</p>
                <p className="mt-3 text-sp-muted">위젯 모드 스크린샷 준비 중</p>
              </div>
            </div>
          </FadeIn>

          <FadeIn className="w-full md:w-1/2" delay={0.15}>
            <p className="mb-6 text-lg text-sp-muted">
              위젯 모드로 바탕화면 구석에
              <br />
              항상 띄워두세요.
            </p>
            <ul className="space-y-4">
              {checklist.map((item) => (
                <li key={item} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-sm text-blue-400">
                    ✓
                  </span>
                  <span className="text-sp-text">{item}</span>
                </li>
              ))}
            </ul>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}
