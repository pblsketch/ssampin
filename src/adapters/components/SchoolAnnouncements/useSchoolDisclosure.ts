import { useEffect, useMemo, useState } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { schoolDisclosurePort } from '@adapters/di/container';
import {
  identifySchoolForDisclosure,
  isSameSchoolName,
  type SchoolDisclosureIdentity,
} from '@domain/services/schoolIdentify';
import { useSelectedSchool } from './SchoolDisclosureContext';

/**
 * 학교알리미 공시(apiType)를 우리 학교 기준으로 조회하는 훅.
 * - 학교 식별 불가(custom/주소 미상) → state 'no-school'
 * - 성공 시 결과를 localStorage 에 캐시, 네트워크 실패 시 캐시값으로 폴백(isStale)
 * - 지역 list 를 받아 우리 학교 행(ourRows)과 지역 전체(allRows, 비교용)를 함께 반환
 */
export type DisclosureState = 'no-school' | 'loading' | 'loaded' | 'error';

type Row = Record<string, unknown>;

const CURRENT_PBAN_YR = String(new Date().getFullYear());

/** 쌤핀 학교 설정에서 학교알리미 공시 식별자(시도/시군구/학교급)를 도출(순수, 메모이즈). */
export function useSchoolIdentity(): SchoolDisclosureIdentity | null {
  const settings = useSettingsStore((s) => s.settings);
  return useMemo(
    () =>
      identifySchoolForDisclosure({
        address: settings.neis?.address ?? '',
        schoolLevel: settings.schoolLevel,
        schoolName: settings.neis?.schoolName ?? settings.schoolName ?? '',
      }),
    [settings.neis?.address, settings.neis?.schoolName, settings.schoolLevel, settings.schoolName],
  );
}

export interface UseSchoolDisclosureResult {
  readonly state: DisclosureState;
  readonly ourRows: readonly Row[];
  readonly allRows: readonly Row[];
  readonly identity: SchoolDisclosureIdentity | null;
  /** 네트워크 실패로 로컬 캐시값을 보여주는 중인지(오프라인 폴백). */
  readonly isStale: boolean;
  /** 캐시 저장 시각(ms). isStale 일 때 "N일 전" 계산용. */
  readonly cachedAt: number | null;
}

function cacheStorageKey(
  identity: SchoolDisclosureIdentity,
  apiType: string,
  sggCodesKey: string,
): string {
  return `ssampin-disc:${apiType}:${identity.sidoCode}:${sggCodesKey}:${identity.schulKndCode}:${CURRENT_PBAN_YR}`;
}

export function useSchoolDisclosure(apiType: string): UseSchoolDisclosureResult {
  // 선택된 학교(Context) 기준으로 조회 — 기본은 우리 학교, 검색 시 다른 학교
  const identity = useSelectedSchool();
  const [state, setState] = useState<DisclosureState>('loading');
  const [allRows, setAllRows] = useState<readonly Row[]>([]);
  const [isStale, setIsStale] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);

  // 자치구 코드 목록을 안정 키로 — identity 객체 참조 변화로 인한 재조회 방지
  const sggCodesKey = identity ? identity.sggList.map((s) => s.code).join(',') : '';

  useEffect(() => {
    if (!identity) {
      setState('no-school');
      setAllRows([]);
      setIsStale(false);
      return;
    }
    let cancelled = false;
    setState('loading');
    setIsStale(false);
    const lsKey = cacheStorageKey(identity, apiType, sggCodesKey);
    void (async () => {
      try {
        const lists = await Promise.all(
          identity.sggList.map((sgg) =>
            schoolDisclosurePort.getAreaDisclosure({
              apiType,
              schulKndCode: identity.schulKndCode,
              sidoCode: identity.sidoCode,
              sggCode: sgg.code,
              pbanYr: CURRENT_PBAN_YR,
            }),
          ),
        );
        if (cancelled) return;
        const merged = lists.flat();
        const now = Date.now();
        setAllRows(merged);
        setIsStale(false);
        setCachedAt(now);
        try {
          localStorage.setItem(lsKey, JSON.stringify({ list: merged, at: now }));
        } catch {
          // 저장 실패(용량 초과 등)는 무시 — 조회 결과엔 영향 없음
        }
        setState('loaded');
      } catch {
        if (cancelled) return;
        // 네트워크 실패 → 로컬 캐시 폴백(오프라인)
        try {
          const raw = localStorage.getItem(lsKey);
          if (raw) {
            const parsed = JSON.parse(raw) as { list?: Row[]; at?: number };
            setAllRows(Array.isArray(parsed.list) ? parsed.list : []);
            setCachedAt(typeof parsed.at === 'number' ? parsed.at : null);
            setIsStale(true);
            setState('loaded');
            return;
          }
        } catch {
          // 캐시 파싱 실패는 무시 → error 로 폴백
        }
        setState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
    // identity 의 코드 조합 + apiType 이 바뀔 때만 재조회
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiType, identity?.sidoCode, identity?.schulKndCode, sggCodesKey]);

  const ourRows = useMemo(() => {
    if (!identity) return [];
    return allRows.filter((r) => isSameSchoolName(String(r.SCHUL_NM ?? ''), identity.schoolName));
  }, [allRows, identity]);

  return { state, ourRows, allRows, identity, isStale, cachedAt };
}
