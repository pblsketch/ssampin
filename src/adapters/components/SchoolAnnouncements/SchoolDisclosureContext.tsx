import { createContext, useContext } from 'react';
import type { SchoolDisclosureIdentity } from '@domain/services/schoolIdentify';

/**
 * 학교 알리미 공시 탭들이 공유하는 "현재 조회 대상 학교".
 * 기본은 우리 학교(설정), 검색으로 다른 학교를 고르면 그 학교로 바뀐다.
 * null = 식별 불가(주소 미상/custom 학교급) → 탭에서 안내.
 */
const SchoolDisclosureContext = createContext<SchoolDisclosureIdentity | null>(null);

export const SchoolDisclosureProvider = SchoolDisclosureContext.Provider;

export function useSelectedSchool(): SchoolDisclosureIdentity | null {
  return useContext(SchoolDisclosureContext);
}
