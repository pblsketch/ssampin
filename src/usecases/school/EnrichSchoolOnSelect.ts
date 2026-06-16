/**
 * 학교 선택 시 보강 — 날씨 좌표(②-A) + 학교알리미 식별자(②-B).
 *
 * 계획서: docs/01-plan/features/school-enrich.plan.md (§6 usecases)
 *
 * - ②-A 좌표: 순수·오프라인. NEIS 주소 → 시·군 좌표(geocodeAddress). 네트워크/키 없음 →
 *   `geocode()` 동기 메서드. 호출부가 즉시 WeatherLocation 을 채워 오프라인에서도 동작한다.
 * - ②-B 식별자: 네트워크(학교알리미 검색)·best-effort. 학교명+주소를 매칭(matchSchool)해
 *   shlIdfCd 를 찾는다. 검색 인프라는 ①(IEvaluationPlanPort.searchSchools)을 재사용한다 —
 *   새 검색 함수/IPC 를 만들지 않는다(§2·§13). 실패/모호하면 null(온보딩·NEIS·① 무손상).
 *
 * usecases 레이어 — domain 만 import 한다(통신은 주입된 포트에 위임).
 */
import type { IEvaluationPlanPort } from '@domain/ports/IEvaluationPlanPort';
import type { SchoolInfoLink } from '@domain/entities/Settings';
import { geocodeAddress, type GeoPoint } from '@domain/services/koreanGeo';
import { matchSchool } from '@domain/services/schoolMatch';

export class EnrichSchoolOnSelect {
  constructor(private readonly evaluationPort: IEvaluationPlanPort) {}

  /**
   * ②-A 날씨 좌표(동기·오프라인). 주소를 시·군 좌표로 변환. 못 찾으면 null.
   * 순수 도메인 위임이라 네트워크/키가 없고 즉시 반환 — 호출부가 WeatherLocation 에 바로 쓴다.
   */
  geocode(address: string): GeoPoint | null {
    return geocodeAddress(address);
  }

  /**
   * ②-B 학교알리미 식별자 매칭(비동기·네트워크·best-effort).
   * 학교명으로 학교알리미를 검색(① 인프라 재사용)하고 주소로 동명이교를 가른다.
   * 확정 매칭이면 SchoolInfoLink, 실패/모호/오류면 null(폴백은 호출부·①모달이 담당).
   *
   * @param neisName    NEIS 원본 학교명(괄호 표기 없는 순수 이름)
   * @param neisAddress NEIS 도로명주소
   */
  async matchSchoolInfo(neisName: string, neisAddress: string): Promise<SchoolInfoLink | null> {
    const name = (neisName ?? '').trim();
    if (name.length < 2) return null; // 검색 최소 2자(학교알리미 자동완성 제약)
    try {
      const hits = await this.evaluationPort.searchSchools(name);
      const result = matchSchool(
        { neisName: name, neisAddress: neisAddress ?? '' },
        hits.map((h) => ({ shlIdfCd: h.shlIdfCd, name: h.name, address: h.address })),
      );
      if (!result.best) return null;
      return { shlIdfCd: result.best.shlIdfCd, matchedName: result.best.name };
    } catch {
      // best-effort: 데스크톱 외 환경/네트워크 차단/검색 실패 모두 조용히 무시
      return null;
    }
  }
}
