/**
 * 쌤핀 AI(무료) — 끝났다는 안내 카드 (ADR-142 결정 7, v2.5.6).
 *
 * ★예전에는 여기서 무료 쌤핀 AI(업스테이지 중계)를 켰다. 업스테이지 키 정지·모델 종료(2026-10-30)로 그 통로가
 *   멈췄고, 오너 결정으로 무료 경로를 없앴다. 이제 쌤핀 AI 는 선생님 구독(내 AI로 실행) 또는 내 API 키로만 답한다.
 * ★스위치를 그리지 않는다. 예전에 켜 둔 값은 앱을 켤 때 꺼진다(`useAssistStore` 의 merge).
 * ★설정 > 실험실 기능(`labs`) 탭 자리를 그대로 쓴다 — 예전 스위치를 찾는 선생님이 여기서 다음 길을 본다.
 */
export function InAppAssistCard() {
  return (
    <section className="rounded-xl border border-sp-border bg-sp-card p-4">
      <h3 className="text-sm font-sp-semibold text-sp-text">쌤핀 AI (무료) — 종료</h3>
      <p className="mt-1 text-sm text-sp-muted">
        쌤핀이 대신 비용을 내던 무료 쌤핀 AI 는 끝났어요. 이제 쌤핀 AI 패널과 생기부 초안은 선생님
        구독 AI(Claude Code·Codex)나 <strong className="text-sp-text">내 API 키</strong>로 답해요.
      </p>
      <p className="mt-2 text-sm text-sp-muted">
        설정 &gt; <strong className="text-sp-text">AI 연결</strong>에서 키를 넣거나 구독을 연결하면
        바로 쓸 수 있어요. 구글 계정만 있으면 무료로 시작할 수 있는 제미나이 키를 추천해요.
      </p>
    </section>
  );
}
