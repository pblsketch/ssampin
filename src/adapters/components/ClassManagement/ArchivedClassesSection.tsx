import { useMemo } from 'react';
import type { TeachingClass } from '@domain/entities/TeachingClass';
import { formatTermKo } from '@domain/rules/academicCalendar';

/**
 * 보관된 수업반 섹션 — 학급 목록 하단 접이식 "캐비닛".
 *
 * 표시 규칙 (school-year-archive plan §4 S1.3 ②, 오너 결정 2):
 * - archivedTerm(학기) → groupId(같은 교실) 2단 그룹화
 * - groupId 없는 단독 반은 학기 그룹 아래 "기타"
 * - archivedTerm 없는 레거시 항목은 "학기 미상" — 어느 것도 숨기지 않는다
 *
 * 그룹핑 로직(groupArchivedClasses)은 P3 보관함 뷰어(S3.1)가 같은 개념을
 * 재사용할 수 있도록 순수 함수로 분리해 export한다.
 */

/** 학기 미상(레거시) 그룹 키 */
export const UNKNOWN_TERM_KEY = '__unknown-term__';
/** groupId 없는 단독 반("기타") 그룹 키 */
export const LOOSE_ROOM_KEY = '__loose__';

export interface ArchivedRoomGroup {
  /** groupId 또는 LOOSE_ROOM_KEY */
  readonly key: string;
  /** 교실 표시명(그룹 첫 반의 name) 또는 '기타' */
  readonly label: string;
  readonly classes: readonly TeachingClass[];
}

export interface ArchivedTermGroup {
  /** archivedTerm('2026-1') 또는 UNKNOWN_TERM_KEY */
  readonly key: string;
  /** '2026학년도 1학기' 또는 '학기 미상' */
  readonly label: string;
  readonly rooms: readonly ArchivedRoomGroup[];
}

/**
 * 보관된 수업반을 학기 → 교실 2단으로 묶는다.
 * 정렬: 학기 최신순(미상 마지막) → 교실 이름순(기타 마지막) → 과목명순.
 * 입력의 어떤 항목도 결과에서 사라지지 않는다(합계 보존).
 */
export function groupArchivedClasses(archived: readonly TeachingClass[]): ArchivedTermGroup[] {
  const termMap = new Map<string, TeachingClass[]>();
  for (const cls of archived) {
    const termKey = cls.archivedTerm ?? UNKNOWN_TERM_KEY;
    const bucket = termMap.get(termKey);
    if (bucket) bucket.push(cls);
    else termMap.set(termKey, [cls]);
  }

  const termKeys = [...termMap.keys()].sort((a, b) => {
    if (a === UNKNOWN_TERM_KEY) return 1;
    if (b === UNKNOWN_TERM_KEY) return -1;
    return b.localeCompare(a); // 최신 학기 먼저
  });

  return termKeys.map((termKey) => {
    const items = termMap.get(termKey) ?? [];
    const roomMap = new Map<string, TeachingClass[]>();
    for (const cls of items) {
      const roomKey = cls.groupId ?? LOOSE_ROOM_KEY;
      const bucket = roomMap.get(roomKey);
      if (bucket) bucket.push(cls);
      else roomMap.set(roomKey, [cls]);
    }

    const rooms: ArchivedRoomGroup[] = [...roomMap.entries()]
      .map(([roomKey, classes]) => ({
        key: roomKey,
        label: roomKey === LOOSE_ROOM_KEY ? '기타' : (classes[0]?.name ?? '기타'),
        classes: [...classes].sort((a, b) => a.subject.localeCompare(b.subject, 'ko')),
      }))
      .sort((a, b) => {
        if (a.key === LOOSE_ROOM_KEY) return 1;
        if (b.key === LOOSE_ROOM_KEY) return -1;
        return a.label.localeCompare(b.label, 'ko');
      });

    return {
      key: termKey,
      label: termKey === UNKNOWN_TERM_KEY ? '학기 미상' : formatTermKo(termKey),
      rooms,
    };
  });
}

interface ArchivedClassesSectionProps {
  archivedClasses: readonly TeachingClass[];
  selectedClassId: string | null;
  open: boolean;
  onToggle: () => void;
  onSelect: (id: string) => void;
  onUnarchive: (id: string) => void;
}

export function ArchivedClassesSection({
  archivedClasses,
  selectedClassId,
  open,
  onToggle,
  onSelect,
  onUnarchive,
}: ArchivedClassesSectionProps) {
  const groups = useMemo(() => groupArchivedClasses(archivedClasses), [archivedClasses]);

  return (
    <div className="mt-3 border-t border-sp-border pt-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-1.5 px-1 py-1.5 text-xs text-sp-muted hover:text-sp-text transition-colors"
      >
        <span
          className={`material-symbols-outlined text-sm transition-transform ${open ? 'rotate-180' : ''}`}
        >
          expand_more
        </span>
        <span className="material-symbols-outlined text-sm">inventory_2</span>
        <span className="font-medium">보관된 수업반 ({archivedClasses.length}개)</span>
      </button>

      {open && (
        <div className="mt-1 space-y-3 pb-1">
          {groups.map((term) => (
            <div key={term.key}>
              <p className="px-1 text-caption font-sp-semibold text-sp-muted tracking-wide">
                {term.label}
              </p>
              <div className="mt-1 space-y-2">
                {term.rooms.map((room) => (
                  <div key={room.key} className="ml-1.5 border-l-2 border-sp-border pl-2">
                    <p className="text-caption text-sp-muted">{room.label}</p>
                    <div className="mt-0.5 space-y-0.5">
                      {room.classes.map((cls) => {
                        const isSelected = selectedClassId === cls.id;
                        return (
                          <div key={cls.id} className="relative">
                            <button
                              type="button"
                              onClick={() => onSelect(cls.id)}
                              className={`w-full flex items-center gap-2 pl-2 pr-9 py-1.5 rounded-lg text-left transition-all ${
                                isSelected
                                  ? 'bg-sp-surface ring-1 ring-sp-accent'
                                  : 'opacity-70 hover:opacity-100 hover:bg-sp-surface'
                              }`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-sp-muted shrink-0" />
                              <p
                                className={`flex-1 min-w-0 text-xs truncate ${
                                  isSelected ? 'text-sp-text font-medium' : 'text-sp-muted'
                                }`}
                              >
                                {room.key === LOOSE_ROOM_KEY
                                  ? `${cls.name} · ${cls.subject}`
                                  : cls.subject}
                              </p>
                            </button>
                            <button
                              type="button"
                              onClick={() => onUnarchive(cls.id)}
                              title="보관 해제"
                              aria-label={`${cls.name} ${cls.subject} 보관 해제`}
                              className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-md text-sp-muted opacity-60 hover:opacity-100 hover:text-sp-accent hover:bg-sp-card transition-all"
                            >
                              <span className="material-symbols-outlined text-base">unarchive</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
