import FadeIn from './FadeIn';

const checklist = [
  'PIN 번호로 앱 접근 제한',
  '기능별 개별 잠금 설정',
  '자동 잠금 타이머',
  '대시보드에서 잠금 상태 표시',
];

const protectedFeatures = [
  '시간표',
  '담임메모',
  '좌석배치',
  '일정',
  '급식',
  '메모',
  '할 일',
];

export default function PinGuard() {
  return (
    <section className="bg-sp-surface py-16">
      <div className="mx-auto max-w-6xl px-6">
        <FadeIn className="text-center">
          <p className="mb-3 text-[0.7rem] font-semibold uppercase tracking-widest text-sp-accent">
            보안
          </p>
          <h2 className="text-3xl font-bold text-sp-text md:text-4xl">
            민감한 정보는 안전하게
          </h2>
          <p className="mt-3 text-base text-sp-muted">
            학생이 보는 앞에서도 안심 — PIN 잠금으로 기능별 보호
          </p>
        </FadeIn>

        <FadeIn className="mt-12" delay={0.1}>
          <div className="rounded-2xl border border-white/10 bg-sp-card p-8 md:p-12">
            <div className="flex flex-col items-center gap-8 md:flex-row md:gap-12">
              {/* Left visual */}
              <div className="flex flex-col items-center gap-4 md:w-1/3">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-500/10">
                  <span className="text-4xl">🔒</span>
                </div>
                <div className="flex flex-row gap-2">
                  <span className="h-3 w-3 rounded-full bg-sp-accent" />
                  <span className="h-3 w-3 rounded-full bg-sp-accent" />
                  <span className="h-3 w-3 rounded-full bg-sp-accent" />
                  <span className="h-3 w-3 rounded-full bg-sp-accent" />
                </div>
                <p className="text-xs text-sp-muted">4자리 PIN</p>
              </div>

              {/* Right features */}
              <div className="md:w-2/3">
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

                <div className="mt-6 flex flex-wrap gap-2">
                  {protectedFeatures.map((feature) => (
                    <span
                      key={feature}
                      className="rounded-full border border-sp-border bg-sp-surface px-3 py-1 text-xs text-sp-muted"
                    >
                      {feature}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
