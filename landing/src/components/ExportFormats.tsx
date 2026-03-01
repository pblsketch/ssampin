import FadeIn from './FadeIn';

const formats = [
  {
    icon: '📄',
    name: 'HWPX',
    label: '한글 파일',
    uses: ['시간표', '자리 배치', '담임메모'],
  },
  {
    icon: '📊',
    name: 'Excel',
    label: '엑셀 파일',
    uses: ['시간표', '자리 배치', '일정'],
  },
  {
    icon: '📑',
    name: 'PDF',
    label: 'PDF 문서',
    uses: ['인쇄용', '보고서'],
  },
];

export default function ExportFormats() {
  return (
    <section className="bg-sp-surface py-20">
      <div className="mx-auto max-w-6xl px-6">
        <FadeIn className="text-center">
          <h2 className="text-3xl font-bold text-sp-text md:text-4xl">
            익숙한 형식으로 내보내기 📥
          </h2>
        </FadeIn>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
          {formats.map((fmt, i) => (
            <FadeIn key={fmt.name} delay={i * 0.1}>
              <div className="rounded-xl border border-white/5 bg-sp-card/50 p-6 text-center">
                <span className="text-4xl">{fmt.icon}</span>
                <h3 className="mt-3 text-lg font-bold text-white">{fmt.name}</h3>
                <p className="mt-1 text-sm text-sp-muted">{fmt.label}</p>
                <div className="mt-3 flex justify-center gap-2">
                  {fmt.uses.map((use) => (
                    <span
                      key={use}
                      className="rounded-full bg-white/5 px-3 py-1 text-xs text-sp-muted"
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
