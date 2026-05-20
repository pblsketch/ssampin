/**
 * freestyleRules.ts
 *
 * 자유 배치(freestyle) 모드 전용 순수 함수 모음.
 *
 * 기존 `seatRules.ts` (500+줄)에서 분리한 이유:
 * - seatRules 부풀림 방지 (grid/group 셔플 알고리즘 + 4종 제약 + avoidHistory 누적)
 * - freestyle 전용 로직을 한 파일에 모아 Phase 2~5 확장 용이
 *
 * Clean Architecture 도메인 레이어 규칙:
 * - 외부 라이브러리 import 0건 (nanoid 등 금지)
 * - 다른 도메인 entity/rule 만 import
 */

import type { FreestyleDesk, FreestylePresetType } from '@domain/entities/Seating';
import type { Student } from '@domain/entities/Student';
import { isStudentActive } from './studentActivity';

/* ════════════════════════════════════════════════════════════
 * 프리셋 좌표 생성 (Phase 2)
 *
 * 모든 좌표 함수는 0~1000 정규화 좌표를 반환하는 순수 함수다.
 * 외부 의존성 0건, ID 생성은 빌트인 `crypto.randomUUID()` 사용.
 * ════════════════════════════════════════════════════════════ */

/**
 * 프리셋 생성 파라미터.
 *
 * - `studentCount`: 8~40 명 범위. 학급 인원이 적은 농산어촌부터 과밀 학급까지 대응.
 * - `studentIds`: 책상에 순서대로 배정할 학생 ID 목록. 길이가 `studentCount` 와 같거나 짧을 수 있다.
 *   짧은 경우 남은 책상은 `studentId: null` 로 생성된다.
 *   exam 프리셋에서는 호출처에서 학번 순으로 정렬해 전달한다.
 * - `columns`: rows / exam 프리셋 전용. 4~7 열 권장 (한국 표준 6열).
 * - `groupSize`: clusters 프리셋 전용 기본 모둠 인원. 3/4/5/6 중 선택, 기본 4.
 * - `groupSizes`: clusters 프리셋 전용 모둠별 인원 직접 지정. 합계가 `studentCount` 와 일치해야 함.
 * - `teacherPosition`: 교탁 위치. 'top' (기본) 또는 'bottom'.
 * - `numberDirection`: 시험 대형(exam)에서 학번 배정 방향. 'left-to-right' (좌측 첫 줄부터 1번) 또는
 *   'right-to-left' (우측 첫 줄부터 1번). 기본 'left-to-right'.
 */
export interface FreestylePresetParams {
  readonly type: FreestylePresetType;
  readonly studentCount: number;
  readonly studentIds?: readonly string[];
  readonly columns?: number;
  readonly groupSize?: number;
  readonly groupSizes?: readonly number[];
  readonly teacherPosition?: 'top' | 'bottom';
  readonly numberDirection?: 'left-to-right' | 'right-to-left';
}

/** 정규화 좌표 범위 0~1000 의 안전 영역(margin) 안에서만 책상을 배치 */
const COORD_MARGIN = 80;
const COORD_MIN = COORD_MARGIN;
const COORD_MAX = 1000 - COORD_MARGIN;
const COORD_RANGE = COORD_MAX - COORD_MIN;

/** ID 생성 — `crypto.randomUUID()` 우선, 폴백은 `${Date.now()}-${counter}` */
let deskIdCounter = 0;
function newDeskId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  deskIdCounter += 1;
  return `desk-${Date.now()}-${deskIdCounter}`;
}

function takeStudent(ids: readonly string[] | undefined, index: number): string | null {
  if (!ids || index >= ids.length) return null;
  return ids[index] ?? null;
}

/* ─── rows: 일제식 (전통 줄배치) ────────────────────────────────
 * Tier 1, 현장 사용률 87%. 학생을 직사각형 격자로 배치하되 마지막 줄
 * 빈자리는 가운데 정렬한다. 교탁은 상단 또는 하단.
 */
