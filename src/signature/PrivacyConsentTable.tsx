/**
 * PrivacyConsentTable — Phase 2C US-2C-11 학생 페이지 4행 동의 표.
 *
 * 제1 원칙 (서명받기 1차 정책):
 *   - 자필 서명과 동등한 법적 효력 비주장
 *   - raw IP / 강한 식별자 미저장 (SHA-256 해시만)
 *   - 결과 PDF 시각 워터마크 부재 (메타데이터 Producer/Keywords 로 행정용 표기)
 *
 * 4행 항목 (id 는 submit-signature 의 consent_log 검증과 매칭):
 *   1. legal_effect_disclaimer — 자필 서명과 동등한 법적 효력 비주장 인지
 *   2. hash_storage          — IP/User-Agent SHA-256 해시만 저장 (raw 비저장)
 *   3. result_pdf_share      — 결과 PDF 가 교사·관리자에게 공유됨
 *   4. retention_period      — 보관 기간 5년
 *
 * UX:
 *   - 4개 모두 체크되어야 onAllConsented(true) 호출.
 *   - 카피 한 문장이라도 바뀌면 G005 (US-2C-14) 3 위치 일관성도 함께 확인.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SIGNATURE_LEGAL_DISCLAIMER } from './signatureLegalCopy';

export type PrivacyConsentItemId =
  | 'legal_effect_disclaimer'
  | 'hash_storage'
  | 'result_pdf_share'
  | 'retention_period';

export interface PrivacyConsentItem {
  readonly id: PrivacyConsentItemId;
  readonly label: string;
  readonly detail: string;
}

export interface PrivacyConsentLogEntry {
  readonly id: PrivacyConsentItemId;
  readonly label: string;
  readonly checked: true;
  readonly at: string;
}

export interface PrivacyConsentTableProps {
  readonly disabled?: boolean;
  readonly onLogChange: (log: readonly PrivacyConsentLogEntry[] | null) => void;
  readonly now?: () => string;
}

/**
 * G005 (US-2C-14) 3 위치 공통 카피 — 단일 정의는 `./signatureLegalCopy`.
 * 본 export 는 기존 import 경로 호환을 위해 alias 로 유지.
 */
export const LEGAL_DISCLAIMER = SIGNATURE_LEGAL_DISCLAIMER;

export const PRIVACY_CONSENT_ITEMS: readonly PrivacyConsentItem[] = [
  {
    id: 'legal_effect_disclaimer',
    label: '법적 효력에 대한 안내를 확인했습니다',
    detail: LEGAL_DISCLAIMER,
  },
  {
    id: 'hash_storage',
    label: '식별자 비저장 정책에 동의합니다',
    detail:
      'IP 주소와 브라우저 정보는 원본 그대로 저장되지 않고, SHA-256 해시 형태로만 기록됩니다.',
  },
  {
    id: 'result_pdf_share',
    label: '결과 PDF 공유에 동의합니다',
    detail: '제가 입력한 서명은 결과 PDF 에 포함되어 선생님·관리자에게 공유될 수 있습니다.',
  },
  {
    id: 'retention_period',
    label: '5년 보관 기간에 동의합니다',
    detail: '서명 이미지와 동의 로그는 최대 5년간 보관된 뒤 자동 삭제됩니다.',
  },
] as const;

export function PrivacyConsentTable({
  disabled = false,
  onLogChange,
  now = () => new Date().toISOString(),
}: PrivacyConsentTableProps) {
  const [checkedAtById, setCheckedAtById] = useState<ReadonlyMap<PrivacyConsentItemId, string>>(
    () => new Map(),
  );

  // UltraQA Q5: onLogChange/now prop 이 매 render 새 함수일 수 있으므로 latest ref 보관.
  // useEffect deps 에 직접 넣으면 stable 한 부모도 매 render 마다 effect 실행되어
  // 무한 onLogChange 호출이 됨.
  const onLogChangeRef = useRef(onLogChange);
  const nowRef = useRef(now);
  useEffect(() => {
    onLogChangeRef.current = onLogChange;
    nowRef.current = now;
  });

  const allChecked = useMemo(
    () => PRIVACY_CONSENT_ITEMS.every((item) => checkedAtById.has(item.id)),
    [checkedAtById],
  );

  useEffect(() => {
    if (!allChecked) {
      onLogChangeRef.current(null);
      return;
    }
    // UltraQA Q5: entry.at 은 항목별 체크 시각을 보존 — 4개 동일 timestamp 회피.
    const log: readonly PrivacyConsentLogEntry[] = PRIVACY_CONSENT_ITEMS.map((item) => ({
      id: item.id,
      label: item.label,
      checked: true as const,
      at: checkedAtById.get(item.id) ?? nowRef.current(),
    }));
    onLogChangeRef.current(log);
  }, [allChecked, checkedAtById]);

  const handleToggle = useCallback((id: PrivacyConsentItemId) => {
    setCheckedAtById((prev) => {
      const next = new Map(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.set(id, nowRef.current());
      }
      return next;
    });
  }, []);

  return (
    <section
      aria-label="서명 제출 전 개인정보 동의"
      className="rounded-2xl border border-sp-border bg-sp-surface/60 p-4"
    >
      <header className="mb-2">
        <h2 className="text-sm font-sp-bold">동의 항목</h2>
        <p className="mt-1 text-xs leading-relaxed text-sp-muted">
          {LEGAL_DISCLAIMER}
          <br />
          아래 4개 항목에 모두 동의해야 서명을 제출할 수 있어요.
        </p>
      </header>
      <ul className="divide-y divide-sp-border/70">
        {PRIVACY_CONSENT_ITEMS.map((item) => {
          const checked = checkedAtById.has(item.id);
          return (
            <li key={item.id} className="py-2">
              <label className="flex cursor-pointer items-start gap-3 text-xs">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-sp-border"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => handleToggle(item.id)}
                  aria-describedby={`consent-detail-${item.id}`}
                />
                <span className="flex-1">
                  <span className="block font-sp-semibold text-sp-text">{item.label}</span>
                  <span
                    id={`consent-detail-${item.id}`}
                    className="mt-0.5 block leading-relaxed text-sp-muted"
                  >
                    {item.detail}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <p
        className={`mt-3 text-xs ${allChecked ? 'text-emerald-700' : 'text-amber-700'}`}
        role="status"
      >
        {allChecked
          ? '모든 항목에 동의했습니다. 서명을 제출할 수 있어요.'
          : `${checkedAtById.size}/4 항목 동의 — 나머지 항목도 확인 후 체크해 주세요.`}
      </p>
    </section>
  );
}
