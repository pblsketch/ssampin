import { useMemo } from 'react';
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
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs border ${
            chip.missing
              ? 'border-sp-border/50 bg-sp-surface/40 text-sp-muted/70 italic'
              : 'border-sp-accent/30 bg-sp-accent/10 text-sp-text'
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
