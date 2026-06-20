# W0 — AI 브릿지 live-sync 쓰기 인프라 (본체측)

상태: **인프라 구축·헤드리스 검증 완료 / "앱 켜둔 채 보존" 실증 + 배선 + W1 브릿지측은 남음**
날짜: 2026-06-20 · 위치: 본체 `E:/github/ssampin` (브릿지 무수정 — W1 에서 연결)
근거 계획: 브릿지 `docs/plan-domain-expansion-livesync.md` (codex APPROVE)

## 결정 (하이브리드 확정)

외부 AI 가 일정·할일을 **쌤핀 실행 중에도 안전하게** 쓰려면:

- **앱 실행 중** → 본체 main 의 **127.0.0.1 loopback 제어 서버**가 받아 **렌더러 store 액션으로 위임** →
  메모리 상태에 반영 → `data:write`→`data:changed`→리로드. 렌더러의 다음 저장이 덮어쓰지 않는다.
- **앱 닫힘(확정)** → 브릿지가 기존 직접 파일쓰기(write.ts, CAS+백업)로 폴백.
- **앱 실행 의심(불확실)** → 직접쓰기 **거부**(fail-closed).

직접쓰기 단독(a)은 실행 중 데이터 손실, 앱경유 단독(b)은 닫힘 시 불가 → **(c) 하이브리드**가 두 상태를 커버.

## 이번에 구축·검증한 것 (헤드리스)

신규 파일(추가만, 기존 파일 무수정):

- `electron/ipc/aiBridgeLiveSyncCore.ts` — 순수 로직(electron 비의존, 단위 테스트):
  - `generateControlToken` / `control.json`(port·token·pid·heartbeat) write·read·remove
  - `isHeartbeatFresh`(앱 생존 신선도, fail-closed) / `capability.json`(allowWrite·allowContent) read·write(없으면 OFF)
  - `authorizeWriteRequest`(POST + 토큰 상수시간비교 + Origin 거부) / `validateApplyWrite`(todos·events × create/update/complete/delete + 멱등키 + create 필수필드)
- `electron/ipc/aiBridgeLiveSync.ts` — 127.0.0.1 loopback 서버: 인증→검증→`applyWrite` 델리게이트 위임, body 64KB 캡, heartbeat 주기 기록, stop 시 control.json 제거.
- `*.test.ts` 2종 — **27 테스트 통과**: 실제 http 왕복으로 401/403/405/400/409/200 + control.json 라이프사이클까지(Electron 없이).

게이트: 신규 4파일 lint 통과 · regression-check 35/35 · 27 신규 테스트 통과.

## codex 원검토 4 BLOCKING 대응 상태

1. **앱닫힘 직접쓰기 레이스** → control.json 의 pid+heartbeat 신선도(`isHeartbeatFresh`)로 "확정 미실행"만 직접쓰기, 불확실 시 거부(브릿지측 W1 에서 사용). ✓ 코어 준비.
2. **다중창 위임 모호** → 위임은 main 이 단일 창에 보내도록 배선 예정(applyWrite 델리게이트 1곳). 코어/서버는 델리게이트 1개만 호출. ✓ 계약 확정.
3. **capability 게이트(env 대체)** → `capability.json` read/write 코어 완비(설정이 기록, 브릿지가 매호출 read). ✓ 코어 준비.
4. **공유 멱등성** → `idempotencyKey` 검증 코어 완비(앱경유·직접쓰기 공유 저장 예정). ✓ 계약 확정.

## 남은 작업

### A. 배선 ✅ 구현 완료 (라이브 실행 검증만 남음)

- `electron/ipc/aiBridgeLiveSyncHost.ts`(신규): 서버 수명 + 단일 메인 창 위임(`applyWrite`) + 멱등성 인메모리
  dedup + ipcMain 토글(`aiBridge:setLiveSync`)·상태(`aiBridge:liveSyncStatus`)·결과회신(`aiBridge:apply-write-result`).
  **서버는 capability.allowWrite 가 켜진 경우에만 시작(기본 OFF → 완전 무동작).**
- `electron/main.ts`: `registerLiveSyncHost({ getMainWindow:()=>mainWindow, dataDir })` 1줄 + will-quit 정리.
- `electron/preload.ts`: `aiBridge.onApplyWrite/setLiveSync/liveSyncStatus` 노출. `src/global.d.ts` 타입.
- `src/usecases/aiBridge/applyLiveSyncWrite.ts`(+test 9): 검증된 쓰기 → store 액션 매핑(순수, 단위테스트).
- `src/adapters/hooks/useAiBridgeLiveSync.ts` + `App.tsx`: 메인 창에서 수신 핸들러 등록 → todos/events store 적용.
- 검증: usecase 9 + W0 27 테스트 통과, src tsc 0(내 파일), electron tsc 신규 에러 0, lint·regression 35/35.
- 남음: **Settings 'AI 연결' 카드의 쓰기 토글 UI**(현재는 `aiBridge.setLiveSync(true)` IPC 로만 on).

### B. 라이브 실증(준일님 앱 실행) — 테스트 방법

1. 쌤핀 실행 → DevTools 콘솔에서 `await window.electronAPI.aiBridge.setLiveSync(true)` (또는 추후 설정 토글).
   → `%APPDATA%/쌤핀/data/.ssampin-aibridge/control.json` 생성 확인(port·token·pid·heartbeat).
2. control.json 의 port·token 으로 loopback 에 POST(예: curl 또는 W1 의 create_todo):
   `POST http://127.0.0.1:<port>/  header x-ssampin-token:<token>  body {"domain":"todos","op":"create","idempotencyKey":"t1","data":{"text":"테스트 할일"}}`
   → ① 할일 목록에 **즉시** 등장 ② 직후 다른 저장(예: 메모 수정)에도 보존(덮어쓰기 0) 확인.
3. `setLiveSync(false)` → control.json 제거 + 서버 정지 확인.

- 쌤핀 켠 상태에서 loopback 에 todo create POST → ① 목록 즉시 등장 ② 직후 다른 저장에도 보존(덮어쓰기 0) ③ 충돌·롤백.
- 앱 닫힘 → 직접쓰기 폴백 / 실행 의심 → 거부.

### C. W1 브릿지측 (현재 다른 세션이 write.ts/tools.ts/server.ts 편집 중 → 그 후)

- 브릿지 write client: control.json 읽어 pid 생존+heartbeat 신선 → loopback POST, 아니면 직접쓰기 폴백(fail-closed).
- capability 매호출 read(env 대체). 공유 idempotency.json.
- 신규 MCP 도구: `create_todo`/`complete_todo`(W1a) → `update/delete`·events(W1b, 반복·종일·타임존 명시).
