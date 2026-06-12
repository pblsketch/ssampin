/**
 * 협업보드 학습 활동 템플릿 규칙 (순수 함수) — PDCA-3 / G005
 *
 * 외부 의존 0개. 4종 템플릿의 기하·색·라벨을 스켈레톤 배열로 생성한다.
 * Excalidraw 요소 완성·Y.Doc 직렬화는 infrastructure/BoardTemplateSeeder 담당.
 *
 * 색상 동기: 캔버스(학생 페이지)는 라이트 테마 고정이라 여기의 hex 는
 * src/index.css 라이트 테마 `--sp-board-template-cell` / `--sp-board-group-*`
 * 값과 동기 유지 필수 (generateBoardHTML.ts STICKER_COLORS 와 동일한 관습).
 */
import type {
  BoardTemplateId,
  BoardTemplateInfo,
  TemplateElementSkeleton,
  TemplateLinearSkeleton,
  TemplateShapeSkeleton,
  TemplateTextSkeleton,
} from '../entities/BoardTemplate';

/** 템플릿 캔버스 색 — index.css 라이트 테마 sp-board-* 토큰과 hex 동기 */
export const TEMPLATE_COLORS = {
  cell: '#f1f5f9', // --sp-board-template-cell
  groupR: '#fee2e2', // --sp-board-group-r
  groupB: '#dbeafe', // --sp-board-group-b
  groupY: '#fef9c3', // --sp-board-group-y
  groupG: '#dcfce7', // --sp-board-group-g
  groupP: '#f3e8ff', // --sp-board-group-p
  groupO: '#ffedd5', // --sp-board-group-o
  /** 만다라트 각 3×3 블록 중심 칸 — sticky-blue 와 동일 hex */
  blockCenter: '#dbeafe',
  /** 만다라트 정중앙(핵심 목표) 칸 — sticky-yellow 와 동일 hex */
  gridCenter: '#fef3c7',
  cellStroke: '#94a3b8',
  axisStroke: '#475569',
  labelText: '#64748b',
  shapeStroke: '#1e293b',
} as const;

/** 다이얼로그에 노출되는 템플릿 목록 (blank 포함, 노출 순서 고정) */
export const BOARD_TEMPLATES: readonly BoardTemplateInfo[] = [
  {
    id: 'blank',
    name: '빈 보드',
    description: '아무것도 없는 흰 캔버스에서 자유롭게 시작해요.',
  },
  {
    id: 'mandalart',
    name: '만다라트',
    description: '9×9 칸 목표 계획표. 가운데 핵심 목표, 둘레 8칸에 세부 목표.',
  },
  {
    id: 'group-activity',
    name: '조별 활동',
    description: '6개 모둠 색 구역. 모둠별로 자기 구역에 메모를 모아요.',
  },
  {
    id: 'brainstorm',
    name: '브레인스토밍',
    description: '십자축 4분면. 구역을 나눠 아이디어를 분류해요.',
  },
  {
    id: 'flow-diagram',
    name: '도형 다이어그램',
    description: '시작-진행-판단-끝 순서도 예시. 이어서 그리며 확장해요.',
  },
] as const;

/**
 * 텍스트 렌더 박스 추정 — Excalidraw 텍스트 요소의 width/height 근사.
 * 한글·전각은 fontSize 1배, 그 외(숫자·영문·공백)는 0.6배로 본다.
 */
export function estimateTextBox(
  text: string,
  fontSize: number,
): { readonly width: number; readonly height: number } {
  const lines = text.split('\n');
  let maxWidth = 0;
  for (const line of lines) {
    let w = 0;
    for (const ch of line) {
      // 한글 자모·CJK·한글 음절·전각 영역 — 전각 공백 리터럴은 lint 금지라 escape 표기
      w += /[\u1100-\u11FF\u3000-\u9FFF\uAC00-\uD7AF\uFF00-\uFFEF]/.test(ch) ? 1 : 0.6;
    }
    maxWidth = Math.max(maxWidth, w);
  }
  return {
    width: Math.ceil(maxWidth * fontSize),
    height: Math.ceil(lines.length * fontSize * 1.25),
  };
}

