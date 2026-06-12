import type { BoardTemplateId } from '../entities/BoardTemplate';

/**
 * 협업보드 템플릿 초기 스냅샷 제공 포트 (PDCA-3 / G005, ADR-012)
 *
 * 보드 생성 시점에 템플릿 요소를 y-excalidraw 저장 형식의 Y.Doc 업데이트
 * 바이너리로 직렬화해 돌려준다. infrastructure/BoardTemplateSeeder 가 구현.
 * 'blank' 또는 시딩이 불필요한 경우 null.
 */
export interface IBoardTemplatePort {
  buildInitialSnapshot(templateId: BoardTemplateId): Uint8Array | null;
}
