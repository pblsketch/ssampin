import { create } from 'zustand';
import { generateUUID } from '@infrastructure/utils/uuid';

interface ToastData {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  action?: { label: string; onClick: () => void };
}

interface ToastState {
  toasts: ToastData[];
  /**
   * 토스트 노출.
   *
   * @param message 본문
   * @param type 아이콘·색 결정 (기본 'success')
   * @param action 우측 CTA — 액션 라벨과 클릭 핸들러
   * @param durationMs 자동 dismiss 까지 시간 (기본 3000ms). roster-sample-data-removal §3.8
   *   마이그레이션 안내처럼 사용자가 액션을 결정할 시간이 필요한 경우 5000ms로 사용.
   */
  show: (
    message: string,
    type?: 'success' | 'error' | 'info',
    action?: { label: string; onClick: () => void },
    durationMs?: number,
  ) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  show: (message, type = 'success', action, durationMs = 3000) => {
    const id = generateUUID();
    set((state) => ({
      toasts: [...state.toasts, { id, message, type, action }],
    }));
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, durationMs);
  },
  dismiss: (id) => {
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
  return (
    <div
      role="alert"
      aria-live="polite"
      className={`animate-slide-in-right flex items-center gap-3 border rounded-xl px-4 py-3 shadow-xl min-w-[320px] max-w-[400px] ${
        isInfo ? 'bg-slate-50 border-slate-300' : 'bg-sp-card border-sp-border'
      }`}
    >
      <span
        className={`material-symbols-outlined ${COLOR_MAP[toast.type]} text-white p-1 rounded-lg text-sm`}
      >
        {ICON_MAP[toast.type]}
      </span>
      <span className={`text-sm flex-1 ${isInfo ? 'text-slate-900' : 'text-sp-text'}`}>
        {toast.message}
      </span>
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
        className={`transition-colors ${
          isInfo ? 'text-slate-500 hover:text-slate-900' : 'text-sp-muted hover:text-sp-text'
        }`}
      >
        <span className="material-symbols-outlined text-base">close</span>
      </button>
    </div>
  );
}
