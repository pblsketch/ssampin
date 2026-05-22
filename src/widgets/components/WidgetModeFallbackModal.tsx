import { Modal } from '@adapters/components/common/Modal';
import { useRegisterModal } from '@adapters/hooks/useRegisterModal';

/**
 * widget-mode-discovery (v2.1.x~) — native-desktop 모드 적용 실패 시 진단 모달.
 *
 * 헤더 모드 칩이 fallback 상태일 때 사용자가 클릭하면 표시된다. desktopMode:fallback IPC의
 * reason을 친절한 한국어로 해설 + 시도 가능한 해결책 + "다시 시도" 버튼 + 진단 로그
 * 안내(파일 경로 + 클립보드 복사 가능).
 *
 * reason 알려진 값(electron/desktopWidgetTypes.ts 참고):
 *   - 'platform-not-win32'        : 비-Windows OS — native-desktop 자체 불가
 *   - 'koffi-load-failed'         : koffi 네이티브 모듈 로드 실패 (AV/권한)
 *   - 'koffi-pid-mismatch'        : FFI 검증 실패 — 매우 드뭄
 *   - 'native-load-failed'        : win32 native 모듈 require 실패
 *   - 'widget-hwnd-failed'        : Electron BrowserWindow HWND 추출 실패
 *   - 'workerw-not-found'         : Explorer WorkerW 윈도우 못 찾음
 *   - 'workerw-not-found-or-rejected' : 모든 STRATEGY 시도 실패
 *   - 'workerw-stale'             : 한 번 붙었다가 Explorer 재시작 등으로 깨짐
 *   - 'widget-destroyed'          : 위젯 창이 destroy됨
 */

interface WidgetModeFallbackModalProps {
  readonly isOpen: boolean;
  readonly reason: string;
  readonly fallbackMode: 'normal' | 'topmost';
  readonly onClose: () => void;
  readonly onRetry: () => void;
}

interface DiagnosisEntry {
  readonly title: string;
  readonly description: string;
  readonly hints: readonly string[];
}

const DIAG: Record<string, DiagnosisEntry> = {
  'platform-not-win32': {
    title: '이 기능은 Windows 전용이에요',
    description: 'macOS/Linux에서는 Explorer 바탕화면 계층이 없어 사용할 수 없어요.',
    hints: ['Windows PC에서 다시 시도해 주세요.'],
  },
  'koffi-load-failed': {
    title: '보안 프로그램이 네이티브 모듈 로딩을 막은 것 같아요',
    description:
      '안티바이러스/EDR(V3, AhnLab, 백신, 보안센터 등)이 koffi 모듈을 차단했을 수 있어요.',
    hints: [
      '보안 프로그램의 예외 목록에 쌤핀(ssampin.exe)을 추가해 주세요.',
      '쌤핀을 재시작한 뒤 다시 시도해 주세요.',
      '관리자 권한으로 실행하면 해결되는 경우도 있어요.',
    ],
  },
  'native-load-failed': {
    title: '네이티브 모듈을 불러올 수 없어요',
    description: 'win32 plug-in이 손상되었거나 설치되지 않았어요.',
    hints: ['쌤핀을 최신 버전으로 업데이트 해주세요.', '재설치하면 대부분 해결돼요.'],
  },
  'koffi-pid-mismatch': {
    title: '시스템 호출 검증에 실패했어요',
    description: '매우 드물게 발생하는 문제로, 쌤핀 재시작이면 보통 해결돼요.',
    hints: ['쌤핀을 완전히 종료하고 다시 실행해 주세요.'],
  },
  'widget-hwnd-failed': {
    title: '위젯 창 정보를 가져오지 못했어요',
    description: '위젯 모드 초기화 중 일시적인 문제가 있었어요.',
    hints: ['위젯을 닫았다가 다시 열어 보세요.'],
  },
  'workerw-not-found': {
    title: '바탕화면 작업판을 찾지 못했어요',
    description: '윈도우 탐색기(explorer.exe)가 비정상 상태일 수 있어요.',
    hints: [
      'Win+E로 파일 탐색기를 한 번 열어 보세요.',
      '작업관리자에서 explorer.exe를 다시 시작한 뒤 시도해 주세요.',
    ],
  },
  'workerw-not-found-or-rejected': {
    title: '바탕화면에 위젯을 깔지 못했어요',
    description:
      '다중 모니터, Windows 24H2 변경, 또는 일부 데스크톱 커스터마이즈 도구와 충돌 가능성이 있어요.',
    hints: [
      'Wallpaper Engine 등 바탕화면 도구를 일시 종료하고 시도해 주세요.',
      '주 모니터에서 먼저 시도해 보세요.',
      '문제가 지속되면 진단 로그를 첨부해 제보해 주세요.',
    ],
  },
  'workerw-stale': {
    title: '바탕화면 연결이 끊어졌어요',
    description: 'Explorer가 재시작되었거나 잠금 화면에서 돌아온 후 종종 발생해요.',
    hints: ['"다시 시도"를 눌러 재연결해 주세요.'],
  },
  'widget-destroyed': {
    title: '위젯 창이 닫혔어요',
    description: '위젯 창이 다시 열리지 않은 상태예요.',
    hints: ['트레이 아이콘 또는 메뉴에서 위젯을 다시 열어 주세요.'],
  },
};