function rect(args: {
  x: number;
  y: number;
  width: number;
  height: number;
  backgroundColor: string;
  rounded?: boolean;
  kind?: 'rectangle' | 'diamond' | 'ellipse';
  strokeColor?: string;
  strokeWidth?: number;
}): TemplateShapeSkeleton {
  return {
    kind: args.kind ?? 'rectangle',
    x: args.x,
    y: args.y,
    width: args.width,
    height: args.height,
    backgroundColor: args.backgroundColor,
    rounded: args.rounded ?? false,
    strokeColor: args.strokeColor ?? TEMPLATE_COLORS.cellStroke,
    strokeWidth: args.strokeWidth ?? 1,
  };
}

function label(args: {
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color?: string;
  textAlign?: 'left' | 'center';
}): TemplateTextSkeleton {
  const box = estimateTextBox(args.text, args.fontSize);
  return {
    kind: 'text',
    x: args.x,
    y: args.y,
    text: args.text,
    fontSize: args.fontSize,
    width: box.width,
    height: box.height,
    textAlign: args.textAlign ?? 'left',
    strokeColor: args.color ?? TEMPLATE_COLORS.labelText,
  };
}

/** 도형 가운데 정렬 텍스트 — 도형 중심에 라벨 배치 */
function centeredLabel(
  shape: { x: number; y: number; width: number; height: number },
  text: string,
  fontSize: number,
  color: string,
): TemplateTextSkeleton {
  const box = estimateTextBox(text, fontSize);
  return {
    kind: 'text',
    x: Math.round(shape.x + (shape.width - box.width) / 2),
    y: Math.round(shape.y + (shape.height - box.height) / 2),
    text,
    fontSize,
    width: box.width,
    height: box.height,
    textAlign: 'center',
    strokeColor: color,
  };
}

/** 만다라트 — 9×9 = 81 칸, 칸 90px (AC-3.1) */
export function buildMandalart(): TemplateElementSkeleton[] {
  const CELL = 90;
  const out: TemplateElementSkeleton[] = [];
  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      const isGridCenter = row === 4 && col === 4;
      const isBlockCenter = row % 3 === 1 && col % 3 === 1;
      out.push(
        rect({
          x: col * CELL,
          y: row * CELL,
          width: CELL,
          height: CELL,
          backgroundColor: isGridCenter
            ? TEMPLATE_COLORS.gridCenter
            : isBlockCenter
              ? TEMPLATE_COLORS.blockCenter
              : TEMPLATE_COLORS.cell,
        }),
      );
    }
  }
  return out;
}

/** 조별 활동 — 6개 모둠 색 구역 (3열 × 2행) + 모둠 라벨 (AC-3.4) */
export function buildGroupActivity(): TemplateElementSkeleton[] {
  const ZONE_W = 480;
  const ZONE_H = 360;
  const GAP = 40;
  const colors = [
    TEMPLATE_COLORS.groupR,
    TEMPLATE_COLORS.groupB,
    TEMPLATE_COLORS.groupY,
    TEMPLATE_COLORS.groupG,
    TEMPLATE_COLORS.groupP,
    TEMPLATE_COLORS.groupO,
  ];
  const out: TemplateElementSkeleton[] = [];
  for (let i = 0; i < 6; i += 1) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = col * (ZONE_W + GAP);
    const y = row * (ZONE_H + GAP);
    out.push(
      rect({
        x,
        y,
        width: ZONE_W,
        height: ZONE_H,
        backgroundColor: colors[i] ?? TEMPLATE_COLORS.cell,
        rounded: true,
      }),
    );
    out.push(
      label({
        x: x + 16,
        y: y + 12,
        text: `${i + 1}모둠`,
        fontSize: 28,
        color: TEMPLATE_COLORS.shapeStroke,
      }),
    );
  }
  return out;
}

