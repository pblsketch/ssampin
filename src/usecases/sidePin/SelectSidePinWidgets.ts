/**
 * 옆핀 위젯 칸에 무엇을 보여줄지 고르는 순수 규칙.
 *
 * 목록은 **대시보드에서 고른 위젯을 그대로 받는다.** 옆핀 전용으로 또 고르게 하지
 * 않는다 — 같은 것을 두 번 고르게 하면 설정만 늘고, 둘이 어긋나면 사람이 맞춰야 한다.
 *
 * **개수로 잘라내지 않는다.** 화면에서 위아래로 훑어 전부 볼 수 있어야 한다.
 * (메모 목록과 같은 결정 — 2026-08-14)
 *
 * 여기서 하는 일은 하나다: **옆핀에 올릴 수 없는 것을 걸러낸다.** 취향이 아니라
 * 물리적·안전상 제약이다 — 학생 개인정보가 담긴 위젯은 늘 떠 있는 창에 두지 않고,
 * 5칸 표처럼 좁은 폭에서 못 읽는 것도 올리지 않는다.
 *
 * 거를 때 두 가지를 하면 안 된다.
 *
 * 1. 말없이 빼기 — 대시보드에 있던 것이 사라졌는데 이유를 모르면 고장으로 여긴다.
 * 2. 다른 위젯으로 그 자리를 채우기 — 고르지도 않은 것이 왜 거기 있는지 설명할 수 없다.
 *
 * 그래서 **빠진 것은 빠진 채로 두고, 무엇이 왜 빠졌는지를 값으로 함께 돌려준다.**
 */
import type { SidePinNavigationTarget, WidgetDefinition } from '@widgets/types';

export interface SidePinWidgetItem {
  readonly id: string;
  readonly name: string;
  readonly navigationTarget: SidePinNavigationTarget;
}

/** 저장값이 현실과 어긋나 화면에서 뺀 항목 */
export interface SidePinWidgetCorrection {
  readonly id: string;
  /** 한국어 사유 — 설정 화면이 그대로 보여준다 */
  readonly reason: string;
}

export interface SelectSidePinWidgetsInput {
  readonly definitions: readonly WidgetDefinition[];
  /** 사용자가 골라 둔 위젯 id와 순서. 비어 있으면 기본값을 채운다 */
  readonly selectedIds: readonly string[];
}

export interface SelectSidePinWidgetsResult {
  readonly items: readonly SidePinWidgetItem[];
  readonly corrections: readonly SidePinWidgetCorrection[];
}

/** 옆핀에 올릴 수 있는 위젯만 남긴다 */
function eligibleOnly(definitions: readonly WidgetDefinition[]): WidgetDefinition[] {
  return definitions.filter((d) => d.sidePin?.eligible === true);
}

function toItem(definition: WidgetDefinition): SidePinWidgetItem | null {
  const meta = definition.sidePin;
  if (meta === undefined || !meta.eligible) return null;
  return { id: definition.id, name: definition.name, navigationTarget: meta.navigationTarget };
}

/**
 * 고른 적이 없을 때 무엇을 채울지 — **올릴 수 있는 것 전부.**
 *
 * 처음에는 앞에서 3개만 채웠는데, 고르는 설정이 아직 없어서 **사용자가 나머지를 볼
 * 방법이 없었다.** 임의로 정한 3개가 사실상 상한처럼 작동한 셈이다.
 * 어차피 칸이 스크롤되므로 전부 띄우고, 덜어내는 일은 설정이 생기면 사용자가 한다.
 * (2026-08-14 — 메모 목록을 자르지 않기로 한 것과 같은 결정)
 *
 * 등록부 순서를 따른다. 임의로 고르면 기기마다 다른 것이 뜬다.
 */
function defaultSelection(definitions: readonly WidgetDefinition[]): string[] {
  return eligibleOnly(definitions).map((d) => d.id);
}

function reasonFor(definition: WidgetDefinition): string {
  const meta = definition.sidePin;
  if (meta !== undefined && !meta.eligible) return meta.unavailableReason;
  // 적격 표시를 아예 안 적은 위젯. 조용히 빠지되 이유는 남긴다.
  return '옆핀에서 지원하지 않습니다';
}

export function selectSidePinWidgets(input: SelectSidePinWidgetsInput): SelectSidePinWidgetsResult {
  const ids =
    input.selectedIds.length > 0 ? input.selectedIds : defaultSelection(input.definitions);

  const items: SidePinWidgetItem[] = [];
  const corrections: SidePinWidgetCorrection[] = [];
  const seen = new Set<string>();

  for (const id of ids) {
    // 같은 위젯이 두 번 들어 있어도 한 번만 보여준다. 저장값이 어긋난 것이지
    // 사용자가 잘못한 것은 아니므로 사유까지 띄우지는 않는다.
    if (seen.has(id)) continue;
    seen.add(id);

    const definition = input.definitions.find((d) => d.id === id);
    if (definition === undefined) {
      corrections.push({ id, reason: '이 위젯이 더 이상 없습니다' });
      continue;
    }

    const item = toItem(definition);
    if (item === null) {
      corrections.push({ id, reason: reasonFor(definition) });
      continue;
    }

    items.push(item);
  }

  // 빠진 자리를 다른 위젯으로 채우지 않는다.
  //
  // 목록은 선생님이 대시보드에서 고른 것이다. 그중 하나가 옆핀에 못 올라간다고 해서
  // **고르지도 않은 위젯을 끼워 넣으면**, 왜 그게 거기 있는지 설명할 길이 없다.
  // 빠진 것은 빠진 채로 두고, 무엇이 왜 빠졌는지만 corrections로 알린다.
  return { items, corrections };
}
