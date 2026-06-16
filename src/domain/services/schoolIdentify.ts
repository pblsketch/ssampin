/**
 * 쌤핀 학교 설정(NEIS 주소·학교급·학교명)에서 학교알리미 공시 조회에 필요한
 * 시도/시군구/학교급 코드를 도출한다 — 순수 도메인.
 *
 * 학교알리미 OpenAPI는 (sidoCode, sggCode, schulKndCode)로 지역 학교 전체를 주므로,
 * 주소 앞부분으로 지역을 해석하고 학교명(SCHUL_NM)으로 우리 학교 행을 추린다.
 * custom 학교급이나 주소 파싱 실패 시 null(상위에서 수동 폴백/안내).
 */
import { resolveSido, resolveSggList, SCHOOL_KIND, type SchoolKindName } from './schoolinfoCodes';
import type { SchoolLevel } from '../entities/Settings';

const LEVEL_TO_KIND: Record<SchoolLevel, SchoolKindName | null> = {
  elementary: '초등학교',
  middle: '중학교',
  high: '고등학교',
  custom: null,
};

export interface SchoolDisclosureIdentity {
  readonly sidoCode: string;
  /** 자치구를 가진 시("성남시")는 하위 구를 합산 검색하므로 목록일 수 있다. */
  readonly sggList: readonly { name: string; code: string }[];
  readonly schulKndCode: string;
  readonly schoolName: string;
}

export function identifySchoolForDisclosure(params: {
  address: string;
  schoolLevel: SchoolLevel;
  schoolName: string;
}): SchoolDisclosureIdentity | null {
  const kindName = LEVEL_TO_KIND[params.schoolLevel];
  if (!kindName) return null;
  if (!params.schoolName.trim()) return null;

  const tokens = params.address.trim().split(/\s+/);
  if (tokens.length < 2) return null;
  const sido = resolveSido(tokens[0]!);
  if (!sido) return null;

  // "경기도 성남시 분당구 …"처럼 2-depth 자치구를 우선 시도, 없으면 단일 시군구.
  let sggList: { name: string; code: string }[] = [];
  if (tokens.length >= 3) {
    sggList = resolveSggList(sido.name, `${tokens[1]} ${tokens[2]}`);
  }
  if (sggList.length === 0) {
    sggList = resolveSggList(sido.name, tokens[1]!);
  }
  if (sggList.length === 0) return null;

  return {
    sidoCode: sido.code,
    sggList,
    schulKndCode: SCHOOL_KIND[kindName],
    schoolName: params.schoolName.trim(),
  };
}

/** 학교명 정규화 비교 (공백 무시) — 공시 list 에서 우리 학교 행 필터용 */
export function isSameSchoolName(a: string, b: string): boolean {
  return a.replace(/\s/g, '') === b.replace(/\s/g, '');
}