function generateRowsPreset(params: FreestylePresetParams): FreestyleDesk[] {
  const { studentCount } = params;
  const columns = clamp(params.columns ?? 6, 4, 7);
  const rowCount = Math.ceil(studentCount / columns);
  if (rowCount === 0) return [];

  const xGap = COORD_RANGE / (columns + 1);
  const yGap = COORD_RANGE / (rowCount + 1);

  const desks: FreestyleDesk[] = [];
  let idx = 0;
  for (let r = 0; r < rowCount; r++) {
    // 마지막 줄: 빈자리를 가운데 정렬하기 위해 잔여 학생 수 계산
    const studentsInThisRow =
      r === rowCount - 1
        ? studentCount - r * columns // 마지막 줄: 잔여
        : columns;
    // 가운데 정렬을 위한 x offset
    const leftPadding = ((columns - studentsInThisRow) * xGap) / 2;

    for (let c = 0; c < studentsInThisRow; c++) {
      const x = COORD_MIN + leftPadding + xGap * (c + 1);
      const y = COORD_MIN + yGap * (r + 1);
      desks.push({
        id: newDeskId(),
        x: roundCoord(x),
        y: roundCoord(y),
        studentId: takeStudent(params.studentIds, idx),
      });
      idx += 1;
    }
  }
  return desks;
}

/* ─── clusters: 모둠형 ──────────────────────────────────────
 * Tier 1, 현장 사용률 8%. 모둠당 인원 가변(3/4/5/6), 모둠 카드는
 * 균일 외곽 박스(2x3)에 정렬되어 모둠 카드 크기가 일관된다.
 */
function generateClustersPreset(params: FreestylePresetParams): FreestyleDesk[] {
  const { studentCount } = params;
  // 모둠 인원 결정
  const sizes = resolveGroupSizes(studentCount, params.groupSize ?? 4, params.groupSizes);
  if (sizes.length === 0) return [];

  // 모둠 카드를 2열 grid 에 배치 (3개 이상이면 2열, 5개 이상이면 3열)
  const groupColCount = sizes.length <= 2 ? sizes.length : sizes.length <= 6 ? 2 : 3;
  const groupRowCount = Math.ceil(sizes.length / groupColCount);

  // 모둠 카드 외곽 박스 — 균일 크기 (max 2x3, 책상 단위)
  const cardCols = 2; // 책상 가로 개수
  const cardRows = 3; // 책상 세로 개수 (6인까지)
  // 책상 폭 88·세로 56(아바타+이름 포함 시각적 약 70) 가 겹치지 않도록 cardWidth/Height 를 충분히 크게 잡고
  // 모둠 간 gap 은 작은 고정값으로 유지 (cardGap < cardSize 의 일정 비율)
  const xCardGap = 36;
  const yCardGap = 30;
  const cardWidth = (COORD_RANGE - xCardGap * (groupColCount - 1)) / groupColCount;
  const cardHeight = (COORD_RANGE - yCardGap * (groupRowCount - 1)) / groupRowCount;
  // 책상이 실제로 점유하는 시각적 height ≈ 70 (minHeight 56 + 아바타 + 이름 영역 padding)
  // cardInnerDy 가 이보다 작으면 위·아래 줄 책상의 아바타가 겹치므로 최소값을 강제한다.
  const DESK_VISUAL_HEIGHT = 95;
  const DESK_VISUAL_WIDTH = 100;
  const cardInnerDx = Math.max(DESK_VISUAL_WIDTH, cardWidth / (cardCols + 1));
  const cardInnerDy = Math.max(DESK_VISUAL_HEIGHT, cardHeight / (cardRows + 1));

  const desks: FreestyleDesk[] = [];
  let studentIdx = 0;
  for (let gi = 0; gi < sizes.length; gi++) {
    const gRow = Math.floor(gi / groupColCount);
    const gCol = gi % groupColCount;
    const groupId = `grp-${newDeskId()}`;
    // 모둠 카드 좌상단 좌표 — 정규화 좌표 범위 안에서 균등 분포
    const cardX0 = COORD_MIN + gCol * (cardWidth + xCardGap);
    const cardY0 = COORD_MIN + gRow * (cardHeight + yCardGap);

    // 모둠 내부 배치 (인원수에 따라 패턴 결정)
    const internalPositions = computeClusterInternalPositions(sizes[gi]!, cardCols, cardRows);
    for (const pos of internalPositions) {
      const x = cardX0 + cardInnerDx * (pos.col + 1);
      const y = cardY0 + cardInnerDy * (pos.row + 1);
      desks.push({
        id: newDeskId(),
        x: roundCoord(x),
        y: roundCoord(y),
        studentId: takeStudent(params.studentIds, studentIdx),
        groupId,
      });
      studentIdx += 1;
    }
  }
  return desks;
}

