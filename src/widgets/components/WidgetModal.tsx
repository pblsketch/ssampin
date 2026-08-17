/**
 * WidgetModal — 위젯을 확장(상세) 모드로 열어 보여주는 모달.
 *
 * G001 Foundation (ralplan Step 1). 본 모달은 G004 PR-Core에서
 * WidgetCard 클릭 핸들러로 마운트된다.
 *
 * 핵심 동작:
 * - `createPortal`로 `document.body`에 렌더 → 위젯 그리드 transform/overflow 영향 차단
 * - backdrop 클릭 / ESC / ✕ 버튼 → `onAutoSave?` 실행 후 `onClose` (1초 룰: micro-edit는
 *   자동 저장)
 * - `requiresExplicitCancel === true`인 경우 명시적 "취소" 버튼 노출. 취소는 `onAutoSave`
 *   호출 없이 `onClose`만 수행 (학생 명단·자리배치·설문 등 파괴적 작업 보호)
 * - `useRegisterModal('WIDGET_EXPAND', isOpen, { onPreempt })`로 ModalCoordinator 큐 참가.
 *   상위 우선순위(SECURITY_UPDATE 등) 모달이 등록되면 자동 저장 후 닫힘 — AC20.
 * - PIN 보호 위젯(`PIN_FEATURE_MAP`에 정의된 ID)은 본체를 `DashboardPinGuard`로 감싼다.
 *
 * 키보드 / 접근성:
 * - `role="dialog"` + `aria-modal="true"` + `aria-label={definition.name}`
 * - 손수 만든 `useFocusTrap` (focus-trap-react 의존성 없이 ~30LoC)으로 Tab 사이클 제어
 * - `tabIndex={-1}` 본체 → 첫 포커스 가능 노드로 자동 이동
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useRegisterModal } from '@adapters/hooks/useRegisterModal';
import { DashboardPinGuard } from '@adapters/components/Dashboard/DashboardPinGuard';
import { useDesktopWidgetContextStore } from '@adapters/stores/useDesktopWidgetContextStore';
import { useFocusTrap } from '../utils/useFocusTrap';
import { PIN_FEATURE_MAP } from '../utils/pinFeatureMap';
import type { WidgetDefinition } from '../types';

/**
 * preload.ts 가 노출하는 ESC IPC API. 위젯 BrowserWindow 외 환경에선 undefined.
 * 안전한 optional chain 호출을 위해 타입 캐스팅.
 */
interface WidgetEscapeApi {
  requestModalEscape?: () => Promise<void> | void;
  releaseModalEscape?: () => Promise<void> | void;
  onModalEscape?: (cb: () => void) => () => void;
  requestModalInput?: () => Promise<void> | void;
  releaseModalInput?: () => Promise<void> | void;
}
function getEscapeApi(): WidgetEscapeApi | null {
  if (typeof window === 'undefined') return null;
  const api = (window as unknown as { electronAPI?: WidgetEscapeApi }).electronAPI;
  return api ?? null;
}

const EDITABLE_INPUT_SELECTOR =
  'input:not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable="true"]';

function isEditableModalTarget(
  target: EventTarget | null,
  modalRoot: HTMLDivElement | null,
): boolean {
  return getEditableModalTarget(target, modalRoot) !== null;
}

function getEditableModalTarget(
  target: EventTarget | null,
  modalRoot: HTMLDivElement | null,
): HTMLElement | null {
  if (!(target instanceof HTMLElement) || !modalRoot?.contains(target)) return null;
  if (target.isContentEditable) return target;
  const editable = target.closest<HTMLElement>(EDITABLE_INPUT_SELECTOR);
  if (!editable || !modalRoot.contains(editable)) return null;
  return editable;
}

export type WidgetModalSize = 'sm' | 'md' | 'lg' | 'fullscreen';

/**
 * 사이즈별 Tailwind 클래스 — Plan §Step 1 매핑 그대로.
 * fullscreen은 viewport 거의 전체를 차지 (max-width 제약 해제).
 */
const SIZE_CLASS: Record<WidgetModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  fullscreen: 'w-screen h-screen max-w-none',
};

