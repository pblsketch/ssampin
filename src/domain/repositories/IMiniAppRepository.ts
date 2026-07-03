import type { MiniApp } from '../entities/MiniApp';

/**
 * 미니앱 **파일 영속** 포트.
 *
 * 미니앱의 HTML 본문과 이미지 아이콘은 userData/miniapps/<id>/ 아래 로컬 파일로
 * 저장된다(동기화 제외). 메타데이터(이름·아이콘·순서·표시여부)는 {@link MiniApp}로
 * Settings에 실려 별도로 관리되므로, 이 포트는 **바이너리 파일 저장/삭제/조회**만
 * 책임진다. 순서 변경 등 메타 조작은 설정 스토어의 몫이다.
 *
 * 구현: infrastructure(MiniAppFileRepository) — Electron main에 IPC로 위임(파일 쓰기 권한).
 */
export interface IMiniAppRepository {
  /** 앱의 index.html 저장 (userData/miniapps/<id>/index.html). */
  save(id: string, htmlBytes: Uint8Array): Promise<void>;
  /**
   * 이미지 아이콘 저장 (userData/miniapps/<id>/icon.<ext>).
   * @returns 저장된 파일명(예: 'icon.png') — {@link MiniApp} 메타의 icon.fileName에 사용.
   */
  saveIcon(id: string, bytes: Uint8Array, ext: string): Promise<string>;
  /** 앱 폴더 전체 삭제 (HTML·아이콘 함께). */
  remove(id: string): Promise<void>;
  /** 디스크에 존재하는 앱 폴더 id 목록 (메타-파일 정합 확인용). */
  list(): Promise<readonly string[]>;
}