/** 모둠 내부 책상 배치 패턴 — `cardCols` x `cardRows` 외곽 박스 안에서 인원수에 맞는 위치 */
function computeClusterInternalPositions(
  size: number,
  cardCols: number,
  cardRows: number,
): Array<{ row: number; col: number }> {
  // 4인 1조 (2x2): row 0~1, col 0~1
  // 3인: 위 2명 + 아래 1명 (가운데)
  // 5인: 2x2 + 가운데 아래 1명
  // 6인: 2x3 (가운데 row 까지 사용)
  // 다른 size 는 row-major 로 채움
  switch (size) {
    case 2:
      return [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
      ];
    case 3:
      return [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 1, col: 0 },
      ];
    case 4:
      return [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 1, col: 0 },
        { row: 1, col: 1 },
      ];
    case 5:
      return [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 1, col: 0 },
        { row: 1, col: 1 },
        { row: 2, col: 0 },
      ];
    case 6:
      return [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 1, col: 0 },
        { row: 1, col: 1 },
        { row: 2, col: 0 },
        { row: 2, col: 1 },
      ];
    default: {
      // 일반화: row-major
      const positions: Array<{ row: number; col: number }> = [];
      for (let i = 0; i < size; i++) {
        positions.push({ row: Math.floor(i / cardCols) % cardRows, col: i % cardCols });
      }
      return positions;
    }
  }
}

/* ─── ushape: ㄷ자형 (Horseshoe / U-Shape) ──────────────────
 * Tier 1, 토론 수업 대표. 3면 분배 (좌측·하단·우측), 교탁은 열린 면.
 * 분배 비율 1 : 2 : 1 (긴 면이 두 짧은 면의 합).
 *
 * 좌·우 반경은 컨테이너 가장자리에 너무 붙지 않도록 안쪽으로 조정.
 * 좌측 x ≈ 180, 우측 x ≈ 820 (정규화 좌표). 가운데 빈 공간 적정화.
 */