/** 브레인스토밍 — 십자축 직선 2개 + 4분면 라벨 (AC-3.5) */
export function buildBrainstorm(): TemplateElementSkeleton[] {
  const W = 1280;
  const H = 800;
  const hAxis: TemplateLinearSkeleton = {
    kind: 'line',
    x: 0,
    y: H / 2,
    width: W,
    height: 0,
    points: [
      [0, 0],
      [W, 0],
    ],
    strokeColor: TEMPLATE_COLORS.axisStroke,
    strokeWidth: 2,
    endArrowhead: null,
  };
  const vAxis: TemplateLinearSkeleton = {
    kind: 'line',
    x: W / 2,
    y: 0,
    width: 0,
    height: H,
    points: [
      [0, 0],
      [0, H],
    ],
    strokeColor: TEMPLATE_COLORS.axisStroke,
    strokeWidth: 2,
    endArrowhead: null,
  };
  return [
    hAxis,
    vAxis,
    label({ x: 24, y: 16, text: '구역 1', fontSize: 24 }),
    label({ x: W / 2 + 24, y: 16, text: '구역 2', fontSize: 24 }),
    label({ x: 24, y: H / 2 + 16, text: '구역 3', fontSize: 24 }),
    label({ x: W / 2 + 24, y: H / 2 + 16, text: '구역 4', fontSize: 24 }),
  ];
}

/** 도형 다이어그램 — 순서도 예시 4도형 + 연결 화살표 + 라벨 */
export function buildFlowDiagram(): TemplateElementSkeleton[] {
  const start = rect({
    x: 300,
    y: 0,
    width: 200,
    height: 80,
    backgroundColor: TEMPLATE_COLORS.cell,
    rounded: true,
    strokeColor: TEMPLATE_COLORS.shapeStroke,
  });
  const step = rect({
    x: 300,
    y: 160,
    width: 200,
    height: 80,
    backgroundColor: TEMPLATE_COLORS.cell,
    strokeColor: TEMPLATE_COLORS.shapeStroke,
  });
  const decision = rect({
    kind: 'diamond',
    x: 290,
    y: 320,
    width: 220,
    height: 120,
    backgroundColor: TEMPLATE_COLORS.cell,
    strokeColor: TEMPLATE_COLORS.shapeStroke,
  });
  const end = rect({
    x: 300,
    y: 520,
    width: 200,
    height: 80,
    backgroundColor: TEMPLATE_COLORS.cell,
    rounded: true,
    strokeColor: TEMPLATE_COLORS.shapeStroke,
  });
  const arrow = (y: number, len: number): TemplateLinearSkeleton => ({
    kind: 'arrow',
    x: 400,
    y,
    width: 0,
    height: len,
    points: [
      [0, 0],
      [0, len],
    ],
    strokeColor: TEMPLATE_COLORS.shapeStroke,
    strokeWidth: 1,
    endArrowhead: 'arrow',
  });
  return [
    start,
    arrow(80, 80),
    step,
    arrow(240, 80),
    decision,
    arrow(440, 80),
    end,
    centeredLabel(start, '시작', 20, TEMPLATE_COLORS.shapeStroke),
    centeredLabel(step, '진행', 20, TEMPLATE_COLORS.shapeStroke),
    centeredLabel(decision, '판단', 20, TEMPLATE_COLORS.shapeStroke),
    centeredLabel(end, '끝', 20, TEMPLATE_COLORS.shapeStroke),
  ];
}

/**
 * 템플릿 id → 스켈레톤 배열. 'blank'는 빈 배열 (시딩 생략).
 */
export function buildTemplateSkeletons(id: BoardTemplateId): TemplateElementSkeleton[] {
  switch (id) {
    case 'blank':
      return [];
    case 'mandalart':
      return buildMandalart();
    case 'group-activity':
      return buildGroupActivity();
    case 'brainstorm':
      return buildBrainstorm();
    case 'flow-diagram':
      return buildFlowDiagram();
  }
}
