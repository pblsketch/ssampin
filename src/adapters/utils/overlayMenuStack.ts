/**
 * 위젯 확장 창(`WidgetModal`) 위에 문서 끝(`document.body`)으로 띄운 작은 메뉴의 닫기 목록.
 *
 * 확장 창은 Esc 를 창 전체(window, 잡기 단계)에서 먼저 받아 스스로 닫는다. 그 위에 뜬 메뉴는
 * 그보다 먼저 Esc 를 받을 길이 없어서, Esc 한 번에 메뉴가 아니라 확장 창이 통째로 닫혔다.
 * 그래서 메뉴는 열릴 때 여기에 자기 닫기를 올려 두고, 확장 창은 Esc 를 받으면 **맨 위 메뉴부터**
 * 닫는다(ADR-135 반 카드 칸 메뉴). 바탕화면 위젯 창의 Esc 대체 경로(메인 프로세스 단축키)도 같다.
 */
const stack: (() => void)[] = [];

/** 메뉴를 올린다. 돌려받은 함수로 내린다(여러 번 불러도 된다). */
export function pushOverlayMenu(close: () => void): () => void {
  stack.push(close);
  return () => {
    const i = stack.lastIndexOf(close);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** 맨 위 메뉴를 닫는다. 닫을 메뉴가 있었으면 true. */
export function closeTopOverlayMenu(): boolean {
  const close = stack.pop();
  if (close === undefined) return false;
  close();
  return true;
}
