import {
  DEFAULT_DESKTOP_ORGANIZE_CONFIG,
  MAX_BOX_TITLE_LENGTH,
  type DesktopOrganizeConfig,
  type GridDimension,
} from '@domain/entities/DesktopOrganizeConfig';
import type { IDesktopOrganizeRepository } from '@domain/repositories/IDesktopOrganizeRepository';
import { computeGridResizePlan, type GridResizePlan } from './computeGridResizePlan';

/**
 * desktop-organize 카드 설정 관리 유스케이스.
 *
 * Repository를 통해 영속화하며, 도메인 규칙을 강제한다:
 * - 박스 제목: 트림 후 길이 ≤ MAX_BOX_TITLE_LENGTH
 * - 그리드 변경: computeGridResizePlan으로 사전 계산된 plan만 적용
 *
 * 의존성: domain만. adapters/infrastructure import 금지.
 */
export class ManageDesktopOrganize {
  constructor(private readonly repository: IDesktopOrganizeRepository) {}

  /**
   * 저장된 설정을 로드한다. 없으면 기본 설정을 만들어 저장하고 반환한다.
   * 첫 활성화 시 자동으로 default config가 생성된다.
   *
   * 마이그레이션: 이전 버전에 `boxTransparent` 필드가 없던 데이터는
   * default 값(`true`)을 채워 반환한다. 영속화는 다음 변경 시 자동 발생.
   */
  async load(): Promise<DesktopOrganizeConfig> {
    const existing = await this.repository.load();
    if (existing) {
      // 마이그레이션: boxTransparent 필드 누락 시 default 적용
      if (typeof existing.boxTransparent !== 'boolean') {
        return {
          ...existing,
          boxTransparent: DEFAULT_DESKTOP_ORGANIZE_CONFIG.boxTransparent,
        };
      }
      return existing;
    }
    const initial: DesktopOrganizeConfig = {
      ...DEFAULT_DESKTOP_ORGANIZE_CONFIG,
      lastModified: new Date().toISOString(),
    };
    await this.repository.save(initial);
    return initial;
  }

  /**
   * 박스 내부 투명도 토글.
   * @param current 현재 설정
   * @param boxTransparent true=완전 투명, false=sp-card 반투명 배경
   */
  async setBoxTransparent(
    current: DesktopOrganizeConfig,
    boxTransparent: boolean,
  ): Promise<DesktopOrganizeConfig> {
    if (current.boxTransparent === boxTransparent) {
      return current;
    }
    const next: DesktopOrganizeConfig = {
      ...current,
      boxTransparent,
      lastModified: new Date().toISOString(),
    };
    await this.repository.save(next);
    return next;
  }

  /**
   * 박스 제목을 변경한다.
   * - boxIndex가 cols × rows 범위 밖이면 무시
   * - title은 트림 + MAX_BOX_TITLE_LENGTH로 자름
   */
  async setTitle(
    current: DesktopOrganizeConfig,
    boxIndex: number,
    title: string,
  ): Promise<DesktopOrganizeConfig> {
    if (!Number.isInteger(boxIndex) || boxIndex < 0) {
      return current;
    }
    const total = current.cols * current.rows;
    if (boxIndex >= total) {
      return current;
    }

    // 트림 + 길이 제한
    const trimmed = title.trim().slice(0, MAX_BOX_TITLE_LENGTH);

    // 변경 없음 가드
    if (current.boxTitles[boxIndex] === trimmed) {
      return current;
    }

    const nextTitles = current.boxTitles.slice() as string[];
    nextTitles[boxIndex] = trimmed;

    const next: DesktopOrganizeConfig = {
      ...current,
      boxTitles: nextTitles,
      lastModified: new Date().toISOString(),
    };
    await this.repository.save(next);
    return next;
  }

  /**
   * 그리드 크기를 변경한다.
   * 호출자는 미리 computeGridResizePlan으로 잘림 여부를 확인한 뒤,
   * 사용자 동의가 필요하면 동의를 받은 후 이 메서드를 호출한다.
   */
  async setGrid(
    current: DesktopOrganizeConfig,
    plan: GridResizePlan,
  ): Promise<DesktopOrganizeConfig> {
    const cols = plan.to.cols;
    const rows = plan.to.rows;
    const expected = cols * rows;
    if (plan.nextTitles.length !== expected) {
      // plan이 손상된 경우 현재 상태 유지 (방어적)
      return current;
    }

    const next: DesktopOrganizeConfig = {
      cols,
      rows,
      boxTitles: plan.nextTitles.slice(),
      // 박스 투명 설정은 그리드 변경과 독립적 — 보존
      boxTransparent: current.boxTransparent,
      lastModified: new Date().toISOString(),
    };
    await this.repository.save(next);
    return next;
  }

  /**
   * 모든 박스 제목을 placeholder로 초기화한다.
   * 그리드 크기는 유지.
   */
  async resetTitles(current: DesktopOrganizeConfig): Promise<DesktopOrganizeConfig> {
    const total = current.cols * current.rows;
    const placeholders: string[] = [];
    for (let i = 0; i < total; i += 1) {
      placeholders.push(`카테고리 ${i + 1}`);
    }
    const next: DesktopOrganizeConfig = {
      ...current,
      boxTitles: placeholders,
      lastModified: new Date().toISOString(),
    };
    await this.repository.save(next);
    return next;
  }

  /**
   * 그리드 변경 plan을 미리 계산한다 (UI에서 적용 전 미리보기/경고용).
   * 순수 함수 wrapper — repository 호출 없음.
   */
  planResize(
    current: DesktopOrganizeConfig,
    cols: GridDimension,
    rows: GridDimension,
  ): GridResizePlan {
    return computeGridResizePlan({
      from: { cols: current.cols, rows: current.rows, titles: current.boxTitles },
      to: { cols, rows },
    });
  }
}
