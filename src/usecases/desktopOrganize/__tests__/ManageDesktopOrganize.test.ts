import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_DESKTOP_ORGANIZE_CONFIG,
  type DesktopOrganizeConfig,
} from '@domain/entities/DesktopOrganizeConfig';
import type { IDesktopOrganizeRepository } from '@domain/repositories/IDesktopOrganizeRepository';
import { ManageDesktopOrganize } from '../ManageDesktopOrganize';

class InMemoryRepo implements IDesktopOrganizeRepository {
  private data: DesktopOrganizeConfig | null = null;
  saveCalls = 0;

  async load(): Promise<DesktopOrganizeConfig | null> {
    return this.data;
  }

  async save(config: DesktopOrganizeConfig): Promise<void> {
    this.data = config;
    this.saveCalls += 1;
  }

  /** 테스트용 직접 주입 */
  preset(config: DesktopOrganizeConfig | null): void {
    this.data = config;
    this.saveCalls = 0;
  }
}

describe('ManageDesktopOrganize', () => {
  let repo: InMemoryRepo;
  let useCase: ManageDesktopOrganize;

  beforeEach(() => {
    repo = new InMemoryRepo();
    useCase = new ManageDesktopOrganize(repo);
  });

  describe('load', () => {
    it('첫 실행 (저장된 값 없음): 기본 설정을 만들어 저장하고 반환', async () => {
      const config = await useCase.load();
      expect(config.cols).toBe(DEFAULT_DESKTOP_ORGANIZE_CONFIG.cols);
      expect(config.rows).toBe(DEFAULT_DESKTOP_ORGANIZE_CONFIG.rows);
      expect(config.boxTitles).toEqual(DEFAULT_DESKTOP_ORGANIZE_CONFIG.boxTitles);
      expect(config.boxTransparent).toBe(true);
      expect(repo.saveCalls).toBe(1);
    });

    it('저장된 값 존재: 그대로 반환 (save 호출 안 함)', async () => {
      const stored: DesktopOrganizeConfig = {
        cols: 2,
        rows: 2,
        boxTitles: ['a', 'b', 'c', 'd'],
        boxTransparent: false,
        lastModified: '2026-01-01T00:00:00.000Z',
      };
      repo.preset(stored);
      const config = await useCase.load();
      expect(config).toEqual(stored);
      expect(repo.saveCalls).toBe(0);
    });

    it('첫 실행 시 lastModified가 갱신됨', async () => {
      const before = Date.now();
      const config = await useCase.load();
      const t = Date.parse(config.lastModified);
      expect(t).toBeGreaterThanOrEqual(before);
    });

    it('마이그레이션: 이전 버전 데이터(boxTransparent 누락)는 default(true) 적용', async () => {
      // 이전 버전 — boxTransparent 필드 없음
      const legacy = {
        cols: 2,
        rows: 1,
        boxTitles: ['x', 'y'],
        lastModified: '2026-01-01T00:00:00.000Z',
      } as unknown as DesktopOrganizeConfig;
      repo.preset(legacy);
      const config = await useCase.load();
      expect(config.boxTransparent).toBe(true);
      expect(config.cols).toBe(2);
      expect(config.boxTitles).toEqual(['x', 'y']);
    });
  });

  describe('setTitle', () => {
    it('정상 인덱스에 새 제목 설정 → save + 반영', async () => {
      const initial: DesktopOrganizeConfig = {
        cols: 1,
        rows: 3,
        boxTitles: ['A', 'B', 'C'],
        boxTransparent: true,
        lastModified: '2026-01-01T00:00:00.000Z',
      };
      const next = await useCase.setTitle(initial, 1, '바뀐 제목');
      expect(next.boxTitles).toEqual(['A', '바뀐 제목', 'C']);
      expect(repo.saveCalls).toBe(1);
    });

    it('범위 밖 인덱스는 무시 (save 호출 안 함)', async () => {
      const initial: DesktopOrganizeConfig = {
        cols: 1,
        rows: 3,
        boxTitles: ['A', 'B', 'C'],
        boxTransparent: true,
        lastModified: '2026-01-01T00:00:00.000Z',
      };
      const next = await useCase.setTitle(initial, 5, 'invalid');
      expect(next).toBe(initial);
      expect(repo.saveCalls).toBe(0);
    });

    it('음수 인덱스는 무시', async () => {
      const initial: DesktopOrganizeConfig = {
        cols: 1,
        rows: 3,
        boxTitles: ['A', 'B', 'C'],
        boxTransparent: true,
        lastModified: '2026-01-01T00:00:00.000Z',
      };
      const next = await useCase.setTitle(initial, -1, 'invalid');
      expect(next).toBe(initial);
      expect(repo.saveCalls).toBe(0);
    });

    it('동일 제목은 save 호출 안 함', async () => {
      const initial: DesktopOrganizeConfig = {
        cols: 1,
        rows: 3,
        boxTitles: ['A', 'B', 'C'],
        boxTransparent: true,
        lastModified: '2026-01-01T00:00:00.000Z',
      };
      const next = await useCase.setTitle(initial, 0, 'A');
      expect(next).toBe(initial);
      expect(repo.saveCalls).toBe(0);
    });

    it('20자 초과 제목은 잘림', async () => {
      const initial: DesktopOrganizeConfig = {
        cols: 1,
        rows: 1,
        boxTitles: [''],
        boxTransparent: true,
        lastModified: '2026-01-01T00:00:00.000Z',
      };
      const longTitle = 'a'.repeat(50);
      const next = await useCase.setTitle(initial, 0, longTitle);
      expect(next.boxTitles[0]).toHaveLength(20);
    });

    it('앞뒤 공백 트림', async () => {
      const initial: DesktopOrganizeConfig = {
        cols: 1,
        rows: 1,
        boxTitles: ['old'],
        boxTransparent: true,
        lastModified: '2026-01-01T00:00:00.000Z',
      };
      const next = await useCase.setTitle(initial, 0, '   hello   ');
      expect(next.boxTitles[0]).toBe('hello');
    });
  });

  describe('setGrid', () => {
    it('plan 기반 그리드 변경 + save', async () => {
      const initial: DesktopOrganizeConfig = {
        cols: 1,
        rows: 3,
        boxTitles: ['A', 'B', 'C'],
        boxTransparent: true,
        lastModified: '2026-01-01T00:00:00.000Z',
      };
      const plan = useCase.planResize(initial, 2, 2);
      const next = await useCase.setGrid(initial, plan);
      expect(next.cols).toBe(2);
      expect(next.rows).toBe(2);
      expect(next.boxTitles).toEqual(['A', 'B', 'C', '카테고리 4']);
      expect(repo.saveCalls).toBe(1);
    });

    it('plan.nextTitles 길이가 잘못되면 변경 안 함 (방어적)', async () => {
      const initial: DesktopOrganizeConfig = {
        cols: 1,
        rows: 3,
        boxTitles: ['A', 'B', 'C'],
        boxTransparent: true,
        lastModified: '2026-01-01T00:00:00.000Z',
      };
      const corruptedPlan = {
        from: { cols: 1, rows: 3, titles: ['A', 'B', 'C'] },
        to: { cols: 2, rows: 2 } as { cols: 2; rows: 2 },
        nextTitles: ['only-one'], // 잘못된 길이
        truncated: [],
      };
      const next = await useCase.setGrid(initial, corruptedPlan);
      expect(next).toBe(initial);
      expect(repo.saveCalls).toBe(0);
    });
  });

  describe('resetTitles', () => {
    it('모든 제목을 placeholder로 초기화 (그리드 유지)', async () => {
      const initial: DesktopOrganizeConfig = {
        cols: 2,
        rows: 2,
        boxTitles: ['1', '2', '3', '4'],
        boxTransparent: true,
        lastModified: '2026-01-01T00:00:00.000Z',
      };
      const next = await useCase.resetTitles(initial);
      expect(next.cols).toBe(2);
      expect(next.rows).toBe(2);
      expect(next.boxTitles).toEqual(['카테고리 1', '카테고리 2', '카테고리 3', '카테고리 4']);
      expect(repo.saveCalls).toBe(1);
    });
  });

  describe('setBoxTransparent', () => {
    it('값 변경 시 save 호출 + boxTransparent 반영', async () => {
      const initial: DesktopOrganizeConfig = {
        cols: 1,
        rows: 1,
        boxTitles: [''],
        boxTransparent: true,
        lastModified: '2026-01-01T00:00:00.000Z',
      };
      const next = await useCase.setBoxTransparent(initial, false);
      expect(next.boxTransparent).toBe(false);
      expect(repo.saveCalls).toBe(1);
    });

    it('동일 값은 save 호출 안 함', async () => {
      const initial: DesktopOrganizeConfig = {
        cols: 1,
        rows: 1,
        boxTitles: [''],
        boxTransparent: true,
        lastModified: '2026-01-01T00:00:00.000Z',
      };
      const next = await useCase.setBoxTransparent(initial, true);
      expect(next).toBe(initial);
      expect(repo.saveCalls).toBe(0);
    });

    it('boxTransparent 변경은 그리드와 제목을 보존', async () => {
      const initial: DesktopOrganizeConfig = {
        cols: 2,
        rows: 2,
        boxTitles: ['A', 'B', 'C', 'D'],
        boxTransparent: true,
        lastModified: '2026-01-01T00:00:00.000Z',
      };
      const next = await useCase.setBoxTransparent(initial, false);
      expect(next.cols).toBe(2);
      expect(next.rows).toBe(2);
      expect(next.boxTitles).toEqual(['A', 'B', 'C', 'D']);
      expect(next.boxTransparent).toBe(false);
    });
  });

  describe('setGrid + boxTransparent 보존', () => {
    it('그리드 변경 시 boxTransparent는 보존된다', async () => {
      const initial: DesktopOrganizeConfig = {
        cols: 1,
        rows: 3,
        boxTitles: ['A', 'B', 'C'],
        boxTransparent: false,
        lastModified: '2026-01-01T00:00:00.000Z',
      };
      const plan = useCase.planResize(initial, 2, 2);
      const next = await useCase.setGrid(initial, plan);
      expect(next.boxTransparent).toBe(false);
      expect(next.cols).toBe(2);
      expect(next.rows).toBe(2);
    });
  });

  describe('planResize', () => {
    it('계산만 하고 save 호출 안 함', async () => {
      const initial: DesktopOrganizeConfig = {
        cols: 3,
        rows: 1,
        boxTitles: ['A', 'B', 'C'],
        boxTransparent: true,
        lastModified: '2026-01-01T00:00:00.000Z',
      };
      const plan = useCase.planResize(initial, 1, 1);
      expect(plan.truncated).toHaveLength(2); // B, C 잘림
      expect(repo.saveCalls).toBe(0); // save 안 함
    });
  });
});
