import { useEffect, useMemo } from 'react';
import type { TodoRelatedPerson } from '@domain/entities/Todo';
import { useStaffContactStore } from '@adapters/stores/useStaffContactStore';
import { formatPhoneNumber } from '@domain/rules/contactRules';

interface RelatedStaffChipsProps {
  related: readonly TodoRelatedPerson[];
  /** 있으면 각 칩에 제거(×) 버튼이 붙는다. 없으면 **표시 전용**. */
  onRemove?: (staffId: string) => void;
}

/**
 * 할 일에 붙은 관련인 칩.
 *
 * ★ **연락처가 정본이다.** 칩은 `staffId` 로 현재 연락처를 찾아 **지금 이름**을 보여준다.
 *   할 일에 저장된 `nameSnapshot` 은 연락처가 지워졌을 때만 쓰는 폴백이고,
 *   **여기서 저장을 다시 하지 않는다.** 표시할 때마다 스냅샷을 갱신하면 정본이 둘이 되어
 *   ADR-046·063·064 가 겪은 "두 소스가 서로 덮어쓰는" 문제가 반복된다.
 *
 * ★ 이 컴포넌트는 **읽기만 한다.** 렌더 과정에서 할 일을 저장하지 않는다.
 */
export function RelatedStaffChips({ related, onRemove }: RelatedStaffChipsProps) {
  const contacts = useStaffContactStore((s) => s.contacts);
  const load = useStaffContactStore((s) => s.load);

  // ★ 칩이 직접 불러온다. 앱 부팅 때 연락처를 미리 읽는 곳이 없어서(App.tsx 의 초기
  //   로드 목록에 staff-contacts 가 없다), 이걸 빠뜨리면 **재시작 직후 살아 있는
  //   교직원이 전부 "연락처에 없음"** 으로 보인다. 같은 세션에서 방금 @ 로 붙였을 때는
  //   팝오버가 이미 불러와 정상으로 보이므로 개발 중에는 드러나지 않는다.
  //   store 의 load 에는 중복 방지 가드가 있어 여러 칩이 불러도 안전하다.
  useEffect(() => {
    void load();
  }, [load]);

  const chips = useMemo(
    () =>
      related.map((person) => {
        const contact = contacts.find((c) => c.id === person.staffId);
        return {
          staffId: person.staffId,
          // 연락처에 살아 있으면 현재 이름, 없으면 저장해 둔 이름
          name: contact?.name ?? person.nameSnapshot,
          missing: contact === undefined,
          phone: contact?.mobile ?? contact?.officePhone,
          subtitle: contact?.department,
        };
      }),
    [related, contacts],
  );

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip.staffId}
          title={
            chip.missing
              ? '연락처에서 지워진 사람입니다'
              : [chip.subtitle, chip.phone ? formatPhoneNumber(chip.phone) : undefined]
                  .filter(Boolean)
                  .join(' · ')
          }
          // sp-* 토큰에는 Tailwind 투명도 수식(/50 등)이 듣지 않는다 — 규칙 자체가
          // 생성되지 않아 조용히 아무 색도 안 입는다. 그래서 흐림은 투명도가 아니라
          // 색 토큰(text-sp-muted)과 기울임으로 낸다.
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs border ${
            chip.missing
              ? 'border-sp-border bg-sp-surface text-sp-muted italic'
              : 'border-sp-border bg-sp-surface text-sp-text'
          }`}
        >
          <span className="material-symbols-outlined text-sm leading-none">badge</span>
          {chip.name}
          {chip.missing && <span className="text-[10px]">· 연락처에 없음</span>}
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(chip.staffId)}
              title={`${chip.name} 제거`}
              className="min-h-6 min-w-6 -mr-1 inline-flex items-center justify-center rounded-full text-sp-muted hover:text-sp-error transition-colors"
            >
              <span className="material-symbols-outlined text-sm leading-none">close</span>
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