export interface WidgetModalProps {
  /** 위젯 인스턴스 ID — PIN 매핑 및 data-attribute 추적에 사용 */
  widgetId: string;
  /** 위젯 정의 — 제목/아이콘 표시 */
  definition: WidgetDefinition;
  /** 표시 여부. false → null 반환 */
  isOpen: boolean;
  /** backdrop / ESC / ✕ / preempt / 명시 취소 공통 종료 콜백 */
  onClose: () => void;
  /** 본문 사이즈 */
  size: WidgetModalSize;
  /** 본문 — `<definition.component isCompactMode={false} />` 등 */
  children: ReactNode;
  /**
   * 자동 저장 콜백.
   * - backdrop / ESC / ✕ / preempt 경로에서 `onClose` 직전에 호출.
   * - 비동기 가능. 내부에서 try/catch — 실패해도 `onClose`는 항상 실행 (AC20 데이터 손실 방지).
   * - `requiresExplicitCancel=true`인 경우 "취소" 버튼에서는 호출하지 않는다.
   */
  onAutoSave?: () => Promise<void> | void;
  /**
   * true면 "취소" 버튼을 노출하고, backdrop/ESC/✕ 자동 닫기에도 onAutoSave를 호출하지 않는다.
   * — 파괴적 작업 보호: 학생 등록, 자리배치, 설문 작성, 상담 일정 등.
   */
  requiresExplicitCancel?: boolean;
  /**
   * AC4: 다른 카드를 클릭했을 때 이 모달이 이미 열려 있음을 알리는 flash 트리거.
   * 값이 0이 아닌 숫자로 변경될 때마다 600ms animate-pulse 효과 적용.
   */
  flashKey?: number;
  /**
   * G009: 데스크톱 위젯 BrowserWindow 읽기 전용 모드.
   * true 시 본문을 `<fieldset disabled>`로 감싸 상호작용 비활성화하고
   * "이 위젯은 메인 앱에서 편집하세요" 배너를 헤더 아래 고정 노출.
   * WidgetSettingsPanel(📋/🎨 패널)에는 적용하지 않는다 — 항상 쓰기 모드 유지.
   * default: false
   */
  readOnly?: boolean;
}

/**
 * `onAutoSave` → `onClose` 직렬화 핸들러. backdrop / ESC / ✕ / preempt 공통.
 *
 * 동기·비동기 모두 안전:
 *   - `onAutoSave`가 sync throw → catch에서 흡수 → onClose 실행
 *   - `onAutoSave`가 async reject → catch에서 흡수 → onClose 실행
 *   - `onAutoSave`가 undefined → onClose 즉시 실행
 *
 * 테스트 용이성을 위해 별도 export.
 */
export function createSaveAndClose(
  onAutoSave: (() => Promise<void> | void) | undefined,
  onClose: () => void,
): () => void {
  return () => {
    Promise.resolve()
      .then(() => onAutoSave?.())
      .catch(() => {
        /* onAutoSave 실패는 흡수 — onClose는 항상 수행 */
      })
      .finally(() => onClose());
  };
}

