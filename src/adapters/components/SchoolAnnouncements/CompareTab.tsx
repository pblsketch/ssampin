import { buildSchoolComparison } from '@domain/services/schoolCompare';
import { useSchoolDisclosure } from './useSchoolDisclosure';
import { EmptyNotice } from './EmptyNotice';
import { OfflineBadge } from './OfflineBadge';

/** 옆 학교 비교 탭 — 같은 시·군·구·학교급 학교를 학생수 순으로 비교(09 list 재사용). */
export function CompareTab() {
  const { state, allRows, identity, isStale, cachedAt } = useSchoolDisclosure('09');

  if (state === 'no-school') {
    return (
      <EmptyNotice
        icon="compare_arrows"
        text="옆 학교와 비교하려면 설정에서 학교(주소 포함)를 등록해 주세요."
      />
    );
  }
  if (state === 'loading') {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 border-2 border-sp-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (state === 'error') {
    return <EmptyNotice icon="cloud_off" text="불러오지 못했어요. 잠시 후 다시 시도해 주세요." />;
  }

  const rows = identity ? buildSchoolComparison(allRows, identity.schoolName) : [];
  if (rows.length === 0) {
    return <EmptyNotice icon="bar_chart" text="비교할 학교 데이터가 없어요." />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-xs text-sp-muted">
          같은 시·군·구 · 같은 학교급 학교를 학생수 순으로 비교합니다. (올해 공시 기준)
        </p>
        {isStale && <OfflineBadge cachedAt={cachedAt} />}
      </div>
      <div className="overflow-x-auto rounded-xl border border-sp-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-sp-surface text-sp-muted text-xs">
              <th className="text-left font-sp-semibold px-3 py-2.5">학교</th>
              <th className="text-right font-sp-semibold px-3 py-2.5">학생수</th>
              <th className="text-right font-sp-semibold px-3 py-2.5">학급수</th>
              <th className="text-right font-sp-semibold px-3 py-2.5">학급당</th>
              <th className="text-right font-sp-semibold px-3 py-2.5">교원수</th>
              <th className="text-right font-sp-semibold px-3 py-2.5">교원1인당</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.schoolName}
                className={`border-t border-sp-border ${r.isOurs ? 'bg-sp-accent/10' : ''}`}
              >
                <td className="px-3 py-2.5 text-sp-text">
                  {r.schoolName}
                  {r.isOurs && (
                    <span className="ml-1.5 text-caption text-sp-accent font-sp-semibold">
                      우리 학교
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-sp-text">
                  {fmt(r.studentsTotal)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-sp-muted">
                  {fmt(r.classesTotal)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-sp-muted">
                  {fmt(r.studentsPerClass)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-sp-muted">
                  {fmt(r.teachers)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-sp-muted">
                  {fmt(r.studentsPerTeacher)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function fmt(n: number | null): string {
  return n == null ? '-' : String(n);
}
