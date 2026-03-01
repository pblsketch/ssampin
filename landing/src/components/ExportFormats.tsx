import FadeIn from './FadeIn';

const formats = [
  {
    name: 'HWPX',
    label: '한글 파일',
    accent: 'border-t-blue-400',
    uses: ['시간표', '자리 배치', '담임메모'],
  },
  {
    name: 'Excel',
    label: '엑셀 파일',
    accent: 'border-t-green-400',
    uses: ['시간표', '자리 배치', '일정'],
  },
  {
    name: 'PDF',
    label: 'PDF 문서',
    accent: 'border-t-red-400',
    uses: ['인쇄용', '보고서'],
  },
];

export default function ExportFormats() {
  return (
    <section className="bg-sp-surface py-16">
      <div className="mx-auto max-w-6xl px-6">
        <FadeIn>
          <h2 className="text-3xl font-bold text-sp-text md:text-4xl">
            익숙한 형식으로 내보내기
          </h2>
          <p className="mt-3 text-base text-sp-muted">한글, 엑셀, PDF로 바로 출력</p>
        </FadeIn>

        <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
          {formats.map((fmt, i) => (
            <FadeIn key={fmt.name} delay={i * 0.1}>
              <div className={`rounded-xl border-t-2 bg-sp-card p-6 ${fmt.accent}`}>
                <h3 className="text-lg font-bold text-white">{fmt.name}</h3>
                <p className="mt-1 text-sm text-sp-muted">{fmt.label}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {fmt.uses.map((use) => (
                    <span
                      key={use}
                      className="rounded-full bg-sp-accent/10 px-3 py-1 text-xs text-blue-300"
                    >
                      {use}
                    </span>
                  ))}
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}
