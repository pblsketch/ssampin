import type { DesktopOrganizeConfig } from '../entities/DesktopOrganizeConfig';

/**
 * desktop-organize 카드 설정 영속화 포트.
 * adapters/repositories/JsonDesktopOrganizeRepository.ts 가 구현.
 */
export interface IDesktopOrganizeRepository {
  /** 저장된 설정 로드. 없으면 null (첫 실행 시) */
  load(): Promise<DesktopOrganizeConfig | null>;
  /** 설정 저장 (덮어쓰기) */
  save(config: DesktopOrganizeConfig): Promise<void>;
}
