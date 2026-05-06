import { useEffect } from 'react';

/**
 * native-desktop / widget 진단 로그 listener (디버깅용 — G1 게이트 임시).
 *
 * Main process는 console.log를 stdout으로 보내기 때문에 packaged 빌드에서
 * cmd로 실행하지 않으면 사용자가 진단 흐름을 볼 수 없다. 이 hook은 main에서
 * IPC로 mirror된 동일 메시지를 DevTools 콘솔에 그대로 출력한다.
 *
 * - 사용자는 DevTools(Ctrl+Shift+I) 콘솔에서 `[native-desktop][diag]` 또는
 *   `[widget][diag]` 키워드로 필터해 흐름을 확인할 수 있다.
 * - 동일 메시지가 `app.getPath('userData')/native-desktop-diag.log`에도 기록된다
 *   (Windows: `C:\Users\<user>\AppData\Roaming\쌤핀\native-desktop-diag.log`).
 *
 * 비Electron 환경 또는 본 IPC가 없는 구버전 preload에서는 no-op.
 *
 * 본 hook은 App.tsx에서 한 번만 마운트한다 — IPC 발사가 모든 BrowserWindow에
 * 도달하기 때문에 위젯/메인 어느 쪽에서 마운트해도 동작한다.
 */
export function useNativeDesktopDiagListener(): void {
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onNativeDesktopDiag) return;

    const unsubscribe = api.onNativeDesktopDiag(({ message, args }) => {
      // main process가 직접 console.log한 것과 동일한 prefix 형태를 그대로 출력.
      // args는 객체/handle 등이므로 spread로 console에 넘겨 가독성 유지.
      if (args && args.length > 0) {
        // eslint-disable-next-line no-console
        console.log(message, ...args);
      } else {
        // eslint-disable-next-line no-console
        console.log(message);
      }
    });

    return unsubscribe;
  }, []);
}
