import FadeIn from './FadeIn';

const tier1 = [
  {
    icon: '📅',
    title: '시간표',
    description:
      'NEIS 연동 마법사로 학급·교사 시간표 자동 불러오기. 현재 교시 자동 표시, 과목별 색상, 실행취소까지.',
    highlights: ['NEIS 자동 불러오기', '현재 교시 표시', '과목 색상 커스텀'],
  },
  {
    icon: '🪑',
    title: '학급 자리 배치',
    description:
      '드래그로 자리 교환, 셔플 애니메이션으로 랜덤 배치. 짝꿍 모드와 한글·엑셀·PDF 내보내기까지.',
    highlights: ['드래그 교환 · 랜덤 배치', '짝꿍 모드', 'HWPX/Excel/PDF 출력'],
  },
  {
    icon: '📋',
    title: '일정 관리',
    description:
      'D-Day 자동 계산, 카테고리 추가·수정·순서변경, 반복 일정, 행사 알림. 구글 캘린더 양방향 동기화.',
    highlights: ['D-Day · 반복 일정', '구글 캘린더 동기화', '.ssampin 파일 공유'],
  },
];

const tier2 = [
  {
    icon: '🛠️',
    title: '쌤도구 16가지',
    description: '타이머, 투표, 워드클라우드, 랜덤 뽑기, QR코드, 점수판 등 수업 도구를 원클릭 실행.',
  },
  {
    icon: '👩‍🏫',
    title: '담임메모',
    description: '출결, 상담, 생활지도 기록을 학생별로 관리. 필터, 통계, PIN 잠금 보호까지.',
  },
  {
    icon: '🏫',
    title: 'NEIS 연동',
    description: '급식·알레르기·칼로리, 학사일정, 실시간 날씨·미세먼지를 대시보드에서 바로 확인.',
  },
];

const tier3Tags = [
  '구글 캘린더 동기화', 'Google Tasks 동기화', 'Google Drive 앱 폴더 백업',
  '포스트잇 메모', '수업 관리', '과제 수합',
  'PIN 잠금', '한글·엑셀·PDF 내보내기',
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

        {/* Tier 1: 대형 카드 3개 */}
        <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {tier1.map((feature, i) => (
            <FadeIn key={feature.title} delay={i * 0.08}>
              <div className="group h-full rounded-2xl border border-white/10 bg-sp-card p-7 transition-colors hover:border-sp-accent/30">
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-white/5">
                  <span className="text-2xl">{feature.icon}</span>
                </div>
                <h3 className="text-lg font-bold text-white">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-sp-muted">
                  {feature.description}
                </p>
                <ul className="mt-4 space-y-2">
                  {feature.highlights.map((hl) => (
                    <li key={hl} className="flex items-center gap-2 text-sm">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-xs text-blue-400">
                        ✓
                      </span>
                      <span className="text-sp-text/80">{hl}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </FadeIn>
          ))}
        </div>

        {/* Tier 2: 중형 카드 3개 */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {tier2.map((feature, i) => (
            <FadeIn key={feature.title} delay={0.24 + i * 0.06}>
              <div className="group rounded-xl bg-sp-card/60 p-5 transition-colors hover:bg-sp-card">
                <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/5">
                  <span className="text-lg">{feature.icon}</span>
                </div>
                <h3 className="text-sm font-bold text-white">{feature.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-sp-muted">
                  {feature.description}
                </p>
              </div>
            </FadeIn>
          ))}
        </div>

        {/* Tier 3: 태그 스트립 */}
        <FadeIn delay={0.4}>
          <div className="mt-8 flex items-center gap-4 border-t border-sp-border/40 pt-6">
            <span className="text-[0.7rem] font-semibold uppercase tracking-widest text-sp-border">
              그 외
            </span>
            <div className="flex flex-wrap gap-2">
              {tier3Tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-sp-border/60 px-3 py-1 text-xs text-sp-muted"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}
