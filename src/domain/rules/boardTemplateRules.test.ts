import { describe, expect, it } from 'vitest';

import {
  BOARD_TEMPLATE_IDS,
  isBoardTemplateId,
  type TemplateLinearSkeleton,
  type TemplateShapeSkeleton,
  type TemplateTextSkeleton,
} from '../entities/BoardTemplate';
import {
  BOARD_TEMPLATES,
  TEMPLATE_COLORS,
  buildBrainstorm,
  buildFlowDiagram,
  buildGroupActivity,
  buildMandalart,
  buildTemplateSkeletons,
  estimateTextBox,
} from './boardTemplateRules';

describe('boardTemplateRules — 템플릿 메타', () => {
  it('BOARD_TEMPLATES 는 5종 전부를 ID 정의 순서대로 노출한다', () => {
    expect(BOARD_TEMPLATES.map((t) => t.id)).toEqual([...BOARD_TEMPLATE_IDS]);
  });

  it('모든 템플릿에 한국어 이름·설명이 있다', () => {
    for (const t of BOARD_TEMPLATES) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
    }
  });

  it('isBoardTemplateId 는 알려진 id 만 통과시킨다', () => {
    expect(isBoardTemplateId('mandalart')).toBe(true);
    expect(isBoardTemplateId('blank')).toBe(true);
    expect(isBoardTemplateId('unknown')).toBe(false);
    expect(isBoardTemplateId(null)).toBe(false);
    expect(isBoardTemplateId(42)).toBe(false);
  });

  it('buildTemplateSkeletons("blank") 는 빈 배열 — 시딩 생략 신호', () => {
    expect(buildTemplateSkeletons('blank')).toEqual([]);
  });
});

describe('buildMandalart — 9×9 만다라트 (AC-3.1)', () => {
  const cells = buildMandalart() as TemplateShapeSkeleton[];

  it('정확히 81개 사각형이다', () => {
    expect(cells).toHaveLength(81);
    expect(cells.every((c) => c.kind === 'rectangle')).toBe(true);
  });

  it('칸 크기 90×90, 좌표는 0~720 격자에 정렬된다', () => {
    for (const c of cells) {
      expect(c.width).toBe(90);
      expect(c.height).toBe(90);
      expect(c.x % 90).toBe(0);
      expect(c.y % 90).toBe(0);
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThanOrEqual(720);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeLessThanOrEqual(720);
    }
  });

  it('좌표 중복 없이 81칸이 모두 다른 자리다', () => {
    const keys = new Set(cells.map((c) => `${c.x},${c.y}`));
    expect(keys.size).toBe(81);
  });

  it('정중앙 칸은 핵심 목표 색, 각 블록 중심 8칸은 강조 색, 나머지 72칸은 기본 색', () => {
    const gridCenter = cells.filter((c) => c.backgroundColor === TEMPLATE_COLORS.gridCenter);
    const blockCenters = cells.filter((c) => c.backgroundColor === TEMPLATE_COLORS.blockCenter);
    const plain = cells.filter((c) => c.backgroundColor === TEMPLATE_COLORS.cell);
    expect(gridCenter).toHaveLength(1);
    expect(gridCenter[0]!.x).toBe(4 * 90);
    expect(gridCenter[0]!.y).toBe(4 * 90);
    expect(blockCenters).toHaveLength(8);
    expect(plain).toHaveLength(72);
  });
});

