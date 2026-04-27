import { useCallback, useEffect, useState } from 'react';
import { useStickerStore } from '@adapters/stores/useStickerStore';
import { useToastStore, ToastContainer } from '@adapters/components/common/Toast';
import { useThemeApplier } from '@adapters/hooks/useThemeApplier';
import { StickerPicker } from './StickerPicker';
import './stickerElectronTypes';

const TOGGLE_COMMAND_ID = 'sticker-picker:toggle';
const SHOW_COMMAND_ID = 'sticker-picker:show';

/**
 * `?mode=stickerPicker` 윈도우의 루트 컴포넌트.
 *
 * - 마운트 시: useStickerStore.load() + body 투명 처리
 * - 단축키 IPC 수신: open ↔ close 토글
 * - 단축키 충돌 알림: 토스트 + 모달은 메인 앱에서 처리(여기선 토스트만)
 * - 닫힘: window.electronAPI.sticker.closePicker() (Electron이 hide)
 */
export function StickerPickerApp(): JSX.Element {
  useThemeApplier();
  const load = useStickerStore((s) => s.load);
  const [isOpen, setIsOpen] = useState(true);

  // 마운트 시 데이터 로드 + 투명 배경
  useEffect(() => {
    document.body.classList.add('ssampin-sticker-picker');
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    void load();
    return () => {
      document.body.classList.remove('ssampin-sticker-picker');
      document.documentElement.style.background = '';
      document.body.style.background = '';
    };
  }, [load]);

  // 글로벌 단축키 IPC 수신 — 토글
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onShortcutTriggered) return;
    return api.onShortcutTriggered((commandId: string) => {
      if (commandId === TOGGLE_COMMAND_ID) {
        setIsOpen((v) => !v);
      } else if (commandId === SHOW_COMMAND_ID) {
        setIsOpen(true);
      }
    });
  }, []);

  // 단축키 충돌 알림
  useEffect(() => {
    const api = window.electronAPI?.sticker;
    if (!api?.onShortcutConflict) return;
    return api.onShortcutConflict((combo) => {
      useToastStore
        .getState()
        .show(
          `단축키 ${combo}가 이미 사용 중이에요. 설정에서 변경해주세요.`,
          'error',
        );
    });
  }, []);

  // 메인 창의 관리 화면에서 metadata가 변경되면 store를 다시 로드한다.
  // (피커는 별도 BrowserWindow라 메모리 공유 X — broadcast로 동기화)
  useEffect(() => {
    const api = window.electronAPI?.sticker;
    if (!api?.onDataChanged) return;
    return api.onDataChanged(() => {
      useStickerStore.setState({ loaded: false });
      void useStickerStore.getState().load();
    });
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    // 살짝 딜레이 후 윈도우 hide (애니메이션 여유)
    const t = setTimeout(() => {
      void window.electronAPI?.sticker?.closePicker();
    }, 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="h-screen w-screen bg-transparent">
      <StickerPicker isOpen={isOpen} onClose={handleClose} />
      <ToastContainer />
    </div>
  );
}
