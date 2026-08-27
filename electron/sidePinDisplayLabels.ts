/**
 * 모니터를 사람이 알아볼 수 있는 이름으로 바꾼다 — 순수 함수.
 *
 * 트레이 메뉴와 설정 화면이 같은 목록을 써야 해서, 문자열 만들기를 한 곳에 모았다.
 *
 * 왜 번호를 그대로 못 쓰는가: Electron이 주는 `Display.id`는 `2528732444` 같은 값이라
 * 선생님에게 보여줄 수 없다. 그렇다고 "모니터 1·2"만 붙이면 **어느 것이 어느 것인지**
 * 알 수 없다. 그래서 자리(왼쪽·오른쪽)와 해상도를 함께 적는다 — 화면을 보고 고를 수 있는
 * 정보는 사실상 그 둘뿐이다.
 *
 * Electron을 import하지 않는다. 모니터 배치는 실제 장비 없이 시험할 수 있어야 한다
 * (`sidePinGeometry.ts`와 같은 이유).
 */
import type { SidePinDisplayInfo, SidePinRect } from './sidePinGeometry';

export interface SidePinDisplayChoice {
  readonly id: string;
  /** 화면에 보여줄 이름 — 모니터 이름이 쓸 만하면 그것, 아니면 '모니터 N' */
  readonly name: string;
  /** 주 모니터 기준 자리. 주 모니터 자신이면 '주 모니터' */
  readonly position: string;
  /** '2560×1440' */
  readonly resolution: string;
  /** 100·125·150 같은 배율 백분율 */
  readonly scalePercent: number;
  readonly isPrimary: boolean;
  /** 메뉴에 그대로 넣을 한 줄 — '모니터 2 · 오른쪽 (2560×1440)' */
  readonly menuLabel: string;
}

/** 대조·표시 기준 영역 — 전체 화면 영역이 있으면 그것, 없으면 작업 영역. */
function displayArea(display: SidePinDisplayInfo): SidePinRect {
  return display.bounds ?? display.workArea;
}

/**
 * 이 이름을 사람에게 보여줘도 되는가.
 *
 * Windows는 `\\.\DISPLAY1` 같은 장치 이름을 주기도 한다. 그런 값은 번호보다 나을 것이
 * 없으므로 '모니터 N'으로 대신한다. 모니터를 못 알아보게 하는 이름은 없느니만 못하다.
 */
function isReadableLabel(label: string): boolean {
  const trimmed = label.trim();
  if (trimmed === '') return false;
  if (trimmed.includes('\\')) return false;
  return !/^display\s*\d*$/i.test(trimmed);
}

function centerOf(rect: SidePinRect): { readonly x: number; readonly y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/**
 * 주 모니터를 기준으로 이 모니터가 어느 쪽에 있는지.
 *
 * 가로 차이와 세로 차이 중 **큰 쪽만** 말한다. "오른쪽 위"처럼 둘을 겹쳐 말하면
 * 세로로 몇 픽셀만 어긋나도 이름이 달라져, 같은 배치인데 매번 다르게 읽힌다.
 */
function describePosition(area: SidePinRect, primaryArea: SidePinRect): string {
  const self = centerOf(area);
  const base = centerOf(primaryArea);
  const dx = self.x - base.x;
  const dy = self.y - base.y;

  if (dx === 0 && dy === 0) return '같은 자리';
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? '오른쪽' : '왼쪽';
  return dy > 0 ? '아래' : '위';
}

function toScalePercent(scaleFactor: number | undefined): number {
  if (scaleFactor === undefined || !Number.isFinite(scaleFactor) || scaleFactor <= 0) return 100;
  return Math.round(scaleFactor * 100);
}

/**
 * 연결된 모니터를 고르기 좋은 목록으로 바꾼다.
 *
 * 순서는 받은 그대로 둔다. Electron이 주는 순서가 곧 Windows의 모니터 번호 순서라,
 * 여기서 다시 정렬하면 사용자가 디스플레이 설정에서 본 번호와 어긋난다.
 */
export function describeSidePinDisplays(
  displays: readonly SidePinDisplayInfo[],
  primaryDisplayId: string,
): readonly SidePinDisplayChoice[] {
  const primary = displays.find((d) => d.id === primaryDisplayId) ?? displays[0];
  const primaryArea = primary === undefined ? null : displayArea(primary);

  return displays.map((display, index) => {
    const area = displayArea(display);
    const label = display.label ?? '';
    const name = isReadableLabel(label) ? label.trim() : `모니터 ${index + 1}`;
    const isPrimary = display.id === primaryDisplayId;
    const position = isPrimary
      ? '주 모니터'
      : primaryArea === null
        ? ''
        : describePosition(area, primaryArea);
    const resolution = `${Math.round(area.width)}×${Math.round(area.height)}`;
    const scalePercent = toScalePercent(display.scaleFactor);

    // 배율은 100%가 아닐 때만 적는다. 대부분 100%인데 늘 적으면 읽을 것만 늘어난다.
    const detail = scalePercent === 100 ? resolution : `${resolution}, 배율 ${scalePercent}%`;
    const menuLabel = position === '' ? `${name} (${detail})` : `${name} · ${position} (${detail})`;

    return { id: display.id, name, position, resolution, scalePercent, isPrimary, menuLabel };
  });
}
