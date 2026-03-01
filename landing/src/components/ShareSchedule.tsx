import FadeIn from './FadeIn';

const benefits = [
  '카테고리별 선택 내보내기',
  '가져올 때 중복 자동 감지',
  '파일 더블클릭으로 바로 가져오기',
];

export default function ShareSchedule() {
  return (
    <section className="bg-sp-bg py-20">
      <div className="mx-auto max-w-6xl px-6">
        <FadeIn>
          <h2 className="text-3xl font-bold text-sp-text md:text-4xl">
            선생님끼리 일정 공유
          </h2>
          <p className="mt-3 text-base text-sp-muted">
            .ssampin 파일 하나로 학교 일정을 주고받으세요
          </p>
        </FadeIn>

        <FadeIn className="mt-12" delay={0.1}>
          <div className="rounded-2xl border border-white/10 bg-sp-card p-8 md:p-12">
            {/* 다이어그램 */}
            <div className="flex flex-col items-center justify-center gap-4 md:flex-row md:gap-6">
              <div className="flex flex-col items-center gap-1">
                <span className="text-3xl">👩‍🏫</span>
                <span className="text-sm font-medium text-sp-text">선생님 A</span>
              </div>

              <div className="flex items-center gap-2 text-sp-muted">
                <span className="hidden text-xs md:inline">────</span>
                <span className="text-xs">→</span>
                <span className="hidden text-xs md:inline">────</span>
                <span className="text-xs md:hidden">↓</span>
              </div>

              <div className="flex flex-col items-center gap-1">
                <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2">
                  <span className="text-sm font-medium text-blue-300">
                    나무학교_일정.ssampin
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-sp-muted">
                <span className="hidden text-xs md:inline">────</span>
                <span className="text-xs">→</span>
                <span className="hidden text-xs md:inline">────</span>
                <span className="text-xs md:hidden">↓</span>
              </div>

              <div className="flex flex-col items-center gap-1">
                <span className="text-3xl">👨‍🏫</span>
                <span className="text-sm font-medium text-sp-text">선생님 B</span>
              </div>
            </div>

            {/* 특징 목록 */}
            <div className="mt-8 flex flex-col items-center gap-3 md:flex-row md:justify-center md:gap-8">
              {benefits.map((item) => (
                <div key={item} className="flex items-center gap-2">
                  <span className="text-blue-400">•</span>
                  <span className="text-sm text-sp-muted">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
