import FadeIn from './FadeIn';

const features = [
  {
    icon: '📅',
    title: '시간표',
    description:
      'NEIS 연동으로 학급·교사 시간표를 자동 불러오기. 현재 교시 자동 표시.',
  },
  {
    icon: '🪑',
    title: '학급 자리 배치',
    description:
      '드래그로 자리 교환, 셔플 애니메이션으로 랜덤 배치. 한글 파일 안 만들어도 돼요.',
  },
  {
    icon: '📋',
    title: '일정관리',
    description:
      'D-Day 자동 계산, 카테고리별 관리, 행사 알림까지. 학교 일정 놓치지 마세요.',
  },
  {
    icon: '🔄',
    title: '구글 캘린더 연동',
    description:
      '구글 캘린더와 양방향 자동 동기화. 내 캘린더를 골라서 가져오세요.',
  },
  {
    icon: '👩‍🏫',
    title: '담임메모',
    description:
      '출결, 상담, 생활지도 기록을 학생별로 관리. 필터와 통계 기능까지.',
  },
  {
    icon: '🍚',
    title: '급식',
    description:
      'NEIS 연동으로 오늘의 급식을 자동 표시. 알레르기 정보와 칼로리까지.',
  },
  {
    icon: '🌤️',
    title: '날씨·미세먼지',
    description:
      '현재 기온, 습도, 미세먼지 등급을 대시보드에서 바로 확인하세요.',
  },
  {
    icon: '🛠️',
    title: '쌤도구',
    description:
      '타이머, 투표, 점수판, 룰렛 등 12가지 수업 도구를 바로 실행.',
  },
  {
    icon: '🔒',
    title: 'PIN 잠금',
    description:
      '민감한 기능을 PIN으로 보호. 자동 잠금 타이머도 설정 가능.',
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
    <section className="bg-sp-surface py-24">
      <div className="mx-auto max-w-6xl px-6">
        <FadeIn>
          <p className="mb-3 text-[0.7rem] font-semibold uppercase tracking-widest text-sp-accent">
            핵심 기능
          </p>
          <h2 className="text-3xl font-bold text-sp-text md:text-4xl">
            화면에 꽂아두세요
          </h2>
          <p className="mt-3 text-base text-sp-muted">교사의 하루를 한눈에</p>
        </FadeIn>

        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {features.map((feature, i) => (
            <FadeIn key={feature.title} delay={i * 0.06}>
              <div className="group rounded-xl bg-sp-card/60 p-5 transition-colors hover:bg-sp-card">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/5">
                  <span className="text-lg">{feature.icon}</span>
                </div>
                <h3 className="text-sm font-bold text-white">
                  {feature.title}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-sp-muted">
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
