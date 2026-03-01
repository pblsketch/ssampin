import FadeIn from './FadeIn';

const steps = [
  {
    number: '1',
    title: '다운로드',
    description: '위 버튼을 클릭하세요',
    emoji: '📥',
  },
  {
    number: '2',
    title: '실행',
    description: '다운받은 파일을 실행하세요',
    emoji: '▶️',
  },
  {
    number: '3',
    title: '완료!',
    description: '바탕화면의 쌤핀 아이콘을 클릭하세요',
    emoji: '📌',
  },
];

export default function InstallGuide() {
  return (
    <section className="bg-sp-bg py-20">
      <div className="mx-auto max-w-6xl px-6">
        <FadeIn className="text-center">
          <h2 className="text-3xl font-bold text-sp-text md:text-4xl">
            설치는 3단계면 끝! 🚀
          </h2>
        </FadeIn>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {steps.map((step, i) => (
            <FadeIn key={step.number} delay={i * 0.1}>
              <div className="rounded-2xl border border-white/5 bg-sp-card p-6 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sp-accent text-xl font-bold text-white">
                  {step.number}
                </div>
                <h3 className="mt-4 text-lg font-bold text-white">{step.title}</h3>
                <p className="mt-2 text-sm text-sp-muted">{step.description}</p>
                <div className="mt-4 flex h-[100px] items-center justify-center rounded-lg border border-white/5 bg-white/5">
                  <span className="text-4xl">{step.emoji}</span>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>

        {/* SmartScreen 경고 안내 */}
        <FadeIn className="mt-10" delay={0.3}>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-6">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-xl">⚠️</span>
              <div>
                <p className="font-medium text-amber-200">
                  Windows 보안 경고가 나타나면
                </p>
                <p className="mt-2 text-sm leading-relaxed text-amber-200/80">
                  &quot;추가 정보&quot; → &quot;실행&quot;을 클릭하세요.
                  <br />
                  개인 개발 앱이라 아직 Microsoft 인증서가 없어요 😊
                </p>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  {['① 경고 화면', '② "추가 정보" 클릭', '③ "실행" 클릭'].map(
                    (label) => (
                      <div
                        key={label}
                        className="flex h-[80px] flex-1 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/5"
                      >
                        <span className="text-xs text-amber-300/60">{label}</span>
                      </div>
                    ),
                  )}
                </div>
              </div>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
