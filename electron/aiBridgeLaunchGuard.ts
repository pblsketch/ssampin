/**
 * AI 연결(MCP 서버)용으로 띄우려던 실행이 일반 앱으로 떨어졌는지 가려낸다.
 *
 * 쌤핀은 AI 도구(Claude·Codex 등)에 "쌤핀 실행 파일 + ai-bridge/index.mjs" 를 MCP 서버 명령으로
 * 등록한다. 이때 환경변수 ELECTRON_RUN_AS_NODE=1 이 함께 넘어와야 실행 파일이 창 없는 노드로
 * 돈다. 그런데 일부 AI 도구는 등록된 환경변수를 넘기지 않고 명령만 실행한다. 그러면 같은 명령이
 * **평범한 쌤핀 실행**이 되어:
 *  - 쌤핀이 꺼져 있으면 앱이 통째로 켜지고,
 *  - 트레이에 있으면 "두 번째 실행"으로 처리돼 메인 창이 화면 위로 올라온다.
 * 선생님 눈에는 "GPT 를 쓰는데 쌤핀이 갑자기 나타난다"(2026-11-08·09 신고)로 보인다.
 *
 * 이 함수가 true 면 그 실행은 창을 띄우면 안 된다 — 어차피 창 있는 앱은 MCP 서버 구실을
 * 못 하므로 조용히 끝내는 것이 맞다. (환경변수가 제대로 넘어온 실행은 노드 모드라 main 이
 * 아예 돌지 않는다. 그래서 main 에서 이 인자를 봤다면 항상 "잘못 떨어진" 경우다.)
 */
const AI_BRIDGE_ENTRY = /(?:^|[\\/])ai-bridge[\\/]index\.mjs$/i;

export function isAiBridgeLaunch(argv: readonly string[]): boolean {
  return argv.some((arg) => AI_BRIDGE_ENTRY.test(arg.trim()));
}