describe('buildGroupActivity — 6모둠 색 구역 (AC-3.4)', () => {
  const elements = buildGroupActivity();
  const zones = elements.filter((e) => e.kind === 'rectangle') as TemplateShapeSkeleton[];
  const labels = elements.filter((e) => e.kind === 'text') as TemplateTextSkeleton[];

  it('구역 6개 + 라벨 6개', () => {
    expect(zones).toHaveLength(6);
    expect(labels).toHaveLength(6);
  });

  it('구역 색은 r/b/y/g/p/o 순서로 서로 다르다', () => {
    expect(zones.map((z) => z.backgroundColor)).toEqual([
      TEMPLATE_COLORS.groupR,
      TEMPLATE_COLORS.groupB,
      TEMPLATE_COLORS.groupY,
      TEMPLATE_COLORS.groupG,
      TEMPLATE_COLORS.groupP,
      TEMPLATE_COLORS.groupO,
    ]);
  });

  it('라벨은 "1모둠"~"6모둠"이고 자기 구역 내부에 있다', () => {
    labels.forEach((l, i) => {
      expect(l.text).toBe(`${i + 1}모둠`);
      const zone = zones[i]!;
      expect(l.x).toBeGreaterThanOrEqual(zone.x);
      expect(l.y).toBeGreaterThanOrEqual(zone.y);
      expect(l.x + l.width).toBeLessThanOrEqual(zone.x + zone.width);
      expect(l.y + l.height).toBeLessThanOrEqual(zone.y + zone.height);
    });
  });

  it('구역끼리 겹치지 않는다 (gap 40px)', () => {
    for (let a = 0; a < zones.length; a += 1) {
      for (let b = a + 1; b < zones.length; b += 1) {
        const za = zones[a]!;
        const zb = zones[b]!;
        const overlapX = za.x < zb.x + zb.width && zb.x < za.x + za.width;
        const overlapY = za.y < zb.y + zb.height && zb.y < za.y + za.height;
        expect(overlapX && overlapY).toBe(false);
      }
    }
  });
});

describe('buildBrainstorm — 십자축 + 4분면 라벨 (AC-3.5)', () => {
  const elements = buildBrainstorm();
  const lines = elements.filter((e) => e.kind === 'line') as TemplateLinearSkeleton[];
  const labels = elements.filter((e) => e.kind === 'text') as TemplateTextSkeleton[];

  it('직선 2개 + 라벨 4개', () => {
    expect(lines).toHaveLength(2);
    expect(labels).toHaveLength(4);
  });

  it('가로축과 세로축이 캔버스 중앙에서 교차한다', () => {
    const h = lines[0]!;
    const v = lines[1]!;
    expect(h.points[1]![0]).toBe(1280); // 가로 전체 폭
    expect(h.y).toBe(400); // 세로 중앙
    expect(v.points[1]![1]).toBe(800); // 세로 전체 높이
    expect(v.x).toBe(640); // 가로 중앙
  });

  it('라벨 4개가 사분면마다 하나씩 배치된다', () => {
    const quadrant = (l: TemplateTextSkeleton): string =>
      `${l.x < 640 ? 'L' : 'R'}${l.y < 400 ? 'T' : 'B'}`;
    expect(new Set(labels.map(quadrant)).size).toBe(4);
  });
});

describe('buildFlowDiagram — 순서도 예시', () => {
  const elements = buildFlowDiagram();
  const shapes = elements.filter(
    (e) => e.kind === 'rectangle' || e.kind === 'diamond',
  ) as TemplateShapeSkeleton[];
  const arrows = elements.filter((e) => e.kind === 'arrow') as TemplateLinearSkeleton[];
  const texts = elements.filter((e) => e.kind === 'text') as TemplateTextSkeleton[];

  it('도형 4개(마름모 1·둥근 사각 2) + 화살표 3개 + 라벨 4개', () => {
    expect(shapes).toHaveLength(4);
    expect(shapes.filter((s) => s.kind === 'diamond')).toHaveLength(1);
    expect(shapes.filter((s) => s.kind === 'rectangle' && s.rounded)).toHaveLength(2);
    expect(arrows).toHaveLength(3);
    expect(texts.map((t) => t.text)).toEqual(['시작', '진행', '판단', '끝']);
  });

  it('화살표는 모두 아래 방향 + 화살촉이 있다', () => {
    for (const a of arrows) {
      expect(a.endArrowhead).toBe('arrow');
      expect(a.points[1]![1]).toBeGreaterThan(0);
    }
  });

  it('흐름은 위에서 아래로 (시작 < 진행 < 판단 < 끝)', () => {
    const ys = shapes.map((s) => s.y);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
  });
});

describe('estimateTextBox', () => {
  it('한글은 fontSize 1배, 영문·숫자는 0.6배로 추정한다', () => {
    expect(estimateTextBox('가나다', 20).width).toBe(60);
    expect(estimateTextBox('abc', 20).width).toBe(36);
  });

  it('줄 수에 비례한 높이 (lineHeight 1.25)', () => {
    expect(estimateTextBox('가', 20).height).toBe(25);
    expect(estimateTextBox('가\n나', 20).height).toBe(50);
  });
});
