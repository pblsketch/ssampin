/**
 * Step2Scope — 학년도 마무리 마법사 ② 범위 확인 (S2.3).
 * v1은 전부 보관 고정(ADR-032) — 체크박스 없이 목록·건수만 보여준다(읽기 전용).
 */

import type { ArchiveScopeCount } from './archiveScope';
import { ARCHIVE_AXIS_LABELS, ARCHIVE_SCOPE_ITEMS, type ArchiveAxis } from './archiveScope';

interface Props {
  /** null이면 로딩 중. */
  readonly counts: ReadonlyMap<string, ArchiveScopeCount> | null;
}

function countLabel(count: ArchiveScopeCount | undefined): string {
  if (!count) return '확인 중';
  if (!count.exists) return '비어 있음';
  if (count.count === null) return '저장됨';
  return `${count.count.toLocaleString()}건`;
}

function AxisSection({
  axis,
  counts,
}: {
  axis: ArchiveAxis;
  counts: ReadonlyMap<string, ArchiveScopeCount> | null;
}) {
  const items = ARCHIVE_SCOPE_ITEMS.filter((i) => i.axis === axis);
  return (
    <div className="overflow-hidden rounded-xl border border-sp-border">
      <p className="border-b border-sp-border bg-sp-surface px-4 py-2 text-xs font-bold uppercase tracking-wider text-sp-muted">
        {ARCHIVE_AXIS_LABELS[axis]}
      </p>
      <ul className="divide-y divide-sp-border bg-sp-bg">
        {items.map((item) => {
          const count = counts?.get(item.key);
          const empty = counts !== null && count !== undefined && !count.exists;
          return (
            <li key={item.key} className="flex items-center justify-between px-4 py-2">
              <span className={`text-sm ${empty ? 'text-sp-muted' : 'text-sp-text'}`}>
                {item.label}
              </span>
              <span className={`text-xs ${empty ? 'text-sp-muted opacity-70' : 'text-sp-muted'}`}>
                {countLabel(count)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Step2Scope({ counts }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-sp-text">보관할 기록을 확인해 주세요</h3>
        <p className="mt-1 text-sm text-sp-muted">
          이번 버전에서는 <strong className="text-sp-text">전부 보관</strong>이 기본이에요 — 골라서
          버리는 옵션은 없어요(그래서 잃어버릴 것도 없어요). 삭제가 필요하면 나중에 보관함에서 별도
          절차로만 가능해요.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <AxisSection axis="homeroom" counts={counts} />
        <AxisSection axis="subject" counts={counts} />
      </div>

      <p className="text-xs text-sp-muted">
        비어 있는 항목은 보관할 내용이 없다는 뜻이에요 — 그대로 다음으로 진행해도 돼요.
      </p>
    </div>
  );
}
