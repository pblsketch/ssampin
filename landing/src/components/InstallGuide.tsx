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

        {/* 보안 경고 안내 */}
        <FadeIn className="mt-10" delay={0.3}>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-6">
            <p className="font-medium text-amber-200">
              Windows 보안 경고가 나타나면
            </p>
            <p className="mt-2 text-sm leading-relaxed text-amber-200/70">
              개인 개발 앱이라 아직 Microsoft 인증서가 없어요. 아래 방법 중 하나를 사용하세요.
            </p>

            {/* 케이스 A: 일반 SmartScreen */}
            <div className="mt-4 rounded-lg border border-amber-500/15 bg-amber-500/5 p-4">
              <p className="text-xs font-semibold text-amber-300">
                A. &quot;Microsoft Windows의 PC 보호&quot; 화면이 뜰 때
              </p>
              <p className="mt-1 text-xs text-amber-200/60">
                &quot;추가 정보&quot; 클릭 → &quot;실행&quot; 클릭
              </p>
            </div>

            {/* 케이스 B: 스마트 앱 컨트롤 */}
            <div className="mt-2 rounded-lg border border-amber-500/15 bg-amber-500/5 p-4">
              <p className="text-xs font-semibold text-amber-300">
                B. &quot;스마트 앱 컨트롤이 차단했습니다&quot; 화면이 뜰 때 (Windows 11)
              </p>
              <ol className="mt-1 space-y-0.5 text-xs text-amber-200/60">
                <li>① 설치 파일을 우클릭 → &quot;속성&quot; 선택</li>
                <li>② 하단 &quot;차단 해제&quot; 체크박스 체크 → 확인</li>
                <li>③ 설치 파일 다시 실행</li>
              </ol>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
