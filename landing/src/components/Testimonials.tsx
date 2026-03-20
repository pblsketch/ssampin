import FadeIn from './FadeIn';

const testimonials = [
  {
    name: '박 선생님',
    role: '중학교 담임 5년차',
    initial: '박',
    color: 'bg-blue-500/20 text-blue-400',
    quote:
      '전에는 시간표는 컴시간에서, 좌석배치는 한글로, 상담 기록은 노션에, 학사일정은 종이 문서로 관리했거든요. 이제 아침에 컴퓨터 켜고 쌤핀 하나만 열면 됩니다.',
    tag: '올인원',
  },
  {
    name: '최 선생님',
    role: '초등학교 담임 2년차',
    initial: '최',
    color: 'bg-green-500/20 text-green-400',
    quote:
      '학생 이름, 상담 내용 같은 거 클라우드에 올리는 게 솔직히 항상 마음에 걸렸어요. 요즘 교육 플랫폼에서 개인정보 유출 뉴스가 계속 나오잖아요. 쌤핀은 제 컴퓨터에만 저장되니까, 지금은 오히려 그게 제일 마음에 드는 기능이에요.',
    tag: '개인정보 안심',
  },
  {
    name: '이 선생님',
    role: '중학교 교과교사 8년차',
    initial: '이',
    color: 'bg-purple-500/20 text-purple-400',
    quote:
      "'지금 몇 교시지?', '오늘 급식 뭐지?', '비 오나?' 이걸 각각 따로 확인하느라 탭을 몇 개씩 열었어요. 쌤핀 바탕화면 위젯 켜두면 옆에서 다 알려주니까 해야 할 일에 더 집중할 수 있게 됐어요. 사소한 것 같아도 쌓이면 꽤 달라요.",
    tag: '위젯 모드',
  },
  {
    name: '김 선생님',
    role: '고등학교 과학교사 12년차',
    initial: '김',
    color: 'bg-amber-500/20 text-amber-400',
    quote:
      '수업 중에 타이머 쓰려고 유튜브 영상 틀었는데, 광고가 나와서 민망할 때가 한두 번이 아니었거든요. 쌤핀 타이머는 깔끔하고 광고도 없고, 랜덤 발표자 뽑기까지 있어서 이제 수업 도구는 이걸로만 써요.',
    tag: '쌤도구',
  },
];

export default function Testimonials() {
  return (
    <section className="bg-sp-bg py-20">
      <div className="mx-auto max-w-6xl px-6">
        <FadeIn>
          <p className="mb-3 text-[0.7rem] font-semibold uppercase tracking-widest text-sp-accent">
            선생님들의 이야기
          </p>
          <h2 className="text-3xl font-bold text-sp-text md:text-4xl">
            교실에서 바로 느끼는 변화
          </h2>
        </FadeIn>

        <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-2">
          {testimonials.map((t, i) => (
            <FadeIn key={t.name} delay={i * 0.08}>
              <div className="h-full rounded-2xl border border-white/10 bg-sp-card p-6">
                <div className="mb-4 flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ${t.color}`}
                  >
                    {t.initial}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-sp-text">{t.name}</p>
                    <p className="text-xs text-sp-muted">{t.role}</p>
                  </div>
                  <span className="ml-auto rounded-full border border-sp-border px-2.5 py-0.5 text-[0.65rem] text-sp-muted">
                    {t.tag}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-sp-muted/90">
                  &ldquo;{t.quote}&rdquo;
                </p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