function generateUshapePreset(params: FreestylePresetParams): FreestyleDesk[] {
  const { studentCount } = params;
  if (studentCount === 0) return [];

  // 분배: 좌측/우측 = N/4, 하단 = N/2 (균등 분배)
  const sideCount = Math.floor(studentCount / 4);
  const bottomCount = studentCount - 2 * sideCount;

  // 좌·우 면을 컨테이너 가장자리에서 안쪽으로 100 정도 들여 배치
  const SIDE_INSET = 100;
  const leftX = COORD_MIN + SIDE_INSET;
  const rightX = COORD_MAX - SIDE_INSET;
  // 좌·우 면 시작 y (상단 교탁 영역에서 약간 떨어뜨림)
  const sideYTop = COORD_MIN + 120;
  // 하단 면 y (좌·우 면 끝점보다 약간 아래)
  const bottomY = COORD_MAX - 30;

  const desks: FreestyleDesk[] = [];
  let idx = 0;

  // 좌측 면 — 안쪽 바라보기 (rotation 90°)
  if (sideCount > 0) {
    const yRange = bottomY - sideYTop - 80; // 하단 면과 겹치지 않도록 여백
    const yStep = sideCount > 1 ? yRange / (sideCount - 1) : 0;
    for (let i = 0; i < sideCount; i++) {
      const x = leftX;
      const y = sideYTop + yStep * i;
      desks.push({
        id: newDeskId(),
        x: roundCoord(x),
        y: roundCoord(y),
        rotation: 90,
        studentId: takeStudent(params.studentIds, idx),
      });
      idx += 1;
    }
  }

  // 하단 면 — 위쪽 바라보기 (rotation 0°)
  if (bottomCount > 0) {
    const xRange = rightX - leftX;
    const xStep = bottomCount > 1 ? xRange / (bottomCount - 1) : 0;
    for (let i = 0; i < bottomCount; i++) {
      const x = bottomCount === 1 ? (leftX + rightX) / 2 : leftX + xStep * i;
      const y = bottomY;
      desks.push({
        id: newDeskId(),
        x: roundCoord(x),
        y: roundCoord(y),
        rotation: 0,
        studentId: takeStudent(params.studentIds, idx),
      });
      idx += 1;
    }
  }

  // 우측 면 — 안쪽 바라보기 (rotation 270°)
  if (sideCount > 0) {
    const yRange = bottomY - sideYTop - 80;
    const yStep = sideCount > 1 ? yRange / (sideCount - 1) : 0;
    for (let i = 0; i < sideCount; i++) {
      const x = rightX;
      const y = sideYTop + yStep * i;
      desks.push({
        id: newDeskId(),
        x: roundCoord(x),
        y: roundCoord(y),
        rotation: 270,
        studentId: takeStudent(params.studentIds, idx),
      });
      idx += 1;
    }
  }

  return desks;
}

/* ─── exam: 시험 대형 ────────────────────────────────────────
 * Tier 1 (사용자 요청으로 일제식 자리에 승격). 학생 번호가 **세로(column-major) 로
 * 흐르도록** 배치한다. 1번이 1열 1행, 2번이 1열 2행, 3번이 1열 3행, ...
 * 한 열이 다 차면 다음 열로 넘어간다.
 *
 * 호출처는 `studentIds` 를 학번 오름차순으로 정렬해 전달해야 한다.
 * numberDirection 으로 열 진행 방향을 좌→우 / 우→좌 선택할 수 있다.
 */
function generateExamPreset(params: FreestylePresetParams): FreestyleDesk[] {
  const { studentCount } = params;
  const columns = clamp(params.columns ?? 6, 4, 7);
  const rowCount = Math.ceil(studentCount / columns);
  if (rowCount === 0) return [];
  const direction = params.numberDirection ?? 'left-to-right';

  const xGap = COORD_RANGE / (columns + 1);
  const yGap = COORD_RANGE / (rowCount + 1);

  // 열 순서 — 학생 번호가 1열, 2열, ... 순서로 채워질 때 어느 화면 col 부터 채울지
  const colOrder: number[] = [];
  for (let i = 0; i < columns; i++) {
    colOrder.push(direction === 'right-to-left' ? columns - 1 - i : i);
  }

  const desks: FreestyleDesk[] = [];
  let idx = 0;

  // 각 열마다 row 0 부터 row N-1 까지 학생 배정 (column-major)
  for (const c of colOrder) {
    const remaining = studentCount - idx;
    if (remaining <= 0) break;
    const studentsInThisCol = Math.min(rowCount, remaining);
    for (let r = 0; r < studentsInThisCol; r++) {
      const x = COORD_MIN + xGap * (c + 1);
      const y = COORD_MIN + yGap * (r + 1);
      desks.push({
        id: newDeskId(),
        x: roundCoord(x),
        y: roundCoord(y),
        studentId: takeStudent(params.studentIds, idx),
      });
      idx += 1;
    }
  }
  return desks;
}

