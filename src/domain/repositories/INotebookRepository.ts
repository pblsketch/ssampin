import type { Notebook } from '@domain/entities/Notebook';
import type { NotePage, NotePageBody } from '@domain/entities/NotePage';
import type { NoteSection } from '@domain/entities/NoteSection';

export interface INotebookRepository {
  getAllNotebooks(): Promise<readonly Notebook[]>;
  saveNotebooks(notebooks: readonly Notebook[]): Promise<void>;

  getAllSections(): Promise<readonly NoteSection[]>;
  saveSections(sections: readonly NoteSection[]): Promise<void>;

  getAllPagesMeta(): Promise<readonly NotePage[]>;
  savePagesMeta(pagesMeta: readonly NotePage[]): Promise<void>;

  getPageBody(pageId: string): Promise<NotePageBody | null>;
  savePageBody(pageId: string, body: NotePageBody): Promise<void>;
  deletePageBody(pageId: string): Promise<void>;

  /**
   * 현재 저장된 모든 페이지 본문 파일 키 목록을 반환한다.
   * 동기화 시 동적 파일 enumeration에 사용 (note-cloud-sync PDCA).
   * 결과 형태: ['note-body--abc123', 'note-body--def456', ...]
   *
   * 단일 진실 원천: PAGES_META_FILE. 메타에 없는 pageId의 본문은 자동으로 제외되므로
   * 삭제된 페이지의 orphan 파일은 업로드 목록에 포함되지 않는다.
   */
  listPageBodyKeys(): Promise<string[]>;
}
