import FadeIn from './FadeIn';

const cards = [
  {
    icon: '🔒',
    title: 'PIN 잠금',
    description: '민감한 정보를 4자리 PIN으로 기능별 보호. 자동 잠금 타이머까지.',
    points: ['기능별 개별 잠금', '자동 잠금 타이머', '대시보드 잠금 상태 표시'],
  },
  {
    icon: '🤝',
    title: '선생님끼리 공유',
    description: '.ssampin 파일 하나로 학교 일정을 주고받으세요.',
    points: ['카테고리별 선택 내보내기', '중복 자동 감지', '더블클릭 바로 가져오기'],
  },
  {
    icon: '📄',
    title: '한글·엑셀·PDF',
    description: '시간표, 좌석배치, 담임메모를 익숙한 형식으로 내보내기.',
    points: ['HWPX (한글 파일)', 'Excel 스프레드시트', 'PDF 문서'],
  },
];

export default function TrustAndUtility() {
  return (
    <section className="bg-sp-surface py-20">
      <div className="mx-auto max-w-6xl px-6">
        <FadeIn>
          <p className="mb-3 text-[0.7rem] font-semibold uppercase tracking-widest text-sp-accent">
            안심 & 활용
          </p>
          <h2 className="text-3xl font-bold text-sp-text md:text-4xl">
            안전하고 유연하게
          </h2>
        </FadeIn>

        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
          {cards.map((card, i) => (
            <FadeIn key={card.title} delay={i * 0.08}>
              <div className="h-full rounded-xl border border-white/10 bg-sp-card p-6">
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-2xl">{card.icon}</span>
                  <h3 className="text-base font-bold text-sp-text">{card.title}</h3>
                </div>
                <p className="mb-4 text-sm text-sp-muted">{card.description}</p>
                <ul className="space-y-2">
                  {card.points.map((point) => (
                    <li key={point} className="flex items-center gap-2 text-sm">
                      <span className="text-blue-400">•</span>
                      <span className="text-sp-muted">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
