import { create } from 'zustand';

interface ToastData {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  action?: { label: string; onClick: () => void };
}

interface ToastState {
  toasts: ToastData[];
  show: (
    message: string,
    type?: 'success' | 'error' | 'info',
    action?: { label: string; onClick: () => void },
  ) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  show: (message, type = 'success', action) => {
    const id = crypto.randomUUID();
    set((state) => ({
      toasts: [...state.toasts, { id, message, type, action }],
    }));
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, 3000);
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
    <div className='fixed bottom-6 right-6 z-50 flex flex-col gap-3'>
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastData; onDismiss: () => void }) {
  return (
    <div className='animate-slide-in-right flex items-center gap-3 bg-sp-card border border-sp-border rounded-xl px-4 py-3 shadow-xl min-w-[320px] max-w-[400px]'>
      <span
        className={`material-symbols-outlined ${COLOR_MAP[toast.type]} text-white p-1 rounded-lg text-sm`}
      >
        {ICON_MAP[toast.type]}
      </span>
      <span className='text-sp-text text-sm flex-1'>{toast.message}</span>
      {toast.action && (
        <button
          onClick={toast.action.onClick}
          className='text-sp-accent text-sm font-medium hover:underline shrink-0'
        >
          {toast.action.label}
        </button>
      )}
      <button onClick={onDismiss} className='text-sp-muted hover:text-white transition-colors'>
        <span className='material-symbols-outlined text-base'>close</span>
      </button>
    </div>
  );
}
