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
 * ★NEIS 학사일정도 접지 않는다 (2026-08-24 UltraQA) — NEIS 일정을 접으면 수업일수
 * 계산(`lessonCountViewParts`)에서 그날이 조용히 빠지고, 마지막 수업일·진도 밀기의
 * 경계가 함께 틀어진다. 접기 대상은 **구글 사본(쌤핀이 올려 보낸 것의 메아리)뿐**이다.
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
  return [
    event.date,
    event.endDate ?? '',
    event.time ?? '',
    normalizeTitle(event.title),
    // ★장소·설명이 다르면 다른 일정이다 (2026-08-24 UltraQA) — 같은 날 09:00
    //   "학부모 상담"이 학부모별로 두 건일 수 있다. 제목·시간만 보고 하나로 접으면
    //   멀쩡한 일정이 사라져 보인다. (사본을 놓칠 수는 있지만, 놓친 사본은 눈에 보이고
    //   잘못 접힌 원본은 안 보인다.)
    (event.location ?? '').trim(),
    (event.description ?? '').trim(),
  ].join('|');
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
    // ★접는 것은 구글 사본(rank 2)뿐이다 — 선생님 원본은 물론 NEIS 원본도 접지 않는다.
    //   (위 ownershipRank 주석 참조: NEIS 를 접으면 수업일수가 조용히 바뀐다.)
    const duplicates = sorted.slice(1).filter((e) => ownershipRank(e) === 2);
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