function diagFor(reason: string): DiagnosisEntry {
  return (
    DIAG[reason] ?? {
      title: '바탕화면 모드를 적용하지 못했어요',
      description: `알 수 없는 사유로 적용에 실패했어요 (코드: ${reason}).`,
      hints: [
        '쌤핀을 재시작 후 다시 시도해 주세요.',
        '문제가 지속되면 진단 로그를 첨부해 제보해 주세요.',
      ],
    }
  );
}

export function WidgetModeFallbackModal({
  isOpen,
  reason,
  fallbackMode,
  onClose,
  onRetry,
}: WidgetModeFallbackModalProps): JSX.Element | null {
  // ModalCoordinator 큐 등록 — 다른 알림(EventPopup, UpdateNotification 등)과 동시
  // 발생 시 우선순위에 따라 직렬화. WIDGET_MODE_FALLBACK은 사용자 결정 필요한
  // 에러이므로 일반 알림보다 위(2.5).
  const isHead = useRegisterModal('WIDGET_MODE_FALLBACK', isOpen);
  const diag = diagFor(reason);

  if (!isHead) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={diag.title} size="md">
      <div className="px-6 pb-6 space-y-4" data-testid="widget-mode-fallback-modal">
        <div className="flex items-start gap-3">
          <span
            className="material-symbols-outlined text-amber-400 flex-shrink-0"
            style={{ fontSize: 24 }}
          >
            warning
          </span>
          <p className="text-sm text-sp-text leading-relaxed">{diag.description}</p>
        </div>

        <div className="rounded-lg bg-sp-surface/50 border border-sp-border/50 p-3">
          <p className="text-xs font-semibold text-sp-text mb-2">이렇게 해결해 보세요</p>
          <ol className="space-y-1.5 list-decimal list-inside">
            {diag.hints.map((hint, i) => (
              <li key={i} className="text-xs text-sp-muted leading-relaxed">
                {hint}
              </li>
            ))}
          </ol>
        </div>

        <div className="text-[11px] text-sp-muted leading-relaxed">
          현재는 "{fallbackMode === 'topmost' ? '항상 위에' : '일반'}" 모드로 동작 중이에요. 진단
          로그는{' '}
          <code className="px-1 py-0.5 bg-sp-surface rounded text-[10px]">
            %APPDATA%\ssampin\native-desktop-diag.log
          </code>
          에서 확인할 수 있어요.
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg text-sm text-sp-muted hover:bg-sp-text/5"
            onClick={onClose}
          >
            닫기
          </button>
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg text-sm bg-sp-accent text-white hover:bg-sp-accent/90"
            onClick={() => {
              onRetry();
              onClose();
            }}
            data-testid="widget-mode-fallback-retry"
          >
            다시 시도
          </button>
        </div>
      </div>
    </Modal>
  );
}