/**
 * 프리셋 타입에 따라 자유 배치 책상 좌표를 생성한다.
 *
 * 사용 가능한 프리셋:
 * - `exam` (시험 대형): rows 와 동일 좌표 + 학번 정렬 방향 선택 (Tier 1)
 * - `clusters` (모둠형): 기존 「모둠」 모드와 기능 중복으로 자유 배치 다이얼로그에서는 비공개. type 자체는 호환을 위해 유지.
 * - `ushape` (ㄷ자형): 토론 수업 대표 배치 (Tier 1)
 * - `rows`: 이전 호환용. exam 과 동일하게 처리되지만 학번 정렬은 호출처가 보장한다.
 *
 * Tier 2/3 프리셋은 후속 Phase 에서 구현되기 전까지 빈 배열을 반환한다.
 */
export function generateFreestyleDesks(params: FreestylePresetParams): FreestyleDesk[] {
  switch (params.type) {
    case 'exam':
      return generateExamPreset(params);
    case 'rows':
      // 하위 호환: 기존 데이터/스냅샷이 'rows' 로 저장되어 있을 수 있으므로 동일 좌표 알고리즘으로 처리.
      return generateRowsPreset(params);
    case 'clusters':
      return generateClustersPreset(params);
    case 'ushape':
      return generateUshapePreset(params);
    // Tier 2/3 — 후속 Phase 에서 구현. 그 전까지는 안전한 빈 배열 반환.
    case 'pairs':
    case 'facing_rows':
    case 'circle':
    case 'double_horseshoe':
    case 'hybrid_zones':
    case 'chevron':
      return [];
  }
}

/* ─── 모둠 인원 분배 헬퍼 ──────────────────────────────── */

/**
 * 학생 수와 기본 모둠 인원으로 모둠별 인원을 결정한다.
 *
 * - `customSizes` 가 제공되면 그대로 사용 (합계가 `studentCount` 와 일치할 때만)
 * - 그렇지 않으면 `studentCount / baseSize` 모둠을 만들고 나머지는 앞 모둠에 +1 씩 분배
 */
