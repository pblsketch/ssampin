/**
 * ManageBoard — 협업 보드 목록 CRUD 유스케이스
 *
 * Design §3.5 — 목록/생성/이름 변경/삭제.
 * FileBoardRepository 구현이 id 부여 및 파일 저장을 담당.
 */
import type { Board } from '@domain/entities/Board';
import type { BoardTemplateId } from '@domain/entities/BoardTemplate';
import type { BoardId } from '@domain/valueObjects/BoardId';
import type { IBoardRepository } from '@domain/repositories/IBoardRepository';
import type { IBoardTemplatePort } from '@domain/ports/IBoardTemplatePort';
import type { IBoardSnapshotCodec } from '@domain/ports/IBoardSnapshotCodec';
import type { IUserTemplateRepo } from '@domain/ports/IUserTemplateRepo';

export class ManageBoard {
  constructor(
    private readonly repo: IBoardRepository,
    /** PDCA-3 (G005, ADR-012): 템플릿 초기 스냅샷 시더. 미주입 시 템플릿 무시 */
    private readonly templatePort?: IBoardTemplatePort,
    /** PDCA-4 (G006): "내 템플릿" 기반 생성에 필요. 미주입 시 해당 기능 비활성 */
    private readonly userTemplateRepo?: IUserTemplateRepo,
    private readonly snapshotCodec?: IBoardSnapshotCodec,
  ) {}

  /** 저장된 보드 전체 (최신순) */
  async listAll(): Promise<Board[]> {
    return this.repo.listAll();
  }

  /**
   * 새 보드 생성. 기본 이름 "협업 보드 N"
   * (N = 현재 목록 개수 + 1). repo가 id 부여.
   *
   * templateId 지정 시(블랭크 제외) 템플릿 요소를 y-excalidraw 형식의
   * Y.Doc 스냅샷으로 만들어 즉시 저장한다 — 세션 시작 시 기존 스냅샷 로드
   * 경로(initialState)가 그대로 모든 클라이언트에 전파 (ADR-012).
   */
  async create(name?: string, templateId?: BoardTemplateId | null): Promise<Board> {
    const resolvedName = name?.trim() ? name.trim() : await this.nextDefaultName();
    const board = await this.repo.create({
      name: resolvedName,
      templateId: templateId ?? null,
    });
    if (templateId && this.templatePort) {
      const snapshot = this.templatePort.buildInitialSnapshot(templateId);
      if (snapshot) {
        await this.repo.saveSnapshot(board.id, snapshot);
        const seeded = await this.repo.get(board.id);
        if (seeded) return seeded; // hasSnapshot 반영본
      }
    }
    return board;
  }

  /**
   * "내 템플릿"으로 새 보드 생성 (PDCA-4 / G006, plan AC-4.2).
   * 저장된 요소를 verbatim 으로 새 Y.Doc 스냅샷에 재시딩 — 내장 템플릿과
   * 동일한 생성 시점 시딩 경로(ADR-012)를 재사용한다.
   * 보드 이름이 비면 템플릿 이름을 그대로 쓴다.
   */
  async createFromUserTemplate(name: string | undefined, userTemplateId: string): Promise<Board> {
    if (!this.userTemplateRepo || !this.snapshotCodec) {
      throw new Error('USER_TEMPLATE_UNAVAILABLE');
    }
    const template = await this.userTemplateRepo.load(userTemplateId);
    if (!template) {
      throw new Error('USER_TEMPLATE_NOT_FOUND');
    }
    const resolvedName = name?.trim() ? name.trim() : template.name;
    const board = await this.repo.create({ name: resolvedName, templateId: null });
    const snapshot = this.snapshotCodec.buildSnapshot(template.elements);
    await this.repo.saveSnapshot(board.id, snapshot);
    const seeded = await this.repo.get(board.id);
    return seeded ?? board;
  }

  async rename(id: BoardId, name: string): Promise<Board> {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new Error('보드 이름은 비워둘 수 없습니다.');
    }
    return this.repo.rename(id, trimmed);
  }

  /**
   * 보드 삭제 — 세션 실행 중 여부는 상위(유스케이스 호출자)가 체크한 뒤 호출.
   * Design §3.5: "세션 실행 중이면 거부".
   * 본 유스케이스는 세션 상태를 모르므로 호출 측(electron/ipc/board.ts)에서
   * `YDocBoardServer.getActiveBoardId()` 체크 후 이 메서드 호출.
   */
  async delete(id: BoardId): Promise<void> {
    await this.repo.delete(id);
  }

  private async nextDefaultName(): Promise<string> {
    const existing = await this.repo.listAll();
    return `협업 보드 ${existing.length + 1}`;
  }
}
