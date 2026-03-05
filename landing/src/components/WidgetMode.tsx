import Image from 'next/image';
import FadeIn from './FadeIn';

const checklist = [
  '시간표 + 일정 + 급식 한눈에',
  '4가지 레이아웃 (단일/가로/세로/4분할)',
  '투명도 조절 + 항상 위 표시',
  '탭 필터링으로 원하는 정보만',
];

export default function WidgetMode() {
  return (
    <section className="bg-sp-bg py-20">
      <div className="mx-auto max-w-6xl px-6">
        <FadeIn>
          <h2 className="text-3xl font-bold text-sp-text md:text-4xl">
            화면 위에 쉽게 띄워두기
          </h2>
        </FadeIn>

        <div className="mt-12 flex flex-col items-center gap-10 md:flex-row md:gap-16">
          <FadeIn className="w-full md:w-1/2">
            <div className="overflow-hidden rounded-2xl border border-white/10">
              <Image
                src="/images/timetable.png"
                alt="쌤핀 시간표 화면"
                width={1440}
                height={900}
                className="h-auto w-full"
              />
            </div>
          </FadeIn>

          <FadeIn className="w-full md:w-1/2" delay={0.15}>
            <p className="mb-6 text-lg text-sp-muted">
              미니 창으로 띄워두면
              <br />
              다른 작업 중에도 한눈에.
            </p>
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
          </FadeIn>
        </div>
      </div>
    </section>
  );
}
