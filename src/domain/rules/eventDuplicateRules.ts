import type { SchoolEvent } from '../entities/SchoolEvent';

/**
 * 같은 일정이 여러 번 등록된 것을 찾아내는 규칙.
 *
 * 왜 필요한가 (2026-08-21, 문혜인 선생님 제보) — 구글 캘린더를 연동한 뒤 같은 일정이
 * 2~3개씩 겹쳐 보였다. 원인은 `SyncFromGoogle` 이 "쌤핀이 구글로 올려 보낸 NEIS 학사일정"이
 * 되돌아온 것을 **구글이 만든 새 일정으로 착각해 정체성(카테고리·출처·NEIS 메타)을 덮어쓴 것**
 * 이다. 신분증을 잃은 일정은 다음 NEIS 동기화 때 "없는 일정"으로 판정돼 하나 더 생겼다.
 * 원인은 `SyncFromGoogle` 에서 막았지만, 이미 늘어난 사본은 사용자 자료라 손대지 않았다.
 * 이 규칙은 그 사본을 찾아 화면에서 한 줄로 줄이는 데 쓴다.
 */

/** 한 묶음의 중복 일정 — 남길 하나와 접을 나머지. */
export interface DuplicateEventGroup {
  /** 묶음 식별자 (날짜|제목|시간) — UI key 용 */
  readonly key: string;
  /** 남길 일정 */
  readonly keep: SchoolEvent;
  /** 접을(숨길) 일정 */
  readonly duplicates: readonly SchoolEvent[];
}

/**
 * 어느 쪽을 남길지 정하는 우선순위. 숫자가 작을수록 남긴다.
 *
 * 선생님이 직접 등록한 일정은 **절대 자동으로 접지 않는다** — 사본이 아니라 원본이다.
 * NEIS 학사일정과 구글 사본만 접기 대상이고, 둘 중에서는 NEIS 를 남긴다(구글 사본은
 * 쌤핀이 올려 보낸 것의 메아리라 원본이 아니다).
 */
function ownershipRank(event: SchoolEvent): number {
  if (event.source === 'neis' || event.neis?.eventId) return 1;
  if (event.source === 'google') return 2;
  return 0; // 쌤핀에서 직접 만든 일정 (source 미설정 옛 데이터 포함)
}

/** 제목 비교용 정규화 — 앞뒤 공백·연속 공백·대소문자 차이는 같은 것으로 본다. */
function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** 같은 일정으로 볼지 판정하는 묶음 키. */
function groupKey(event: SchoolEvent): string {
  return [event.date, event.endDate ?? '', event.time ?? '', normalizeTitle(event.title)].join('|');
}

/**
 * 중복 후보에서 제외할 일정.
 *
 * - 이미 숨긴 것: 화면에 없으니 중복이 아니다.
 * - 반복 일정: 같은 제목이 여러 날 반복되는 게 정상이라 오탐 위험이 크다.
 * - 외부 구독 캘린더(`ext:`): 쌤핀이 값을 고칠 수 없어 숨김 처리가 저장되지 않는다.
 */
function isCleanupCandidate(event: SchoolEvent): boolean {
  if (event.isHidden) return false;
  if (event.recurrence) return false;
  if (event.id.startsWith('ext:')) return false;
  return true;
}

/**
 * 같은 날짜·같은 제목·같은 시간으로 두 번 이상 등록된 일정을 묶어서 돌려준다.
 *
 * 접기 대상이 하나도 없는 묶음(예: 선생님이 직접 만든 일정만 2개)은 결과에 넣지 않는다 —
 * 자동으로 손댈 수 있는 게 없기 때문이다.
 */
export function findDuplicateEventGroups(
  events: readonly SchoolEvent[],
): readonly DuplicateEventGroup[] {
  const buckets = new Map<string, SchoolEvent[]>();

  for (const event of events) {
    if (!isCleanupCandidate(event)) continue;
    const key = groupKey(event);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(event);
    else buckets.set(key, [event]);
  }

  const groups: DuplicateEventGroup[] = [];

  for (const [key, bucket] of buckets) {
    if (bucket.length < 2) continue;

    // 순위가 같으면 원래 순서를 유지한다 (먼저 들어온 것을 남긴다).
    const sorted = [...bucket].sort((a, b) => ownershipRank(a) - ownershipRank(b));
    const keep = sorted[0]!;
    // 남길 것보다 순위가 낮은(= 접어도 되는) 것만 대상. 같은 순위의 선생님 원본은 건드리지 않는다.
    const duplicates = sorted.slice(1).filter((e) => ownershipRank(e) > 0);
    if (duplicates.length === 0) continue;

    groups.push({ key, keep, duplicates });
  }

  // 날짜 순으로 보여 준다.
  return groups.sort((a, b) => a.keep.date.localeCompare(b.keep.date));
}

/** 접을 일정의 총 개수 — 배너 문구용. */
export function countDuplicateEvents(groups: readonly DuplicateEventGroup[]): number {
  return groups.reduce((sum, g) => sum + g.duplicates.length, 0);
}
