import { useState } from 'react';
import type { ConsentMode } from '@domain/valueObjects/ConsentMode';
import { CONSENT_MODE_LABELS } from '@domain/valueObjects/ConsentMode';

/**
 * PiiConsentModal — 학생 PII 저장 동의 3-way 선택 모달
 *
 * 첫 PII 입력 시 1회 표시. localStorage flag `pii_consent_v1`로 재표시 방지.
 *
 * **PIPA §15(2) 필수 4항목**:
 * 1. 수집·이용 목적 (좌석 배치 균형 알고리즘 입력값으로 사용)
 * 2. 항목 (성별, 학업성취도 A~E 5단계)
 * 3. 보유·이용 기간 (앱 사용 종료 시 또는 사용자 삭제 시까지; 잠금 해제 이력 1000건)
 * 4. 동의 거부권 + 불이익 (거부 가능, 거부 시 학력/성별 균형 토글 비활성, 기타 기능 무영향)
 *
 * 관련 ADR: docs/architecture/student-pii-adr-v1.2.md Decision 10 + §Legal Basis
 */
export interface PiiConsentModalProps {
  /** 모달 표시 여부 */
  readonly open: boolean;
  /** 사용자가 모드를 선택했을 때 호출. 모달 닫는 책임은 호출자. */
  readonly onSelect: (mode: ConsentMode) => void;
}

export function PiiConsentModal({ open, onSelect }: PiiConsentModalProps): React.ReactElement | null {
  const [selected, setSelected] = useState<ConsentMode | null>(null);

  if (!open) return null;

  const handleConfirm = () => {
    if (selected) onSelect(selected);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pii-consent-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-sp-border bg-sp-card p-6 shadow-2xl">
        <h2 id="pii-consent-title" className="mb-4 text-lg font-bold text-sp-text">
          민감 정보 입력 안내
        </h2>

        <div className="mb-4 space-y-3 text-sm text-sp-text">
          <p>
            쌤핀은 학생의 <strong className="text-sp-accent">성별</strong>과{' '}
            <strong className="text-sp-accent">학업성취도</strong>를 자리 배치·조 편성에
            활용할 수 있도록 저장 기능을 제공합니다.
          </p>

          <ul className="space-y-1 rounded-lg bg-sp-bg/60 p-3 text-xs text-sp-muted">
            <li>
              <strong className="text-sp-text">수집 목적</strong>: 좌석 배치 균형 알고리즘 입력값
            </li>
            <li>
              <strong className="text-sp-text">항목</strong>: 성별 (남/여/미지정), 학업성취도 (A~E)
            </li>
            <li>
              <strong className="text-sp-text">보유 기간</strong>: 앱 사용 종료 또는 사용자 삭제 시까지
              (잠금 해제 이력 1000건)
            </li>
            <li>
              <strong className="text-sp-text">외부 전송</strong>: 없음 (클라우드 동기화 시 자동 제외)
            </li>
            <li>
              <strong className="text-sp-text">동의 거부 시 불이익</strong>: 학력·성별 균형 토글
              비활성. 기타 기능에 영향 없음.
            </li>
          </ul>

          <p className="text-xs text-amber-400">
            ⚠️ 학생/학부모의 동의 하에 사용하시고, 화면 공유나 출력 시 노출에 유의해주세요.
          </p>
        </div>

        <div className="mb-4 space-y-2">
          {(['persisted', 'session-only', 'denied'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setSelected(mode)}
              className={`w-full rounded-lg border px-4 py-2 text-left text-sm transition-colors ${
                selected === mode
                  ? 'border-sp-accent bg-sp-accent/10 text-sp-text'
                  : 'border-sp-border bg-sp-bg/40 text-sp-muted hover:text-sp-text'
              }`}
              aria-pressed={selected === mode}
            >
              <div className="font-semibold">{CONSENT_MODE_LABELS[mode]}</div>
              <div className="mt-0.5 text-xs text-sp-muted">{describeMode(mode)}</div>
            </button>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={selected === null}
            className="rounded-lg bg-sp-accent px-4 py-2 text-sm font-medium text-white disabled:bg-sp-border disabled:text-sp-muted"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

function describeMode(mode: ConsentMode): string {
  switch (mode) {
    case 'persisted':
      return '본 컴퓨터에 영구 저장. 다음 실행 시에도 유지됩니다.';
    case 'session-only':
      return '이번 실행에서만 사용. 앱 종료 시 자동 삭제됩니다.';
    case 'denied':
      return '저장하지 않음. 학력·성별 균형 토글이 비활성화됩니다.';
  }
}
