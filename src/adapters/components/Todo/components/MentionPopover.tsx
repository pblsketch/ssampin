import { useEffect, useMemo } from 'react';
import { useStaffContactStore } from '@adapters/stores/useStaffContactStore';
import type { StaffContact } from '@domain/entities/StaffContact';
import { filterStaffContacts } from '@domain/rules/contactRules';

/** 좁은 팝오버라 몇 명만 보여준다. 더 좁히려면 사용자가 글자를 더 치면 된다. */
const MAX_SUGGESTIONS = 6;

interface MentionPopoverProps {
  /** "@" 다음에 친 글자. 빈 문자열이면 전체 목록 앞부분을 보여준다 */
  query: string;
  onPick: (contact: StaffContact) => void;
  onClose: () => void;
}

/**
 * "@" 를 쳤을 때 뜨는 교직원 고르기 목록.
 *
 * ★ **교직원만 후보다.** 학생·보호자는 이번 범위가 아니다(오너 미결정). 그래서 통합 검색
 *   (`filterContactEntries`)이 아니라 **교직원 전용** `filterStaffContacts` 를 쓴다 —
 *   타입이 `StaffContact` 라 학생·보호자가 들어올 길이 아예 없다.
 *
 * 검색은 연락처 화면과 같은 규칙이라 초성("ㄱㅁㅎ")도 그대로 걸린다.
 */
export function MentionPopover({ query, onPick, onClose }: MentionPopoverProps) {
  const contacts = useStaffContactStore((s) => s.contacts);
  const load = useStaffContactStore((s) => s.load);

  useEffect(() => {
    void load();
  }, [load]);

  const matches = useMemo(
    () => filterStaffContacts(contacts, query).slice(0, MAX_SUGGESTIONS),
    [contacts, query],
  );

  return (
    <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl border border-sp-border bg-sp-card shadow-2xl overflow-hidden">
      {contacts.length === 0 ? (
        <p className="px-3 py-2.5 text-xs text-sp-muted">
          등록된 교직원 연락처가 없습니다. 연락처 화면에서 먼저 등록해주세요.
        </p>
      ) : matches.length === 0 ? (
        <p className="px-3 py-2.5 text-xs text-sp-muted">찾는 교직원이 없습니다</p>
      ) : (
        <ul className="max-h-48 overflow-y-auto">
          {matches.map((contact) => (
            <li key={contact.id}>
              <button
                type="button"
                onClick={() => onPick(contact)}
                className="flex min-h-6 w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-sp-surface"
              >
                <span className="material-symbols-outlined shrink-0 text-base text-sp-muted">
                  badge
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-sp-text">{contact.name}</span>
                  {(contact.department ?? contact.position) !== undefined && (
                    <span className="block truncate text-[11px] text-sp-muted">
                      {[contact.department, contact.position].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        onClick={onClose}
        className="min-h-6 w-full border-t border-sp-border px-3 py-1.5 text-[11px] text-sp-muted hover:text-sp-text transition-colors"
      >
        닫기
      </button>
    </div>
  );
}
