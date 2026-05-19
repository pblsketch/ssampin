import { useRef, useState } from 'react';
import { Modal } from './Modal';
import { Notice } from './Notice';

/**
 * 학생들에게 보일 위험을 고지하는 1회성 안내 모달의 localStorage 키.
 * 전역 단위 — 3 도구 어디서든 처음 ON 시 1회 안내 후 다시 안 뜸.
 */
export const REALTIME_RESPONSE_WARN_KEY = 'ssampin-realtime-response-toggle-warned-v1';

export type RealtimeResponseToolKind = 'poll' | 'survey' | 'multiSurvey';

export type ToggleGateDecision = 'show-warning' | 'apply-immediately' | 'noop';

/**
 * 순수 함수 — 토글 클릭 시 다음 동작을 결정한다.
 *
 * - 현재 OFF → ON 시도이고 사용자가 사전에 경고를 본 적 없으면 'show-warning'
 * - 현재 OFF → ON 시도이고 이미 경고를 봤으면 'apply-immediately'
 * - 현재 ON → OFF 는 언제나 'apply-immediately' (경고 X)
 * - 그 외 동일 값 시도는 'noop'
 */
export function decideToggleAction(
  current: boolean,
  next: boolean,
  hasWarned: boolean,
): ToggleGateDecision {
  if (current === next) return 'noop';
  if (next && !hasWarned) return 'show-warning';
  return 'apply-immediately';
}

interface RealtimeResponseToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** 도구별 미세 카피 차이 */
  tool: RealtimeResponseToolKind;
  disabled?: boolean;
}

const TOOL_DESCRIPTIONS: Record<RealtimeResponseToolKind, string> = {
  poll: '학생 투표가 들어오는 즉시 화면에 표시됩니다. 라이브 시작 시 결과 막대가 처음부터 노출됩니다.',
  survey: '학생 답변이 도착하는 즉시 교사 화면에 표시됩니다.',
  multiSurvey:
    '학생 답변이 도착하는 즉시 라이브 화면에 표시됩니다. 객관식은 막대, 주관식은 텍스트로 누적됩니다.',
};

export function RealtimeResponseToggle({
  checked,
  onChange,
  tool,
  disabled = false,
}: RealtimeResponseToggleProps) {
  const [showWarning, setShowWarning] = useState(false);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  const handleClick = () => {
    if (disabled) return;
    const next = !checked;
    const hasWarned = readWarnedFlag();
    const decision = decideToggleAction(checked, next, hasWarned);
    if (decision === 'show-warning') {
      setShowWarning(true);
      return;
    }
    if (decision === 'apply-immediately') {
      onChange(next);
    }
  };

  const handleConfirmWarning = () => {
    writeWarnedFlag();
    onChange(true);
    setShowWarning(false);
  };

  const handleCancelWarning = () => {
    setShowWarning(false);
    // 토글은 OFF 유지 — onChange 호출하지 않음
  };

  return (
    <>
      <div className="bg-sp-card border border-sp-border rounded-xl p-4 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sp-text font-medium text-sm">실시간 답변 확인</p>
          <p className="text-sp-muted text-xs mt-1 leading-relaxed">
            {TOOL_DESCRIPTIONS[tool]}
            <br />
            <span className="text-amber-400/80">
              ⚠ 학생들에게 화면이 보이지 않는 별도 모니터에서 사용하세요.
            </span>
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label="실시간 답변 확인 토글"
          disabled={disabled}
          onClick={handleClick}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
            disabled ? 'opacity-50 cursor-not-allowed' : ''
          } ${checked ? 'bg-sp-accent' : 'bg-sp-surface'}`}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full bg-white border border-gray-300 transition-transform ${
              checked ? 'translate-x-[22px]' : 'translate-x-[2px]'
            }`}
          />
        </button>
      </div>

      <Modal
        isOpen={showWarning}
        onClose={handleCancelWarning}
        title="실시간 답변 확인 — 시작 전 확인"
        size="md"
        initialFocusRef={confirmButtonRef}
      >
        <div className="p-6 flex flex-col gap-4">
          <h2 className="text-sp-text font-bold text-lg">실시간 답변 확인 — 시작 전 확인</h2>

          <p className="text-sp-text text-sm leading-relaxed">
            이 옵션을 켜면 학생 답변이 도착하는 즉시 교사 화면에 표시됩니다.
          </p>

          <Notice variant="warning" size="md">
            학생들이 화면을 볼 수 있는 환경(프로젝터 · 교실 TV 공유 화면)에서는 권장하지 않아요.
            다른 학생 답변이 보이면 공정한 응답이 어려워질 수 있어요.
          </Notice>

          <div className="text-sp-muted text-xs leading-relaxed">
            <p className="font-medium text-sp-text mb-1">권장 환경</p>
            <ul className="list-disc ml-4 space-y-0.5">
              <li>별도 모니터 (교사 PC만 보임)</li>
              <li>화면 공유를 일시 끔</li>
              <li>브레인스토밍 · 아이스브레이커처럼 답변 공유가 의도된 활동</li>
            </ul>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleCancelWarning}
              className="px-4 py-2 rounded-xl bg-sp-card border border-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-all text-sm font-medium"
            >
              취소
            </button>
            <button
              ref={confirmButtonRef}
              type="button"
              onClick={handleConfirmWarning}
              className="px-4 py-2 rounded-xl bg-sp-accent text-white font-bold hover:bg-sp-accent/80 transition-all text-sm"
            >
              확인하고 켜기
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function readWarnedFlag(): boolean {
  try {
    return localStorage.getItem(REALTIME_RESPONSE_WARN_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeWarnedFlag(): void {
  try {
    localStorage.setItem(REALTIME_RESPONSE_WARN_KEY, 'true');
  } catch {
    // localStorage 사용 불가 환경 — 다음 세션에 다시 안내 모달이 뜨더라도 안전.
  }
}
