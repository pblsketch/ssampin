/**
 * OverlayLiveChart — 교사 화면 활동 박스 안에 표시되는 실시간 응답 시각화.
 *
 * Plan §3 + Design §8.4 매핑: present 모드 OverlayHandle 내부 차트.
 *
 * 디자인 원칙:
 * - 라이브러리 없이 순수 Tailwind 막대/카운트로 표시 (박스가 작아서 chart.js 도입 비용 X)
 * - 결과 데이터(`AggregatedResultData`)가 없으면 응답 수만 안내
 * - poll: 옵션별 막대 + 카운트 (가장 자주 쓰임)
 * - text/wordcloud/draw/draggable: 응답 수 중심 (상세는 종료 후 결과 패널)
 */

import type {
  AggregatedResultData,
  OverlayConfig,
} from '@domain/entities/InteractiveSlides';

export interface OverlayLiveChartProps {
  readonly config: OverlayConfig;
  readonly aggregated: AggregatedResultData | null;
  readonly respondCount: number;
  readonly totalCount: number;
}

export function OverlayLiveChart({
  config,
  aggregated,
  respondCount,
  totalCount,
}: OverlayLiveChartProps): JSX.Element {
  return (
    <div className="w-full h-full flex flex-col gap-1.5 p-2 overflow-hidden">
      <div className="flex items-center justify-between text-[10px] text-sp-muted flex-shrink-0">
        <span className="truncate">{labelForConfig(config)}</span>
        <span className="font-mono text-sp-text">
          {respondCount}/{Math.max(respondCount, totalCount)}
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <ChartBody config={config} aggregated={aggregated} />
      </div>
    </div>
  );
}

function ChartBody({
  config,
  aggregated,
}: {
  config: OverlayConfig;
  aggregated: AggregatedResultData | null;
}): JSX.Element {
  if (config.type === 'poll') {
    return (
      <PollBarChart
        config={config}
        aggregated={aggregated?.type === 'poll' ? aggregated : null}
      />
    );
  }
  if (config.type === 'wordcloud') {
    return (
      <WordCloudList
        aggregated={aggregated?.type === 'wordcloud' ? aggregated : null}
      />
    );
  }
  if (config.type === 'text') {
    return (
      <TextEntryList
        aggregated={aggregated?.type === 'text' ? aggregated : null}
      />
    );
  }
  if (config.type === 'draw' || config.type === 'draggable') {
    return (
      <div className="text-[11px] text-sp-muted text-center py-2">
        응답이 모이면 종료 후 결과 패널에서 확인할 수 있어요.
      </div>
    );
  }
  return <></>;
}

// ─────────────────────────────────────────────────────────────
// poll — 옵션별 막대
// ─────────────────────────────────────────────────────────────
function PollBarChart({
  config,
  aggregated,
}: {
  config: Extract<OverlayConfig, { type: 'poll' }>;
  aggregated: Extract<AggregatedResultData, { type: 'poll' }> | null;
}): JSX.Element {
  const totalVotes = aggregated?.totalVotes ?? 0;
  const max = Math.max(
    1,
    ...config.options.map((opt) => aggregated?.counts[opt.id] ?? 0),
  );
  return (
    <ul className="flex flex-col gap-1">
      {config.options.map((opt) => {
        const count = aggregated?.counts[opt.id] ?? 0;
        const ratio = max === 0 ? 0 : (count / max) * 100;
        const pct =
          totalVotes === 0 ? 0 : Math.round((count / totalVotes) * 100);
        return (
          <li key={opt.id} className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between text-[11px] text-sp-text">
              <span className="truncate pr-1" title={opt.label}>
                {opt.label}
              </span>
              <span className="font-mono text-sp-muted flex-shrink-0">
                {count} · {pct}%
              </span>
            </div>
            <div className="h-1.5 bg-sp-bg rounded-full overflow-hidden">
              <div
                className="h-full bg-sp-accent transition-all duration-300 ease-out"
                style={{ width: `${ratio}%` }}
                aria-hidden
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ─────────────────────────────────────────────────────────────
// wordcloud — 상위 키워드 5개
// ─────────────────────────────────────────────────────────────
function WordCloudList({
  aggregated,
}: {
  aggregated: Extract<AggregatedResultData, { type: 'wordcloud' }> | null;
}): JSX.Element {
  const entries = aggregated
    ? Object.entries(aggregated.tally)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
    : [];
  if (entries.length === 0) {
    return (
      <div className="text-[11px] text-sp-muted text-center py-2">
        키워드를 기다리는 중…
      </div>
    );
  }
  const maxFreq = entries[0]?.[1] ?? 1;
  return (
    <ul className="flex flex-wrap gap-1">
      {entries.map(([word, freq]) => {
        const scale = 0.85 + (freq / maxFreq) * 0.35; // 0.85x ~ 1.2x
        return (
          <li
            key={word}
            className="px-1.5 py-0.5 rounded bg-sp-bg text-sp-text text-[11px] leading-none"
            style={{ fontSize: `${scale * 11}px` }}
            title={`${word} · ${freq}`}
          >
            {word}
            <span className="ml-1 text-sp-muted">{freq}</span>
          </li>
        );
      })}
    </ul>
  );
}

// ─────────────────────────────────────────────────────────────
// text — 최근 응답 3개 미리보기
// ─────────────────────────────────────────────────────────────
function TextEntryList({
  aggregated,
}: {
  aggregated: Extract<AggregatedResultData, { type: 'text' }> | null;
}): JSX.Element {
  const recent = aggregated ? aggregated.entries.slice(-3).reverse() : [];
  if (recent.length === 0) {
    return (
      <div className="text-[11px] text-sp-muted text-center py-2">
        응답을 기다리는 중…
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-1">
      {recent.map((entry) => (
        <li
          key={`${entry.studentToken}-${entry.submittedAt}`}
          className="text-[11px] text-sp-text bg-sp-bg rounded px-1.5 py-1 truncate"
          title={entry.value}
        >
          <span className="text-sp-muted mr-1">·</span>
          {entry.value}
        </li>
      ))}
    </ul>
  );
}

// ─────────────────────────────────────────────────────────────
function labelForConfig(config: OverlayConfig): string {
  if (config.type === 'poll') return config.question || '투표';
  if (config.type === 'text') return config.prompt || '텍스트 응답';
  if (config.type === 'wordcloud') return config.prompt || '워드클라우드';
  if (config.type === 'draw') return '자유 그리기';
  if (config.type === 'draggable') return '드래그 활동';
  return '활동';
}