export function WidgetModal({
  widgetId,
  definition,
  isOpen,
  onClose,
  size,
  children,
  onAutoSave,
  requiresExplicitCancel = false,
  flashKey = 0,
  readOnly = false,
}: WidgetModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const modalInputRequestedRef = useRef(false);
  const isDesktopWidget = useDesktopWidgetContextStore((s) => s.isDesktopWidget);

  // saveAndClose는 매 렌더 새로 생성하되, 캡처된 props는 호출 시점 값.
  // 클래스 메소드 형태가 아니므로 ref 패턴은 불필요.
  // readOnly 모드에서는 onAutoSave를 건너뛰고 onClose만 호출 (저장할 편집이 없음).
  const saveAndClose = readOnly ? onClose : createSaveAndClose(onAutoSave, onClose);

  // ModalCoordinator 등록 — head가 빼앗기면(상위 우선순위 모달 도착) 자동 저장+닫기.
  const isHead = useRegisterModal('WIDGET_EXPAND', isOpen, {
    onPreempt: () => {
      // onPreempt 시점에는 closure 안의 saveAndClose가 stale일 수 있어 직접 구성.
      createSaveAndClose(onAutoSave, onClose)();
    },
  });

  // Focus trap — head이면서 열려 있을 때만 활성화.
  useFocusTrap(modalRef, isOpen && isHead);

  // 마운트 직후 모달 본체에 명시적 focus + window.focus().
  // 위젯 모드(Electron 데스크톱 위젯 BrowserWindow)에서 카드 클릭 시 본문에 focus 가 안 가서
  // window/document 의 keydown 이 도달하지 않는 회귀(2026-05-23)를 차단한다.
  // readOnly 인 경우 useFocusTrap 이 첫 포커스 가능 노드를 못 찾으므로(fieldset disabled)
  // modalRef 본체에 직접 focus 를 옮긴다.
  useEffect(() => {
    if (!isOpen || !isHead) return;
    // 한 tick 뒤에 focus — portal mount 완료 후
    const t = setTimeout(() => {
      try {
        window.focus();
      } catch {
        /* 일부 환경에서 focus()가 throw — 무시 */
      }
      modalRef.current?.focus();
    }, 0);
    return () => clearTimeout(t);
  }, [isOpen, isHead]);

  // ESC 키 처리. document + window 양쪽에 capture 단계로 등록 — 위젯 모드에서
  // 어떤 노드에 focus 가 있어도 잡히도록 강화.
  useEffect(() => {
    if (!isOpen || !isHead) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        saveAndClose();
      }
    }
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
    // saveAndClose는 props 캡처라 의존성 추가 시 매 렌더 재구독. props 변화 잡기 위해 의도.
  }, [isOpen, isHead, saveAndClose]);

  useEffect(() => {
    if (!isOpen || !isHead || !isDesktopWidget) return;
    const api = getEscapeApi();
    if (!api?.requestModalInput || !api.releaseModalInput) return;

    const requestInputMode = (focusTarget?: HTMLElement) => {
      let request: Promise<void>;
      if (modalInputRequestedRef.current) {
        request = Promise.resolve();
      } else {
        modalInputRequestedRef.current = true;
        request = Promise.resolve(api.requestModalInput?.()).then(() => undefined);
      }

      if (focusTarget) {
        void request.finally(() => {
          if (!isEditableModalTarget(focusTarget, modalRef.current)) return;
          focusTarget.focus({ preventScroll: true });
        });
      }
    };

    const releaseInputMode = () => {
      if (!modalInputRequestedRef.current) return;
      modalInputRequestedRef.current = false;
      void api.releaseModalInput?.();
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (isEditableModalTarget(event.target, modalRef.current)) {
        requestInputMode();
      }
    };

    const handleEditablePointerDown = (event: Event) => {
      const editableTarget = getEditableModalTarget(event.target, modalRef.current);
      if (editableTarget) {
        requestInputMode(editableTarget);
      }
    };

    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('pointerdown', handleEditablePointerDown, true);
    document.addEventListener('mousedown', handleEditablePointerDown, true);

    if (isEditableModalTarget(document.activeElement, modalRef.current)) {
      requestInputMode();
    }

    return () => {
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('pointerdown', handleEditablePointerDown, true);
      document.removeEventListener('mousedown', handleEditablePointerDown, true);
      releaseInputMode();
    };
  }, [isOpen, isHead, isDesktopWidget]);

  const saveAndCloseRef = useRef(saveAndClose);
  saveAndCloseRef.current = saveAndClose;

  // native-desktop 모드(WS_CHILD) 폴백: 위젯이 keyboard focus 를 못 받아 renderer
  // keydown 이 안 잡히는 경우 main 의 globalShortcut('Escape')로 ESC 신호 수신.
  // 모달 닫히면 즉시 release 해서 다른 앱의 ESC 정상 복구.
  useEffect(() => {
    if (!isOpen || !isHead || !isDesktopWidget) return;
    const api = getEscapeApi();
    if (!api?.requestModalEscape || !api.onModalEscape || !api.releaseModalEscape) return;
    void api.requestModalEscape();
    const unsub = api.onModalEscape(() => {
      saveAndCloseRef.current();
    });
    return () => {
      void api.releaseModalEscape?.();
      unsub?.();
    };
  }, [isOpen, isHead, isDesktopWidget]);

  if (!isOpen || !isHead) return null;

  const pinFeature = PIN_FEATURE_MAP[widgetId];

  const bodyContents = (
    <>
      <header className="flex items-center justify-between px-5 py-3 border-b border-sp-border/60">
        <h2 className="text-base font-bold text-sp-text inline-flex items-center gap-1.5">
          <span
            className="material-symbols-outlined text-sp-accent"
            aria-hidden="true"
            style={{ fontSize: 18 }}
          >
            {definition.icon}
          </span>
          {definition.name}
        </h2>
        <button
          type="button"
          aria-label="닫기"
          data-widget-modal-close
          onClick={(e) => {
            e.stopPropagation();
            saveAndClose();
          }}
          className="min-w-6 min-h-6 w-7 h-7 inline-flex items-center justify-center rounded-md text-sp-muted hover:bg-sp-border/30 hover:text-sp-text transition-colors"
        >
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 18 }}>
            close
          </span>
        </button>
      </header>

      {/* G009: 읽기 전용 배너 — 데스크톱 위젯 BrowserWindow에서만 노출 */}
      {readOnly && (
        <div
          data-widget-modal-readonly-banner
          className="flex items-center gap-2 px-4 py-2 bg-sp-highlight/10 border-b border-sp-highlight/30"
        >
          <span
            className="material-symbols-outlined text-sp-highlight flex-shrink-0"
            aria-hidden="true"
            style={{ fontSize: 16 }}
          >
            info
          </span>
          <p className="text-xs text-sp-highlight font-medium">이 위젯은 메인 앱에서 편집하세요</p>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-auto widget-scroll p-4">
        {readOnly ? (
          /* G009: fieldset disabled → 브라우저 네이티브 폼 컨트롤 일괄 비활성화 */
          <fieldset disabled data-widget-modal-readonly-body className="border-0 p-0 m-0 min-w-0">
            {pinFeature ? (
              <DashboardPinGuard feature={pinFeature}>{children}</DashboardPinGuard>
            ) : (
              children
            )}
          </fieldset>
        ) : pinFeature ? (
          <DashboardPinGuard feature={pinFeature}>{children}</DashboardPinGuard>
        ) : (
          children
        )}
      </div>

      {/* readOnly 모드에서는 취소 버튼 숨김 — 편집이 없으므로 취소 불필요 */}
      {requiresExplicitCancel && !readOnly && (
        <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-sp-border/60 bg-sp-bg/40">
          <button
            type="button"
            data-widget-modal-cancel
            onClick={(e) => {
              e.stopPropagation();
              // 명시 취소 — onAutoSave 호출하지 않는다.
              onClose();
            }}
            className="min-h-6 px-3 py-1.5 text-sm rounded-md border border-sp-border text-sp-text hover:bg-sp-border/30 transition-colors"
          >
            취소
          </button>
        </footer>
      )}
    </>
  );

  const overlay = (
    <div
      className="fixed inset-0 z-sp-modal flex items-center justify-center bg-black/60 backdrop-blur-sm motion-reduce:backdrop-blur-none px-4"
      data-widget-modal-backdrop
      data-widget-id={widgetId}
      onMouseDown={(e) => {
        // backdrop 자체를 mousedown한 경우에만 닫기.
        // 본체에서 드래그 시작해 backdrop으로 빠져나오는 경우(텍스트 선택 등) 닫힘 방지.
        if (e.target === e.currentTarget) {
          saveAndClose();
        }
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={definition.name}
        tabIndex={-1}
        data-widget-modal-body
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        className={[
          'relative bg-sp-card border border-sp-border rounded-xl shadow-sp-lg ring-1 ring-white/5',
          'overflow-hidden flex flex-col w-full',
          SIZE_CLASS[size],
          size !== 'fullscreen' ? 'max-h-[calc(100vh-48px)]' : '',
          'animate-scale-in motion-reduce:animate-none',
          flashKey !== 0 ? 'animate-pulse' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {bodyContents}
      </div>
    </div>
  );

  // SSR / 테스트 환경에서 document 없을 때는 inline 렌더 (renderToString 호환).
  if (typeof document === 'undefined') {
    return overlay;
  }
  return createPortal(overlay, document.body);
}
