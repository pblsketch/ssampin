import type { OpaqueBoardElement, UserTemplate, UserTemplateMeta } from '../entities/UserTemplate';

/**
 * "내 템플릿" 저장소 포트 (PDCA-4 / G006)
 *
 * infrastructure/FileUserTemplateRepo 가 구현 —
 * `userData/data/boards/templates/{templateId}.json` 파일 단위 저장.
 */
export interface IUserTemplateRepo {
  /** 저장된 템플릿 메타 전체 (최신순) — 요소 페이로드는 싣지 않는다 */
  listAll(): Promise<UserTemplateMeta[]>;
  /** 단일 템플릿 (요소 포함). 없으면 null */
  load(id: string): Promise<UserTemplate | null>;
  /** 새 템플릿 저장 — id·createdAt 은 구현체가 부여 */
  save(input: {
    readonly name: string;
    readonly versionSchema: string;
    readonly elements: ReadonlyArray<OpaqueBoardElement>;
  }): Promise<UserTemplate>;
  /** 템플릿 삭제 (파일 unlink). 없는 id 는 무시 */
  delete(id: string): Promise<void>;
}
