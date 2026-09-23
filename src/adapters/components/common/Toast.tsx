import { create } from 'zustand';
import { generateUUID } from '@infrastructure/utils/uuid';
import { CheerPin } from '@adapters/components/Dashboard/ObservationCheer/CheerPin';
import type { PinLook } from '@domain/rules/schoolMoments';

interface ToastData {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'cheer';
  action?: { label: string; onClick: () => void };
  /** 'cheer' 토스트의 핀 동작(ADR-135) — 첫 기록은 손 흔들기, 한 바퀴는 만세, 먼저 거는 말은 가만히. */
  pinState?: 'idle' | 'wave' | 'celebrate';
  /** 달력 인사 날의 핀 모습 */
  look?: PinLook | null;
  /** 토스트 전체를 누르면 할 일(ADR-137 먼저 거는 말 — 한 주 정리·학기 돌아보기 열기). */
  onClick?: () => void;
}

interface ToastState {
  toasts: ToastData[];
  /**
   * 토스트 노출.
   *
   * @param message 본문
   * @param type 아이콘·색 결정 (기본 'success')
   * @param action 우측 CTA — 액션 라벨과 클릭 핸들러
   * @param durationMs 자동 dismiss 까지 시간 (기본 3000ms, **단추가 있으면 8000ms**). roster-sample-data-removal §3.8
   *   ★단추가 달린 안내(「근거 정리에서 보기」·「첨부 다시 시도」)는 읽고 누를 시간이 있어야 한다 — 3초는 관찰 3건을
   *     연달아 저장하는 동안 사라져 눌러 볼 수 없었다(전 과정 검증 2026-09-11).
   *   마이그레이션 안내처럼 사용자가 액션을 결정할 시간이 필요한 경우 5000ms로 사용.
   */
  show: (
    message: string,
    type?: 'success' | 'error' | 'info',
    action?: { label: string; onClick: () => void },
    durationMs?: number,
  ) => void;
  dismiss: (id: string) => void;
  /**
   * 관찰 기록 응원(ADR-135) — 핀이 짧게 말을 건다. 단추 없이 4초.
   * 일반 `show` 의 인자 순서를 바꾸지 않으려고 따로 둔다.
   * 먼저 거는 말(ADR-137)은 `onClick` 을 넘긴다 — 토스트 전체가 눌리고 6초 남는다.
   */
  showCheer: (
    message: string,
    pinState: 'idle' | 'wave' | 'celebrate',
    onClick?: () => void,
    /** 달력 인사 날의 핀 모습(돌아보기 spec 4-5) */
    look?: PinLook | null,
  ) => void;
}

const dismissTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  show: (message, type = 'success', action, durationMs) => {
    const ms = durationMs ?? (action ? 8000 : 3000);
    const id = generateUUID();
    set((state) => ({
      toasts: [...state.toasts, { id, message, type, action }],
    }));
    const timer = setTimeout(() => {
      dismissTimers.delete(id);
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, ms);
    dismissTimers.set(id, timer);
  },
  showCheer: (message, pinState, onClick, look) => {
    const id = generateUUID();
    set((state) => ({
      toasts: [
        ...state.toasts,
        {
          id,
          message,
          type: 'cheer',
          pinState,
          ...(onClick !== undefined ? { onClick } : {}),
          ...(look !== undefined && look !== null ? { look } : {}),
        },
      ],
    }));
    const timer = setTimeout(
      () => {
        dismissTimers.delete(id);
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
      },
      onClick !== undefined ? 6000 : 4000,
    );
    dismissTimers.set(id, timer);
  },
  dismiss: (id) => {
    const timer = dismissTimers.get(id);
    if (timer !== undefined) clearTimeout(timer);
    dismissTimers.delete(id);
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));

const ICON_MAP = {
  success: 'check_circle',
  error: 'error',
  info: 'info',
} as const;

const COLOR_MAP = {
  success: 'bg-green-600',
  error: 'bg-red-600',
  info: 'bg-sp-accent',
} as const;

export function ToastContainer() {
  const { toasts, dismiss } = useToastStore();

  return (
    <div className="fixed bottom-6 right-6 z-sp-toast flex flex-col gap-3">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastData; onDismiss: () => void }) {
  // info 토스트는 사용자 환경 테마(따뜻한 베이지 등)에서 본문이 노란 톤으로 흐려져 가독성이
  // 떨어지는 보고가 있어 명시 라이트 카드 + 검정 계열 텍스트로 fix(사용자 환경 무관 일관).
  // success/error 토스트는 기존 dark 디자인 그대로 유지.
  const isInfo = toast.type === 'info';
  const onClick = toast.onClick;
  const icon =
    toast.type === 'cheer' ? (
      <CheerPin state={toast.pinState ?? 'wave'} size={28} look={toast.look ?? null} />
    ) : (
      <span
        className={`material-symbols-outlined ${COLOR_MAP[toast.type]} text-white p-1 rounded-lg text-sm`}
      >
        {ICON_MAP[toast.type]}
      </span>
    );
  const message = (
    <span className={`text-sm flex-1 ${isInfo ? 'text-slate-900' : 'text-sp-text'}`}>
      {toast.message}
    </span>
  );
  return (
    <div
      role="alert"
      aria-live="polite"
      className={`animate-slide-in-right motion-reduce:animate-none flex items-center gap-3 border rounded-xl px-4 py-3 shadow-xl min-w-[320px] max-w-[400px] ${
        isInfo ? 'bg-slate-50 border-slate-300' : 'bg-sp-card border-sp-border'
      } ${onClick !== undefined ? 'hover:border-sp-accent' : ''}`}
    >
      {onClick !== undefined ? (
        // 누를 수 있는 토스트(먼저 거는 말) — 핀과 문구가 한 단추다. 닫기 단추와 겹치지 않게 나란히 둔다.
        <button
          type="button"
          onClick={() => {
            onClick();
            onDismiss();
          }}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          {icon}
          {message}
        </button>
      ) : (
        <>
          {icon}
          {message}
        </>
      )}
      {toast.action && (
        <button
          onClick={toast.action.onClick}
          className={`text-sm font-medium hover:underline shrink-0 ${
            isInfo ? 'text-blue-700' : 'text-sp-accent'
          }`}
        >
          {toast.action.label}
        </button>
      )}
      <button
        onClick={onDismiss}
        aria-label="닫기"
        className={`transition-colors ${
          isInfo ? 'text-slate-500 hover:text-slate-900' : 'text-sp-muted hover:text-sp-text'
        }`}
      >
        <span className="material-symbols-outlined text-base">close</span>
      </button>
    </div>
  );
}
