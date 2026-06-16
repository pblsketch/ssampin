import { describe, it, expect, vi } from 'vitest';
import { EnrichSchoolOnSelect } from '@usecases/school/EnrichSchoolOnSelect';
import type { IEvaluationPlanPort } from '@domain/ports/IEvaluationPlanPort';
import type { EvaluationSchool } from '@domain/entities/EvaluationPlan';

function makePort(
  searchImpl: (name: string) => Promise<readonly EvaluationSchool[]>,
): IEvaluationPlanPort {
  return {
    searchSchools: vi.fn(searchImpl),
    listDocs: vi.fn(),
    downloadAndParse: vi.fn(),
  } as unknown as IEvaluationPlanPort;
}

describe('EnrichSchoolOnSelect', () => {
  describe('geocode (②-A, 순수·오프라인)', () => {
    it('주소에서 시·군 좌표를 동기 반환한다', () => {
      const uc = new EnrichSchoolOnSelect(makePort(async () => []));
      expect(uc.geocode('경기도 성남시 분당구 불정로 6')).toEqual({
        lat: 37.4201,
        lon: 127.1265,
        name: '성남',
      });
    });

    it('한국 주소가 아니면 null', () => {
      const uc = new EnrichSchoolOnSelect(makePort(async () => []));
      expect(uc.geocode('nowhere')).toBeNull();
    });
  });

  describe('matchSchoolInfo (②-B, 네트워크·best-effort)', () => {
    it('이름 유일 일치 → SchoolInfoLink 반환', async () => {
      const port = makePort(async () => [
        {
          shlIdfCd: 'S1',
          name: '한울중학교',
          address: '서울특별시 강남구 도곡로 1',
          kind: '중학교',
        },
      ]);
      const uc = new EnrichSchoolOnSelect(port);
      const link = await uc.matchSchoolInfo('한울중학교', '서울특별시 강남구 도곡로 1');
      expect(link).toEqual({ shlIdfCd: 'S1', matchedName: '한울중학교' });
      expect(port.searchSchools).toHaveBeenCalledWith('한울중학교');
    });

    it('동명이교는 주소로 가른다', async () => {
      const port = makePort(async () => [
        { shlIdfCd: 'A', name: '한울중학교', address: '서울특별시 강남구 …', kind: '중학교' },
        { shlIdfCd: 'B', name: '한울중학교', address: '서울특별시 노원구 …', kind: '중학교' },
      ]);
      const uc = new EnrichSchoolOnSelect(port);
      const link = await uc.matchSchoolInfo('한울중학교', '서울특별시 노원구 동일로 100');
      expect(link?.shlIdfCd).toBe('B');
    });

    it('검색 결과 매칭 실패 → null', async () => {
      const uc = new EnrichSchoolOnSelect(makePort(async () => []));
      expect(await uc.matchSchoolInfo('한울중학교', '서울특별시 강남구')).toBeNull();
    });

    it('포트가 throw 해도 best-effort 로 null(온보딩/NEIS/① 무손상)', async () => {
      const uc = new EnrichSchoolOnSelect(
        makePort(async () => {
          throw new Error('이 기능은 쌤핀 데스크톱 앱에서만 사용할 수 있어요.');
        }),
      );
      expect(await uc.matchSchoolInfo('한울중학교', '서울특별시 강남구')).toBeNull();
    });

    it('이름 2자 미만이면 검색하지 않고 null', async () => {
      const port = makePort(async () => []);
      const uc = new EnrichSchoolOnSelect(port);
      expect(await uc.matchSchoolInfo('한', '서울')).toBeNull();
      expect(port.searchSchools).not.toHaveBeenCalled();
    });
  });
});
