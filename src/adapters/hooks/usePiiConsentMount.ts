import { useCallback, useEffect, useState } from 'react';
import type { ConsentMode } from '@domain/valueObjects/ConsentMode';
import { isConsentMode } from '@domain/valueObjects/ConsentMode';
import { recordConsent } from '@adapters/di/container';

/**
 * usePiiConsentMount — 학생 PII 첫 진입 시 1회 ConsentModal 트리거 (US-P5 후속 wire)
 *
 * 동작:
 * - localStorage flag `pii_consent_v1` 미설정이면 modalOpen=true 반환 (마운트 시 1회).
 * - 사용자가 옵션 선택 시 `recordConsent.execute(mode)` (sticky audit) + flag 영속.
 * - 이미 동의 기록이 있으면 modalOpen=false 유지.
 *
 * **PIPA §15(2) 명시적 동의**: PiiConsentModal 자체가 목적·항목·기간·거부권 카피를 포함하므로
 * 본 hook은 단순히 1회 mount + audit 기록만 책임진다.
 *
 * 관련 ADR: docs/architecture/student-pii-adr-v1.2.md Decision 10 + §Legal Basis
 */
export interface UsePiiConsentMountReturn {
  /** 모달이 표시되어야 하는지 (mount 시 1회만 true). */
  readonly modalOpen: boolean;
  /** 사용자가 모드를 선택했을 때 호출. flag 영속 + audit 기록. */
  readonly onSelect: (mode: ConsentMode) => Promise<void>;
}

const STORAGE_KEY = 'pii_consent_v1';

/** localStorage에서 이전 동의 모드 조회 (없거나 무효 시 null). */
export function readStoredConsent(): ConsentMode | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && isConsentMode(raw)) return raw;
  } catch {
    /* localStorage 접근 실패는 무시 (private mode 등) */
  }
  return null;
}

export function usePiiConsentMount(): UsePiiConsentMountReturn {
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (readStoredConsent() === null) {
      setModalOpen(true);
    }
  }, []);

  const onSelect = useCallback(async (mode: ConsentMode) => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, mode);
      }
    } catch {
      /* localStorage 실패해도 audit + UI 진행 */
    }
    await recordConsent.execute(mode);
    setModalOpen(false);
  }, []);

  return { modalOpen, onSelect };
}
