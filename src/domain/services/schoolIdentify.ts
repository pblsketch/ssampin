/**
 * 쌤핀 학교 설정/검색 결과에서 학교알리미 공시 조회에 필요한
 * 시도/시군구/학교급 코드를 도출한다 — 순수 도메인.
 *
 * 학교알리미 OpenAPI는 (sidoCode, sggCode, schulKndCode)로 지역 학교 전체를 주므로,
 * 주소 앞부분으로 지역을 해석하고 학교명(SCHUL_NM)으로 우리 학교 행을 추린다.
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
  /**
   * 학교알리미 학교 고유번호(SHL_IDF_CD) — 편제표/평가계획 문서 다운로드용.
   * 지역 코드만으로 만든 식별자(주소 기반)엔 없을 수 있어 optional.
   */
  readonly shlIdfCd?: string;
}

/** 주소 앞부분 → 시도코드 + 시군구 코드 목록 (식별 공유 코어). 2-depth 자치구 우선. */
function resolveAddressToRegion(
  address: string,
): { sidoCode: string; sggList: { name: string; code: string }[] } | null {
  const tokens = address.trim().split(/\s+/);
  if (tokens.length < 2) return null;
  const sido = resolveSido(tokens[0]!);
  if (!sido) return null;
  let sggList: { name: string; code: string }[] = [];
  if (tokens.length >= 3) {
    sggList = resolveSggList(sido.name, `${tokens[1]} ${tokens[2]}`);
  }
  if (sggList.length === 0) {
    sggList = resolveSggList(sido.name, tokens[1]!);
  }
  if (sggList.length === 0) return null;
  return { sidoCode: sido.code, sggList };
}

function buildIdentity(
  address: string,
  schulKndCode: string,
  schoolName: string,
  shlIdfCd?: string,
): SchoolDisclosureIdentity | null {
  if (!schoolName.trim()) return null;
  const region = resolveAddressToRegion(address);
  if (!region) return null;
  return {
    sidoCode: region.sidoCode,
    sggList: region.sggList,
    schulKndCode,
    schoolName: schoolName.trim(),
    shlIdfCd: shlIdfCd?.trim() || undefined,
  };
}

/** 우리 학교(쌤핀 설정: 주소+학교급+학교명) → 공시 식별자. custom/주소 미상 시 null. */
export function identifySchoolForDisclosure(params: {
  address: string;
  schoolLevel: SchoolLevel;
  schoolName: string;
  /** 설정에 저장된 학교알리미 고유번호(있으면 편제표 다운로드에 사용). */
  shlIdfCd?: string;
}): SchoolDisclosureIdentity | null {
  const kindName = LEVEL_TO_KIND[params.schoolLevel];
  if (!kindName) return null;
  return buildIdentity(params.address, SCHOOL_KIND[kindName], params.schoolName, params.shlIdfCd);
}

/**
 * 검색 결과(주소 + 학교급명 '초등학교'/'중학교'/'고등학교' + 학교명) → 공시 식별자.
 * 다른 학교 검색 시 사용. 학교급명이 SCHOOL_KIND 에 없거나 주소 파싱 실패 시 null.
 */
export function identifyFromAddressKind(params: {
  address: string;
  kindName: string;
  schoolName: string;
  /** 검색 결과의 학교알리미 고유번호(편제표 다운로드에 사용). */
  shlIdfCd?: string;
}): SchoolDisclosureIdentity | null {
  const schulKndCode = (SCHOOL_KIND as Record<string, string>)[params.kindName];
  if (!schulKndCode) return null;
  return buildIdentity(params.address, schulKndCode, params.schoolName, params.shlIdfCd);
}

/** 학교명 정규화 — 괄호 안 지역/부가정보 제거 + 공백 제거 */
function normalizeSchoolName(name: string): string {
  return name.replace(/\([^)]*\)/g, '').replace(/\s/g, '');
}

/**
 * 학교명 비교 (괄호 부가정보·공백 무시) — 공시 list 에서 우리 학교 행 필터용.
 * 설정의 "온양여자고등학교 (충청남도 아산시)" 와 공시 SCHUL_NM "온양여자고등학교" 를 같게 본다.
 */
export function isSameSchoolName(a: string, b: string): boolean {
  return normalizeSchoolName(a) === normalizeSchoolName(b);
}
