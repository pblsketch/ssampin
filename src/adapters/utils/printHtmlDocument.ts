/**
 * 임의의 HTML 문서를 인쇄한다.
 *
 * Electron 보안 가드가 `window.open('', '_blank')`을 차단하므로(electron/security-guards.ts)
 * 새 창을 여는 대신 화면에 보이지 않는 iframe에 문서를 써넣고 그 프레임만 인쇄한다.
 * 브라우저 환경에서도 동일하게 동작한다(새 창 팝업 차단에도 안전).
 *
 * @param html 완전한 HTML 문서 문자열(`<!doctype html>...`)
 */
export function printHtmlDocument(html: string): void {
  if (typeof document === 'undefined') return;

  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '0',
    height: '0',
    border: '0',
    visibility: 'hidden',
  });
  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  const frameDoc = frameWindow?.document;
  if (!frameWindow || !frameDoc) {
    iframe.remove();
    return;
  }

  const removeSoon = (delay: number) => {
    window.setTimeout(() => iframe.remove(), delay);
  };

  // 인쇄 다이얼로그가 닫히면 정리(폴백 타임아웃과 중복돼도 remove는 멱등).
  frameWindow.addEventListener?.('afterprint', () => removeSoon(200));

  let printed = false;
  const printOnce = () => {
    if (printed) return;
    printed = true;
    try {
      frameWindow.focus();
      frameWindow.print();
    } catch {
      /* 인쇄 실패는 조용히 무시 — iframe만 정리한다 */
    }
    // afterprint가 오지 않는 환경(일부 Electron)을 위한 정리 폴백.
    removeSoon(60_000);
  };

  frameDoc.open();
  frameDoc.write(html);
  frameDoc.close();

  // document.write 후 레이아웃·폰트 반영 여유를 두고 인쇄한다.
  window.setTimeout(printOnce, 250);
}
