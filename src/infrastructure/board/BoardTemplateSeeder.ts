/**
 * BoardTemplateSeeder — 템플릿 스켈레톤을 y-excalidraw 저장 형식의
 * Y.Doc 스냅샷(.ybin 바이너리)으로 직렬화 (PDCA-3 / G005, ADR-012)
 *
 * y-excalidraw 2.0.12 저장 형식 (SP-2 스파이크 정적 분석으로 확정):
 *   Y.Array('elements') 안에 Y.Map { pos: fractional-index 문자열,
 *   el: Excalidraw 요소 평면 객체 } 가 들어간다. 클라이언트의
 *   `yjsToExcalidraw` 는 pos 로 정렬 후 el 을 그대로 사용한다.
 *
 * 주의 1 — pos 는 반드시 fractional-indexing 유효 키여야 한다. 클라이언트가
 *   이후 요소를 추가할 때 `generateKeyBetween(마지막 pos, null)` 을 호출하므로
 *   임의 문자열을 쓰면 학생의 첫 드로잉부터 깨진다. 클라이언트 CDN 과 동일
 *   버전(3.2.0)의 fractional-indexing 패키지를 사용한다.
 *
 * 주의 2 — 시딩 요소는 클라이언트 restore() 를 거치지 않고 binding 의
 *   updateScene 으로 직행하므로 Excalidraw 0.17.6 요소 필드를 전부 명시
 *   생성해야 한다 (누락 시 캔버스 렌더 크래시 가능).
 */
import crypto from 'crypto';

import type { BoardTemplateId, TemplateElementSkeleton } from '@domain/entities/BoardTemplate';
import type { IBoardTemplatePort } from '@domain/ports/IBoardTemplatePort';
import { buildTemplateSkeletons } from '@domain/rules/boardTemplateRules';

import { BoardSnapshotCodec } from './boardSnapshotCodec';

/** Excalidraw 0.17.6 ROUNDNESS 상수 (constants.ts 동기) */
const ROUNDNESS_PROPORTIONAL_RADIUS = 2; // 마름모·선형 요소용
const ROUNDNESS_ADAPTIVE_RADIUS = 3; // 사각형용

/** Excalidraw 0.17.6 `_ExcalidrawElementBase` 와 동일한 필드 집합 */
interface ExcalidrawElementBase {
  readonly id: string;
  readonly type: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly angle: number;
  readonly strokeColor: string;
  readonly backgroundColor: string;
  readonly fillStyle: 'solid';
  readonly strokeWidth: number;
  readonly strokeStyle: 'solid';
  readonly roughness: number;
  readonly opacity: number;
  readonly groupIds: readonly string[];
  readonly frameId: null;
  readonly roundness: { readonly type: number } | null;
  readonly seed: number;
  readonly version: number;
  readonly versionNonce: number;
  readonly isDeleted: boolean;
  readonly boundElements: null;
  readonly updated: number;
  readonly link: null;
  readonly locked: boolean;
  readonly customData: { readonly boardTemplate: BoardTemplateId };
}

type SeededElement = ExcalidrawElementBase & Record<string, unknown>;

/** Excalidraw 요소 id 관습(url-safe 영숫자 ~20자)과 동일한 무작위 id */
function randomElementId(): string {
  return crypto.randomBytes(15).toString('base64url');
}

function randomInt31(): number {
  return crypto.randomInt(1, 0x7fffffff);
}

export class BoardTemplateSeeder implements IBoardTemplatePort {
  // G006 리팩토링: Y.Doc 패킹은 BoardSnapshotCodec 으로 일원화 (내 템플릿과 공유)
  private readonly codec = new BoardSnapshotCodec();

  buildInitialSnapshot(templateId: BoardTemplateId): Uint8Array | null {
    const skeletons = buildTemplateSkeletons(templateId);
    if (skeletons.length === 0) return null;

    const elements = skeletons.map((s) => completeElement(s, templateId));
    return this.codec.buildSnapshot(elements);
  }
}

/**
 * 스켈레톤 → 완전한 Excalidraw 0.17.6 요소.
 *
 * 모든 템플릿 요소는 locked=true + 작성자(customData.authorAwarenessId) 없음 —
 * 학생 페이지의 선택 차단 가드(boardRules.canEditElement)와 자동 정합되어
 * 학생은 선택·이동·삭제가 모두 차단된다. 교사는 toolbar 의 "템플릿 잠금"
 * 토글(AC-3.3)로 일괄 해제할 수 있다.
 */
function completeElement(
  skeleton: TemplateElementSkeleton,
  templateId: BoardTemplateId,
): SeededElement {
  const base: ExcalidrawElementBase = {
    id: randomElementId(),
    type: skeleton.kind === 'text' ? 'text' : skeleton.kind,
    x: skeleton.x,
    y: skeleton.y,
    width: skeleton.width,
    height: skeleton.height,
    angle: 0,
    strokeColor: skeleton.strokeColor,
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 1,
    strokeStyle: 'solid',
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: randomInt31(),
    version: 1,
    versionNonce: randomInt31(),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: true,
    customData: { boardTemplate: templateId },
  };

  switch (skeleton.kind) {
    case 'rectangle':
    case 'diamond':
    case 'ellipse':
      return {
        ...base,
        backgroundColor: skeleton.backgroundColor,
        strokeWidth: skeleton.strokeWidth,
        roundness: skeleton.rounded
          ? {
              type:
                skeleton.kind === 'rectangle'
                  ? ROUNDNESS_ADAPTIVE_RADIUS
                  : ROUNDNESS_PROPORTIONAL_RADIUS,
            }
          : null,
      };
    case 'text':
      return {
        ...base,
        text: skeleton.text,
        fontSize: skeleton.fontSize,
        fontFamily: 1,
        textAlign: skeleton.textAlign,
        verticalAlign: 'top',
        containerId: null,
        originalText: skeleton.text,
        lineHeight: 1.25,
        // Excalidraw measureText 근사 — 마지막 줄 baseline. 편집 시 재계산됨.
        baseline: Math.max(1, Math.round(skeleton.height - skeleton.fontSize * 0.25)),
      };
    case 'line':
    case 'arrow':
      return {
        ...base,
        strokeWidth: skeleton.strokeWidth,
        points: skeleton.points.map((p) => [p[0], p[1]]),
        lastCommittedPoint: null,
        startBinding: null,
        endBinding: null,
        startArrowhead: null,
        endArrowhead: skeleton.endArrowhead,
      };
  }
}
