import FadeIn from './FadeIn';

export default function MealAndWeather() {
  return (
    <section className="bg-sp-surface py-24">
      <div className="mx-auto max-w-6xl px-4">
        <FadeIn>
          <div className="mb-12">
            <p className="mb-3 text-[0.7rem] font-semibold uppercase tracking-widest text-sp-accent">
              NEIS 연동
            </p>
            <h2 className="text-3xl font-bold text-sp-text md:text-4xl">
              학교 정보를 한눈에
            </h2>
            <p className="mt-3 text-base text-sp-muted">
              NEIS 급식·학사일정 + 실시간 날씨·미세먼지 + 구글 캘린더 동기화
            </p>
          </div>
        </FadeIn>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* 급식 카드 */}
          <FadeIn delay={0.05}>
            <div className="h-full rounded-2xl border border-white/10 bg-sp-card p-8">
              <div className="mb-6 flex items-center gap-3">
                <span className="text-3xl">🍚</span>
                <h3 className="text-xl font-bold text-sp-text">급식</h3>
              </div>

              <ul className="mb-6 space-y-3">
                {[
                  'NEIS 공식 API 자동 연동',
                  '알레르기 정보 자동 표시',
                  '칼로리 정보 제공',
                  '주간 급식표 한눈에 보기',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-blue-400" />
                    <span className="text-sp-muted">{item}</span>
                  </li>
                ))}
              </ul>

              <div className="rounded-xl border border-white/5 bg-white/5 p-4">
                <p className="mb-2 text-sm font-semibold text-sp-text">중식</p>
                <ul className="space-y-1 text-sm text-sp-muted">
                  <li>• 쌀밥</li>
                  <li>• 미역국 5.6.13</li>
                  <li>• 제육볶음 10.13</li>
                  <li>• 깍두기 9</li>
                </ul>
                <p className="mt-3 text-xs text-sp-muted">693.2 Kcal</p>
              </div>
            </div>
          </FadeIn>

          {/* 날씨·미세먼지 카드 */}
          <FadeIn delay={0.1}>
            <div className="h-full rounded-2xl border border-white/10 bg-sp-card p-8">
              <div className="mb-6 flex items-center gap-3">
                <span className="text-3xl">🌤️</span>
                <h3 className="text-xl font-bold text-sp-text">날씨·미세먼지</h3>
              </div>

              <ul className="mb-6 space-y-3">
                {[
                  '현재 기온 + 최고·최저 기온',
                  '습도 정보',
                  '미세먼지 (PM10, PM2.5) 등급',
                  '대시보드 상단에 항상 표시',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-blue-400" />
                    <span className="text-sp-muted">{item}</span>
                  </li>
                ))}
              </ul>

              <div className="rounded-xl border border-white/5 bg-white/5 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-4xl font-bold text-sp-text">18°C</p>
                    <p className="mt-1 text-sm text-sp-muted">12° ~ 22°</p>
                  </div>
                  <div className="text-right space-y-2">
                    <p className="text-sm text-sp-muted">습도 55%</p>
                    <p className="text-sm font-medium text-green-400">미세먼지 좋음</p>
                  </div>
                </div>
              </div>
            </div>
          </FadeIn>

          {/* 학사일정 카드 */}
          <FadeIn delay={0.15}>
            <div className="h-full rounded-2xl border border-white/10 bg-sp-card p-8">
              <div className="mb-6 flex items-center gap-3">
                <span className="text-3xl">🏫</span>
                <h3 className="text-xl font-bold text-sp-text">학사일정</h3>
              </div>

              <ul className="mb-6 space-y-3">
                {[
                  'NEIS 학사일정 자동 동기화',
                  '학년별 필터링 (1~3학년)',
                  '공휴일·개교기념일 자동 표시',
                  '일정 캘린더에 자동 반영',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-purple-400" />
                    <span className="text-sp-muted">{item}</span>
                  </li>
                ))}
              </ul>

              <div className="rounded-xl border border-white/5 bg-white/5 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="inline-flex items-center rounded-full bg-purple-500/20 px-2 py-0.5 text-xs font-medium text-purple-300">동기화 완료</span>
                  <span className="text-xs text-sp-muted">12건</span>
                </div>
                <ul className="space-y-1.5 text-sm text-sp-muted">
                  <li className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                    3/1 삼일절 (공휴일)
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
                    3/4 개학식
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
                    4/16 중간고사
                  </li>
                </ul>
              </div>
            </div>
          </FadeIn>

          {/* 구글 캘린더 카드 */}
          <FadeIn delay={0.2}>
            <div className="h-full rounded-2xl border border-white/10 bg-sp-card p-8">
              <div className="mb-6 flex items-center gap-3">
                <span className="text-3xl">📅</span>
                <h3 className="text-xl font-bold text-sp-text">구글 캘린더</h3>
              </div>

              <ul className="mb-6 space-y-3">
                {[
                  'Google 계정 OAuth 로그인',
                  '양방향 동기화 (쌤핀 ↔ 구글)',
                  '변경분만 빠르게 증분 동기화',
                  '여러 캘린더 선택 동기화',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-green-400" />
                    <span className="text-sp-muted">{item}</span>
                  </li>
                ))}
              </ul>

              <div className="rounded-xl border border-white/5 bg-white/5 p-4">
                <div className="space-y-2">
                  {[
                    { color: 'bg-blue-400', name: '내 캘린더', checked: true },
                    { color: 'bg-green-400', name: '학교 일정', checked: true },
                    { color: 'bg-yellow-400', name: '개인 일정', checked: false },
                  ].map((cal) => (
                    <div key={cal.name} className="flex items-center gap-2.5">
                      <div className={`h-4 w-4 rounded border ${cal.checked ? 'border-sp-accent bg-sp-accent' : 'border-sp-border bg-sp-bg'} flex items-center justify-center`}>
                        {cal.checked && <span className="text-[10px] text-white">✓</span>}
                      </div>
                      <span className={`h-2.5 w-2.5 rounded-full ${cal.color}`} />
                      <span className="text-sm text-sp-muted">{cal.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}
