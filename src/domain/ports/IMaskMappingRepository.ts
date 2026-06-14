/**
 * 마스킹 복원표 저장소 포트 — 도메인이 정의하고 infrastructure가 구현한다.
 *
 * 복원표(실명↔별칭)는 개인정보다. 기본은 메모리 전용이며, 사용자가 명시적으로
 * "보관"을 선택했을 때만 이 저장소를 통해 **이 기기에 암호화 저장**된다(만료 있음).
 * 어떤 경우에도 클라우드 동기화(GDrive) 대상이 아니다 — syncRegistry에 등록하지 않는다.
 */
import type { MaskMapping } from '../privacy/types';

/** 보관된 마스킹 세션 한 건 */
export interface SavedMaskSession {
  readonly id: string;
  /** 표시용 라벨(보통 파일명) */
  readonly label: string;
  readonly createdAt: number;
  /** 만료 시각(ms). 이후 자동 폐기. */
  readonly expiresAt: number;
  readonly mappings: readonly MaskMapping[];
}

export interface IMaskMappingRepository {
  /** 만료되지 않은 보관 세션 목록(만료분은 조회 시 정리). */
  list(): Promise<SavedMaskSession[]>;
  /** 세션 보관(같은 id는 덮어씀). 데스크톱 앱에서만 동작. */
  save(session: SavedMaskSession): Promise<void>;
  /** 특정 세션 삭제. */
  remove(id: string): Promise<void>;
  /** 보관된 전체 삭제. */
  clearAll(): Promise<void>;
}
