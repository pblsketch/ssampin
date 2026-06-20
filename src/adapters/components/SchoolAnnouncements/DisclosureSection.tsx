import { labelizeRow } from '@domain/services/disclosureLabels';
import { useSchoolDisclosure } from './useSchoolDisclosure';
import { OfflineBadge } from './OfflineBadge';

/**
 * 학교알리미 공시 한 항목(apiType)을 우리 학교 기준 [라벨,값] 표로 보여주는 섹션.
 * 학교현황(US-SA-05)·동아리/방과후/상담(US-SA-06) 탭이 공유한다.
 */
export function DisclosureSection({
  apiType,
  title,
  icon,
  hideZero,
}: {
  apiType: string;
  title: string;
  icon: string;
  /** 교원·전출입처럼 0이 대부분인 항목은 0 값을 숨겨 핵심만 보여준다. */
  hideZero?: boolean;
}) {
  const { state, ourRows, isStale, cachedAt } = useSchoolDisclosure(apiType);

  return (
    <section>
      <h3 className="text-sm font-sp-semibold text-sp-text mb-3 flex items-center gap-1.5 flex-wrap">
        <span className="material-symbols-outlined text-icon text-sp-accent">{icon}</span>
        {title}
        {isStale && <OfflineBadge cachedAt={cachedAt} />}
      </h3>
      {state === 'loading' && (
        <div className="flex items-center gap-2 text-sm text-sp-muted py-3">
          <span className="w-4 h-4 border-2 border-sp-accent border-t-transparent rounded-full animate-spin" />
          불러오는 중...
        </div>
      )}
      {state === 'error' && (
        <p className="text-sm text-sp-muted py-3">불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>
      )}
      {state === 'loaded' && ourRows.length === 0 && (
        <p className="text-sm text-sp-muted py-3">공시된 데이터가 없어요.</p>
      )}
      {state === 'loaded' &&
        ourRows.map((row, i) => (
          <DisclosureCard key={i} apiType={apiType} row={row} hideZero={hideZero} />
        ))}
    </section>
  );
}

function DisclosureCard({
  apiType,
  row,
  hideZero,
}: {
  apiType: string;
  row: Record<string, unknown>;
  hideZero?: boolean;
}) {
  const pairs = labelizeRow(apiType, row, { hideZero });
  if (pairs.length === 0) return null;
  return (
    <dl className="rounded-xl border border-sp-border bg-sp-card p-5 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
      {pairs.map(({ label, value }, i) => (
        <div key={i} className="min-w-0 flex flex-col gap-0.5">
          <dt className="text-caption text-sp-muted leading-tight break-keep">{label}</dt>
          <dd className="text-sm font-sp-semibold text-sp-text tabular-nums break-keep">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
