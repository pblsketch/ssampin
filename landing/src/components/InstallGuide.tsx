import FadeIn from './FadeIn';

const steps = [
  {
    number: '01',
    title: '다운로드',
    description: '아래 버튼을 클릭해 설치 파일을 받으세요.',
  },
  {
    number: '02',
    title: '실행',
    description: '다운받은 설치 파일을 더블클릭해 실행하세요.',
  },
  {
    number: '03',
    title: '시작',
    description: '바탕화면의 쌤핀 아이콘을 클릭하면 바로 시작됩니다.',
  },
];

export default function InstallGuide() {
  return (
    <section className="bg-sp-bg py-24">
      <div className="mx-auto max-w-6xl px-6">
        <FadeIn className="text-center">
          <h2 className="text-3xl font-bold text-sp-text md:text-4xl">
            설치는 3단계면 끝
          </h2>
          <p className="mt-3 text-base text-sp-muted">다운로드부터 실행까지 1분 이내</p>
        </FadeIn>

        <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
          {steps.map((step, i) => (
            <FadeIn key={step.number} delay={i * 0.1}>
              <div className="rounded-xl bg-sp-card p-7">
                <div className="mb-4 text-2xl font-extrabold tracking-tight text-sp-accent/50">
                  {step.number}
                </div>
                <h3 className="text-base font-bold text-white">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-sp-muted">{step.description}</p>
              </div>
            </FadeIn>
          ))}
        </div>

        {/* SmartScreen 경고 안내 */}
        <FadeIn className="mt-10" delay={0.3}>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-6">
            <div>
              <p className="font-medium text-amber-200">
                Windows 보안 경고가 나타나면
              </p>
              <p className="mt-2 text-sm leading-relaxed text-amber-200/70">
                개인 개발 앱이라 아직 Microsoft 인증서가 없어요.
                &quot;추가 정보&quot; → &quot;실행&quot; 순서로 클릭하면 안전하게 설치됩니다.
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                {['① 경고 화면', '② "추가 정보" 클릭', '③ "실행" 클릭'].map(
                  (label) => (
                    <div
                      key={label}
                      className="flex h-16 flex-1 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/5"
                    >
                      <span className="text-xs text-amber-300/60">{label}</span>
                    </div>
                  ),
                )}
              </div>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
