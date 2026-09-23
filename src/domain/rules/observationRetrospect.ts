/**
 * 관찰 기록 응원 2·3차(ADR-137) — '학기 돌아보기'.
 *
 * 알리는 날: 정규 수업 종료일(`resolveRegularTermEnd`)이 든 주의 첫 등교일의 그날 처음 화면.
 * 그날 못 알렸으면 그 주의 다음 등교일에 — 정규 수업 종료일까지. 그 뒤로는 탭에서만 연다.
 *
 * 조각(모두 1차 셈 기준 — 출결 제외, 기록에 적은 날짜, 오늘 뒤 제외):
 * - 학기 잔디·기록한 주 수·반 카드마다 끝낸 바퀴 수
 * - 장면: 많이 남긴 장면(최대 2개)과 아직 없는 기본 장면. 장면 없이 저장한 기록은 세지 않는다.
 * - 초안 준비(이번 학기만): 서로 다른 장면 3가지 이상(조정 가능) 남은 학생 수와 부족한 학생.
 * - 장면을 거의 안 쓰는 반(장면 붙은 기록이 20% 미만이거나 10건 미만 — 조정 가능)은 숫자·명단 대신
 *   한 줄만 보여 준다.
 * 줄 세우기 금지(ADR-134): 학생별 기록 건수·순위는 만들지 않는다.
 */
import { slotsForContext, type SlotContext } from './observationSlots';
import { isSchoolDay } from './schoolDays';
import { weekStartOf, type SchoolCalendarDays } from './schoolCalendarDays';

/** 초안 준비로 치는 서로 다른 장면 수(조정 가능). */
export const DRAFT_READY_MIN_SCENES = 3;
/** 장면을 거의 안 쓰는 반 — 장면 붙은 기록의 비율 기준(조정 가능). */
export const SCENE_USAGE_MIN_RATIO = 0.2;
/** 장면을 거의 안 쓰는 반 — 장면 붙은 기록 수 기준(조정 가능). */
export const SCENE_USAGE_MIN_COUNT = 10;
/** 많이 남긴 장면을 몇 개까지(조정 가능). */
export const TOP_SCENES = 2;

/** 오늘 학기 돌아보기를 알릴 날인가(아직 알리지 않았을 때). */
export function isRetrospectNoticeDay(
  today: string,
  regularTermEnd: string | null,
  cal: SchoolCalendarDays,
): boolean {
  if (regularTermEnd === null) return false;
  if (today < weekStartOf(regularTermEnd) || today > regularTermEnd) return false;
  return isSchoolDay(today, cal);
}

export interface SceneRecord {
  readonly ref: string;
  readonly slots?: readonly string[];
}

export interface SceneSummary {
  /** 장면 붙은 기록이 적어 숫자·명단을 보여 주지 않는 반 */
  readonly rarelyUsesScenes: boolean;
  /** 많이 남긴 장면(많은 순, 같으면 기본 장면 순서) — 최대 TOP_SCENES */
  readonly topScenes: readonly string[];
  /** 아직 한 건도 없는 기본 장면(표시 순서) */
  readonly emptyDefaultScenes: readonly string[];
}

/** 장면 붙은 기록이 적은가 — 20% 미만이거나 10건 미만. */
export function rarelyUsesScenes(records: readonly SceneRecord[]): boolean {
  const withScene = records.filter((r) => (r.slots?.length ?? 0) > 0).length;
  if (withScene < SCENE_USAGE_MIN_COUNT) return true;
  return records.length > 0 && withScene / records.length < SCENE_USAGE_MIN_RATIO;
}

/** 한 카드의 그 학기 기록 → 장면 조각. */
export function summarizeScenes(
  records: readonly SceneRecord[],
  context: SlotContext,
): SceneSummary {
  const counts = new Map<string, number>();
  for (const r of records) {
    for (const s of new Set(r.slots ?? [])) counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const defaults = slotsForContext(context);
  const orderOf = (s: string): number => {
    const i = defaults.indexOf(s);
    return i === -1 ? defaults.length : i;
  };
  const topScenes = [...counts.entries()]
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || orderOf(a[0]) - orderOf(b[0]) || a[0].localeCompare(b[0]))
    .slice(0, TOP_SCENES)
    .map(([s]) => s);
  return {
    rarelyUsesScenes: rarelyUsesScenes(records),
    topScenes,
    emptyDefaultScenes: defaults.filter((s) => (counts.get(s) ?? 0) === 0),
  };
}

export interface DraftReadiness {
  readonly readyCount: number;
  /** 아직 부족한 학생 ref(구성원 순서 그대로) */
  readonly notReadyRefs: readonly string[];
}

/** 구성원마다 그 학기 서로 다른 장면(선생님이 더한 장면 포함) 수를 보고 준비된 학생을 센다. */
export function draftReadiness(
  memberRefs: readonly string[],
  records: readonly SceneRecord[],
  minScenes = DRAFT_READY_MIN_SCENES,
): DraftReadiness {
  const scenesByRef = new Map<string, Set<string>>();
  for (const r of records) {
    if ((r.slots?.length ?? 0) === 0) continue;
    let set = scenesByRef.get(r.ref);
    if (set === undefined) {
      set = new Set<string>();
      scenesByRef.set(r.ref, set);
    }
    for (const s of r.slots ?? []) set.add(s);
  }
  let readyCount = 0;
  const notReadyRefs: string[] = [];
  for (const ref of memberRefs) {
    if ((scenesByRef.get(ref)?.size ?? 0) >= minScenes) readyCount++;
    else notReadyRefs.push(ref);
  }
  return { readyCount, notReadyRefs };
}

/**
 * 지난 학기 카드의 끝낸 바퀴 수 — 저장된 끝 지점 수를 기본으로, 그 학기 명렬을 지금도 알 수
 * 있을 때만 1차 계산(`computedLaps`)을 쓴다(계산은 저장된 수 이상이다).
 */
export function pastTermLapCount(savedCompleted: number, computedLaps: number | null): number {
  const saved = Math.max(0, Math.floor(savedCompleted));
  if (computedLaps === null) return saved;
  return Math.max(saved, Math.floor(computedLaps));
}

/**
 * 담임반의 지난 학기 명렬을 지금 명렬로 볼 수 있는가 — 같은 학년도(학기 이름의 연도가 같음)일 때만.
 */
export function sameSchoolYear(termA: string, termB: string): boolean {
  const ya = termA.split('-')[0];
  const yb = termB.split('-')[0];
  return ya !== undefined && ya !== '' && ya === yb;
}

/** 그림에 넣는 학기 이름 — '2026-2' → '2026학년도 2학기'. 형식이 아니면 원문. */
export function termDisplayName(term: string): string {
  const m = /^(\d{4})-([12])$/.exec(term);
  return m === null ? term : `${m[1]}학년도 ${m[2]}학기`;
}
