/**
 * 장면 **차례 바꾸기**의 정본(오너 결정 2026-09-13) — 지도의 연결점 끌기도, 상세의 앞/뒤 단추도 여기를 지난다.
 *
 * 왜 한 자리인가: 차례가 바뀌면 **이음말의 뜻이 함께 흔들린다.** 이음말은 "앞 장면에서 이 장면으로"를
 * 설명하는 글이라(ADR-108), 앞 장면이 달라진 순간 그 설명은 더 이상 맞는다고 볼 수 없다.
 * 화면의 선만 다시 그리는 구현으로 끝내면, 틀린 관계 설명이 그대로 요청서에 실려 나가
 * 모델이 **없는 인과를 만든다.** 그래서 차례를 옮기는 모든 길이 같은 검토 표시를 남기게 한다.
 *
 * 하지 않는 것:
 *  - 이음말을 **지우지 않는다.** 선생님이 쓴 글이고, 새 관계에도 맞는 경우가 있다. 확인만 요청한다.
 *  - 근거·메모·장면 id 를 건드리지 않는다. 바뀌는 것은 **차례**와 `leadInNeedsCheck` 뿐이다.
 *  - 고리·분기를 만들지 않는다. 한 주제의 장면 차례는 언제나 **한 줄**이다.
 *
 * ★이 파일은 도메인이다. 외부 의존성 import 금지, 순수 함수만 둔다.
 */
import type { NarrativeScene } from '../entities/InquiryThread';

export interface SceneOrderChange {
  readonly scenes: readonly NarrativeScene[];
  /** 앞 장면이 달라져 「이음말 확인」이 붙은 장면 id — 화면이 "연결 N곳을 확인해 주세요"로 알린다. */
  readonly recheckedIds: readonly string[];
}

/**
 * 옮긴 뒤의 차례에 **이음말 확인** 표시를 붙인다(순수).
 *
 * 앞 장면이 달라졌고 이음말이 실제로 적혀 있는 장면만 대상이다.
 *  - 이음말이 없으면 확인할 것이 없다.
 *  - **맨 앞으로 온 장면은 건드리지 않는다** — 첫 장면의 이음말은 화면에도 요청서에도 나오지 않아
 *    확인 표시를 붙여도 선생님이 풀 길이 없다(끌 수 없는 표시를 만들지 않는다).
 */
export function markLeadInRecheck(
  before: readonly NarrativeScene[],
  after: readonly NarrativeScene[],
): SceneOrderChange {
  const prevOf = new Map<string, string | null>();
  before.forEach((sc, i) => prevOf.set(sc.id, i === 0 ? null : (before[i - 1]?.id ?? null)));

  const recheckedIds: string[] = [];
  const scenes = after.map((sc, i) => {
    const nowPrev = i === 0 ? null : (after[i - 1]?.id ?? null);
    const wasPrev = prevOf.get(sc.id) ?? null;
    if (nowPrev === null || nowPrev === wasPrev) return sc;
    if ((sc.leadIn?.trim().length ?? 0) === 0) return sc;
    recheckedIds.push(sc.id);
    return { ...sc, leadInNeedsCheck: true };
  });
  return { scenes, recheckedIds };
}

/**
 * **`movedId` 를 `anchorId` 바로 뒤로 옮긴다** — 지도에서 A 의 ‘다음’ 연결점을 D 의 ‘시작’ 연결점에 놓았을 때.
 *
 * 예: `A → B → C → D` 에서 `placeSceneAfter(scenes, 'A', 'D')` = `A → D → B → C`.
 * D 만 움직이고 나머지의 상대 차례는 그대로다. 근거·메모는 하나도 옮기지 않는다.
 *
 * `null` 이면 **아무것도 하지 않는다**(저장도 하지 않는다):
 *  - 같은 장면끼리 잇기
 *  - 둘 중 하나가 이 주제에 없음(가상 평가 자리·동기화로 사라진 장면)
 *  - 이미 바로 다음임 — 바꿀 것이 없는데 저장하면 `updatedAt` 만 오르고 동기화가 나간다
 */
export function placeSceneAfter(
  scenes: readonly NarrativeScene[],
  anchorId: string,
  movedId: string,
): SceneOrderChange | null {
  if (anchorId === movedId) return null;
  const anchorAt = scenes.findIndex((sc) => sc.id === anchorId);
  const movedAt = scenes.findIndex((sc) => sc.id === movedId);
  if (anchorAt < 0 || movedAt < 0) return null;
  if (movedAt === anchorAt + 1) return null;

  const rest = scenes.filter((sc) => sc.id !== movedId);
  const moved = scenes[movedAt];
  if (moved === undefined) return null;
  const at = rest.findIndex((sc) => sc.id === anchorId) + 1;
  return markLeadInRecheck(scenes, [...rest.slice(0, at), moved, ...rest.slice(at)]);
}

/**
 * 한 칸 앞(-1)/뒤(+1) — 상세의 앞/뒤 단추가 쓰는 길. 연결점 끌기와 **같은 검토 규칙**을 지난다.
 * 끝에서 더 밀면 `null`(저장하지 않는다).
 */
export function stepScene(
  scenes: readonly NarrativeScene[],
  sceneId: string,
  dir: -1 | 1,
): SceneOrderChange | null {
  const at = scenes.findIndex((sc) => sc.id === sceneId);
  const to = at + dir;
  if (at < 0 || to < 0 || to >= scenes.length) return null;
  const moved = [...scenes];
  const [taken] = moved.splice(at, 1);
  if (taken === undefined) return null;
  moved.splice(to, 0, taken);
  return markLeadInRecheck(scenes, moved);
}

/** 「이음말 확인」이 걸려 있는 장면 수 — 화면이 짧게 알리고, 요청서가 그만큼을 뺀다. */
export function countLeadInChecks(scenes: readonly NarrativeScene[]): number {
  return scenes.filter((sc) => sc.leadInNeedsCheck === true && (sc.leadIn?.trim() ?? '') !== '')
    .length;
}
