import FadeIn from './FadeIn';

const features = [
  {
    icon: '📅',
    title: '시간표',
    description:
      '학급·교사 시간표를 한눈에. 현재 교시가 자동으로 표시됩니다.',
  },
  {
    icon: '🪑',
    title: '학급 자리 배치',
    description:
      '드래그로 자리 교환, 버튼 하나로 랜덤 배치. 더 이상 한글 파일 안 만들어도 돼요.',
  },
  {
    icon: '📋',
    title: '일정관리',
    description:
      'D-Day 자동 계산, 카테고리별 관리, 행사 알림까지. 학교 일정 놓치지 마세요.',
  },
  {
    icon: '👩‍🏫',
    title: '담임메모',
    description:
      '출결, 상담, 생활지도 기록을 학생별로 한 곳에서 관리하세요.',
  },
  {
    icon: '📝',
    title: '포스트잇 메모',
    description:
      '자유롭게 붙이고, 옮기고, 색을 바꾸고. 화면 위의 포스트잇이에요.',
  },
  {
    icon: '✅',
    title: '할 일',
    description:
      '오늘 할 일을 체크하고 정리하세요. 마감 지난 건 빨간색으로 알려줘요.',
  },
];

export default function Features() {
  return (
    <section className="bg-sp-surface py-20">
      <div className="mx-auto max-w-6xl px-6">
        <FadeIn className="text-center">
          <h2 className="text-3xl font-bold text-sp-text md:text-4xl">
            바탕화면에 꽂아두세요 📌
          </h2>
          <p className="mt-3 text-lg text-sp-muted">교사의 하루를 한눈에</p>
        </FadeIn>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => (
            <FadeIn key={feature.title} delay={i * 0.08}>
              <div className="rounded-2xl border border-white/5 bg-sp-card p-6 transition-all hover:border-blue-500/30">
                <span className="text-3xl">{feature.icon}</span>
                <h3 className="mt-3 text-lg font-bold text-white">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-sp-muted">
                  {feature.description}
                </p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