export function resolveGroupSizes(
  studentCount: number,
  baseSize: number,
  customSizes?: readonly number[],
): number[] {
  if (studentCount <= 0) return [];
  if (customSizes && customSizes.length > 0) {
    const total = customSizes.reduce((a, b) => a + b, 0);
    if (total === studentCount) {
      return [...customSizes];
    }
    // 불일치 시 customSizes 무시하고 자동 분배
  }
  const size = clamp(baseSize, 2, 6);
  const groupCount = Math.max(1, Math.ceil(studentCount / size));
  const sizes: number[] = new Array(groupCount).fill(Math.floor(studentCount / groupCount));
  let remainder = studentCount - sizes.reduce((a, b) => a + b, 0);
  let i = 0;
  while (remainder > 0) {
    sizes[i % groupCount]! += 1;
    remainder -= 1;
    i += 1;
  }
  return sizes;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundCoord(value: number): number {
  return Math.round(value * 100) / 100;
}

/* ════════════════════════════════════════════════════════════
 * 자유 배치 셔플 (Phase 5a)
 *
 * 정책: 책상 위치(x, y, rotation, groupId, id)는 고정, `studentId` 만 Fisher-Yates 로 셔플.
 * - 원본 `studentId === null` 인 desk 는 셔플 결과에서도 null 유지 (의도적 빈자리 보존)
 * - `studentId !== null` 인 desk 들에 대해서만 학생을 재분배
 *
 * 외부 의존성 0건, 결정론적 PRNG 주입 가능.
 * ════════════════════════════════════════════════════════════ */

/**
 * 자유 배치 책상들의 학생 ID 만 셔플한다.
 *
 * @param desks 원본 책상 목록 (변경하지 않음)
 * @param random PRNG. 기본값은 `Math.random`. 테스트에서는 결정론적 RNG 주입.
 * @returns 학생만 셔플된 새 책상 배열 (책상 위치/회전/모둠 ID 보존)
 */
export function shuffleFreestyleStudents(
  desks: readonly FreestyleDesk[],
  random: () => number = Math.random,
): FreestyleDesk[] {
  // 1. studentId !== null 인 desk 인덱스만 추출
  const occupiedIndices: number[] = [];
  const studentIds: string[] = [];
  for (let i = 0; i < desks.length; i++) {
    const sid = desks[i]!.studentId;
    if (sid !== null) {
      occupiedIndices.push(i);
      studentIds.push(sid);
    }
  }

  // 2. Fisher-Yates 셔플
  const shuffled = [...studentIds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = tmp;
  }

  // 3. 새 desks 배열 생성 — 점유 desk 에만 셔플된 학생 배정, 빈 desk 는 null 유지
  const result: FreestyleDesk[] = desks.map((d) => ({ ...d }));
  for (let k = 0; k < occupiedIndices.length; k++) {
    const idx = occupiedIndices[k]!;
    result[idx] = { ...result[idx]!, studentId: shuffled[k]! };
  }
  return result;
}

/**
 * 졸업·전학 학생 ID 가 `freestyleDesks` 에 좀비로 남는 것을 차단.
 *
 * 정책:
 * - 활성 학생이 아닌 ID 는 `studentId` 만 `null` 로 변경 (책상 자체는 보존)
 * - 책상 자체 삭제는 하지 않는다 — 교사가 의도적으로 배치한 책상이
 *   자동으로 사라지면 사용자 신뢰가 깨진다
 * - 변경이 없으면 원본 참조 그대로 반환 (React memo 최적화)
 * - 일부만 변경된 경우 변경된 desk 만 새 객체, 정상 desk 는 참조 동일성 유지
 *   (selective re-rendering 으로 불필요한 리렌더 차단)
 */
export function sanitizeFreestyleDesks(
  desks: readonly FreestyleDesk[],
  students: readonly Student[],
): readonly FreestyleDesk[] {
  const activeIds = new Set(students.filter(isStudentActive).map((s) => s.id));
  let changed = false;
  const sanitized = desks.map((desk) => {
    if (desk.studentId !== null && !activeIds.has(desk.studentId)) {
      changed = true;
      return { ...desk, studentId: null };
    }
    return desk; // 참조 동일성 유지
  });
  return changed ? sanitized : desks;
}

/**
 * 두 책상 사이의 유클리드 거리 (정규화 좌표 기준).
 * 결과 범위: 0 ~ ~1414 (대각선 최대 = sqrt(2 * 1000²)).
 *
 * Phase 5 의 분리/인접 제약 변환에서 사용:
 *   normEuclid = gridDistance × (1000 / max(rows, cols))
 */
export function euclideanDistance(a: FreestyleDesk, b: FreestyleDesk): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/**
 * `FreestyleDesk` 배열의 깊은 사본을 생성한다.
 *
 * 스냅샷 저장(`saveCurrentAsSnapshot`) 시 원본 변경이 스냅샷에 영향 없도록
 * 참조 공유를 차단하는 용도.
 *
 * ⚠️ 경고: 현재 `FreestyleDesk` 필드가 모두 primitive(string/number/null) 일 때만
 * 안전한 1-level shallow spread. 향후 중첩 객체 필드(예: `metadata?: Record<string, unknown>`)
 * 가 추가되면 이 함수도 깊은 사본 로직으로 보강해야 한다.
 */
export function cloneFreestyleDesks(
  desks: readonly FreestyleDesk[] | undefined,
): FreestyleDesk[] | undefined {
  return desks?.map((d) => ({ ...d }));
}
