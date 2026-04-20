---
template: qa-checklist
feature: collab-board
date: 2026-04-20
author: pblsketch
source: Design §8.2 + Plan §6 검증 기준 + 실기기 QA 관습
status: pre-run (Step 8 수동 테스트용)
---

# 쌤핀 협업 보드 — 실기기 통합 테스트 체크리스트

> **목적**: Phase 1a MVP 출시 전 실기기(교사 PC + 스마트폰/태블릿 5~10대) 환경에서 Design §8.2 수락 기준을 검증한다.
>
> **운영 방식**: 각 항목을 순서대로 수행 + 결과 기록. 실패 항목은 "증상"·"로그"·"스크린샷"을 동반해 이슈 티켓 또는 PR 댓글로 남긴다.
>
> **전제 조건**
> - 쌤핀 v1.12.0-beta 빌드 (feature/collab-board 브랜치)
> - `npm run electron:dev` 또는 `electron-builder` packaged 빌드
> - cloudflared 바이너리 최초 설치는 자동 다운로드 (~40MB)
> - 학생 기기: iPhone·Android·iPad·크롬북·Windows 노트북 중 최소 3종
> - 무선: 교실 WiFi + 모바일 데이터 양쪽 시나리오

---

## 0. 사전 확인 (Pre-Flight)

- [ ] `npm run dev` 또는 `electron:dev` 기동 성공, Electron DevTools에서 에러 없음
- [ ] `window.electronAPI.collabBoard` 객체 존재 확인 (`console.log(window.electronAPI?.collabBoard)`)
- [ ] 기존 5개 라이브 도구(투표/설문/워드클라우드/토론/멀티설문) 정상 진입 — 회귀 없음
- [ ] 쌤도구 그리드에 "🎨 협업 보드" 카드 존재 확인

### 로그 수집 준비

| 위치 | 방법 | 용도 |
|------|------|------|
| Electron DevTools Console (렌더러) | 창 우클릭 → 검사 | React/Zustand/IPC 송수신 |
| Electron main process stdout | 터미널에서 `npm run electron:dev` 콘솔 | ws·http·cloudflared·Y.js 에러 |
| cloudflared stderr | `tunnel.ts:53` 수집분이 main stdout에 섞임 | 터널 연결 실패 진단 |
| 학생 브라우저 DevTools | Safari/Chrome 원격 디버깅 | CDN 로드 실패·WebSocket close code |

---

## 1. Happy Path (Design §8.2 Must)

### 1.1 보드 생성 → 세션 시작 → QR 스캔 → 드로잉 → 종료 → 재진입

| # | 단계 | 기대 결과 | 측정 방법 |
|---|------|----------|----------|
| 1.1.1 | 쌤도구 → 협업 보드 진입 | 좌측 빈 목록 + 우측 "좌측에서 보드를 선택..." 안내 | 시각 |
| 1.1.2 | "+ 새 보드" 클릭 | "협업 보드 1" 생성, 자동 선택, 우측에 "보드 시작" 버튼 노출 | 시각 |
| 1.1.3 | "보드 시작" 클릭 | **5초 이내** QR 카드 + 세션 코드 + URL 표시 | 스톱워치 |
| 1.1.4 | 학생 기기 1로 QR 스캔 | 이름 입력 모달 → Excalidraw 로드 완료 **3G 5초 / WiFi 2초 이내** | DevTools Network Slow 3G 시뮬 or 실측 |
| 1.1.5 | 학생이 "민수" 입력 후 입장 | 교사 UI "접속자" 패널에 "민수" 칩 1개 + 카운트 1 표시 | 시각 (1초 이내 반영) |
| 1.1.6 | 학생이 펜으로 원·선 그리기 | 교사 PC의 Excalidraw 뷰포트에 **200ms 이내** 반영 | Chrome DevTools Performance 또는 체감 |
| 1.1.7 | 30초 대기 | "마지막 자동 저장" 문구가 "방금" 또는 "N초 전"으로 갱신됨 | 시각 |
| 1.1.8 | "종료" 클릭 | 세션 패널 사라짐, 학생 브라우저는 "연결 끊김" 뱃지 + 재연결 시도 | 시각 |
| 1.1.9 | Electron 앱 재시작 후 동일 보드 선택 | "보드 시작" 눌렀을 때 이전 드로잉 복원 | 시각 |

---

## 2. 인증 / 접근 제어 (FR-07, §7.1)

### 2.1 잘못된 토큰으로 접속 시도

```bash
# 세션 실행 중 교사 콘솔에서 authToken·sessionCode 추출 후 조작
# 학생 브라우저에서 직접 다음 URL 열기:
#   https://xxx.trycloudflare.com?t=0000000000000000000000000000000a&code=MK7P2Q
```

- [ ] **기대**: 브라우저에 "연결할 수 없습니다" 오버레이
- [ ] **근거**: `verifyJoinCredentials` 실패 → WebSocket close 1008
- [ ] **추가 검증**: Electron main stdout에 IP/UA 로그 **없음** (PIPA §7.2)

### 2.2 잘못된 세션 코드

- [ ] URL은 맞지만 `code=XXXXXX` 오입력 → 1008 overlay
- [ ] 코드 대소문자 불일치 (`mk7p2q` 소문자) → 실패 (alphabet이 대문자만 허용)

### 2.3 세션 종료 후 재접속

- [ ] 교사가 "종료" 클릭 → 학생 브라우저 "연결 끊김 — 재연결 시도 중…"
- [ ] 60초 이상 지속된 후 교사가 같은 보드 재시작 → **새로운 토큰/코드 발급**. 이전 URL로 접속 시 1008
- [ ] **근거**: `StartBoardSession`이 매번 `crypto.randomBytes(16)` + `generateSessionCode()`

---

## 3. 터널 상호 배타 (Plan R2 / FR-06)

### 3.1 보드 실행 중 다른 도구 차단 (UX 레벨)

- [ ] 보드 실행 중인 상태에서 쌤도구 메뉴 → "투표 (tool-poll)" 진입
- [ ] **기대 (Phase 1a)**: 투표 도구 진입 가능하나 "시작" 버튼 눌렀을 때 기존 터널이 파괴됨 (알려진 한계, Design §2.4 주석 참조)
- [ ] 보드 UI의 SessionPanel에 `BOARD_TUNNEL_EXIT` 에러 배너 노출
- [ ] **Phase 2+ 개선 예정**: ToolPoll 등 기존 도구 진입 버튼에 `useBoardSessionStore.selectIsBoardRunning` 참조하여 비활성화

### 3.2 다른 도구 실행 중 보드 차단 (서버 레벨)

- [ ] 투표 도구 "시작" 먼저 → 보드 진입 → "보드 시작" 클릭
- [ ] **기대**: `BOARD_TUNNEL_BUSY` Toast + 세션 시작 거부
- [ ] **근거**: `BoardTunnelCoordinator.acquire()` → `TunnelBusyError`

---

## 4. 자동 저장 / 복구 (FR-09, R6, §3.2-bis)

### 4.1 30초 주기 자동 저장

- [ ] 세션 시작 후 학생 1명 드로잉 → 30초 이상 대기
- [ ] **기대**: "마지막 자동 저장" 문구가 갱신됨
- [ ] **측정**: `%APPDATA%/Electron/data/boards/{boardId}.ybin` 파일 수정 시각 변경 (Windows)
- [ ] 드로잉 없으면 dirty=false → 저장 호출 없음 (디스크 쓰기 로그 확인)

### 4.2 교사 수동 저장

- [ ] "지금 저장" 클릭 → 즉시 저장 → "저장 완료" 토스트 + `lastSavedAt` 갱신

### 4.3 강제 종료 복구

- [ ] 세션 실행 중 학생 드로잉 → 약 15초 경과 (자동 저장 전)
- [ ] Task Manager로 쌤핀 프로세스 강제 종료 (Kill)
- [ ] 재시작 → 동일 보드 열기 → **before-quit 동기 저장분**이 복원되어야 함
- [ ] **근거**: `endActiveBoardSessionSync` + `BoardFilePersistence.saveSnapshotSync` (via async repo call, 2초 deadline)
- [ ] **알려진 약점**: 현재 sync 저장은 async repo 호출을 void로 쓰므로 이벤트 루프 통과 필요 — 완전한 sync는 Step 8 개선 대상

---

## 5. 참여자 관리 (FR-08, §2.3)

### 5.1 이름 중복 처리

- [ ] 학생 A "민수" 입장 → 학생 B 동일 이름 "민수" 입장
- [ ] **기대**: 학생 B의 awareness user.name이 서버에서 정규화되어 "민수(2)" 로 표시
- [ ] **참고**: 클라이언트는 입력 그대로 제출. 서버 `sanitizeParticipantName`은 형식만 검증, **중복 회피는 Phase 1a에선 클라이언트 awareness API 역할**
- [ ] (Phase 2+): 서버가 nextAvailableName 적용한 이름을 awareness state에 주입하도록 개선

### 5.2 빈/제로폭 이름 거부

- [ ] 이름 입력 빈칸 → "이름을 입력해주세요" 인라인 에러
- [ ] 공백만 / 제로폭 문자만 → 거부
- [ ] **근거**: `sanitize()` 함수 (generateBoardHTML 내부 + domain boardRules)

### 5.3 접속자 실시간 업데이트

- [ ] 학생 1명 입장 → 1초 내 교사 UI 칩 등장
- [ ] 학생이 브라우저 탭 닫기 → 1~2초 내 칩 사라짐
- [ ] **근거**: YDocBoardServer `awarenessPoll` 1초 주기 + `onParticipantsChange` IPC

---

## 6. 인원 제한 (MAX_PARTICIPANTS = 50)

- [ ] 시뮬레이션: 학생 기기로 반복 접속 → **50명 초과 시**
- [ ] **기대**: 51번째 접속 시 WebSocket close 1013 + 학생 브라우저 "접속 인원 초과" overlay
- [ ] 교사 UI ParticipantList에 90% 도달 시 amber 경고 배너
- [ ] **실측 힌트**: 실기기 10대로는 도달 불가. 가능하면 Node 스크립트로 49개 fake WebSocket 클라이언트 병렬 접속 후 1개 초과 시도

---

## 7. Heartbeat (FR-11, Plan R3)

- [ ] 세션 시작 후 교사 PC에서 학생 기기로 드로잉 없는 상태로 **60초 유휴**
- [ ] **기대**: 학생 WebSocket 연결 유지 (연결 끊김 뱃지 뜨지 않음)
- [ ] **근거**: `YDocBoardServer.heartbeatTimer` 25초 주기 `ws.ping()` → cloudflared idle timeout 방어
- [ ] **실패 시 증상**: 30~40초 경과 후 학생 브라우저 "재연결 시도 중…" 반복

---

## 8. 터널 끊김 감지 (BOARD_TUNNEL_EXIT)

- [ ] 세션 실행 중 cloudflared 프로세스 외부에서 강제 kill
- [ ] **기대**: 교사 UI에 `BOARD_TUNNEL_EXIT` 빨간 배너 + 활성 세션 자동 초기화
- [ ] **현재 한계**: `subscribeExit` no-op이라 **감지 안 됨** (Design Diff #5, Phase 2+에서 tunnel.ts 수정 후 연결)
- [ ] **임시 우회**: 학생 측 재연결 지수 백오프 로그로 끊김 추정

---

## 9. CDN Fallback (Plan R7)

- [ ] hosts 파일에 `127.0.0.1 esm.sh` 추가 → esm.sh 접근 차단
- [ ] 학생 브라우저에서 접속 → 초기 로드 실패
- [ ] **현재 한계**: CDN fallback **미구현** (Design Diff D-2). Step 7+ 개선 대상
- [ ] **증상**: 학생 브라우저가 빈 화면 + DevTools에 import 에러

---

## 10. 회귀 (기존 5개 라이브 도구 영향 없음)

각 도구를 1회씩 실행 + 학생 1명 접속까지 돌려본다.

- [ ] `tool-poll` (객관식 설문) — QR → 학생 응답 → 결과 집계
- [ ] `tool-survey` (주관식 설문) — 동일
- [ ] `tool-multi-survey` (복합 설문) — stepMode 포함 동작
- [ ] `tool-wordcloud` (워드클라우드) — 응답 단어 표시
- [ ] `tool-traffic-discussion` (신호등 토론)
- [ ] **기대**: 모든 도구 기존 그대로 동작 (협업 보드 추가로 인한 부작용 0)
- [ ] 특히 `tunnel.ts`의 `openTunnel/closeTunnel` 시그니처 무변경 확인

---

## 11. 성능 벤치 (FR-05, Design §8.2)

### 11.1 지연 측정 (p50 ≤ 200ms / p95 ≤ 500ms)

시뮬레이션 스크립트 (Step 8 구현 예정, 본 체크리스트에선 가이드만):

```bash
# 로컬 3PC 시뮬레이션 예:
# - 교사 PC 1대에 2~3개 Chrome 프로파일을 띄워 학생으로 위장
# - 각 "학생"이 초당 10회 random rectangle 추가
# - Y.Doc observer에서 performance.now()로 전파 지연 측정
```

- [ ] p50 ≤ 200ms
- [ ] p95 ≤ 500ms
- [ ] 30명 동시 접속 시 교사 PC CPU < 60% / 메모리 < 500MB

### 11.2 초기 로드 (학생 첫 접속)

- [ ] Chrome DevTools Network → Slow 3G 에뮬레이션
- [ ] Excalidraw 캔버스 보일 때까지 **≤ 5초**
- [ ] WiFi 환경 **≤ 2초**

---

## 12. Undo 동작 (Design §8.2 A-5)

- [ ] 학생 A가 원 그리기
- [ ] 학생 B가 사각형 그리기
- [ ] 학생 A가 Ctrl+Z
- [ ] **기대**: 학생 A의 원만 사라짐, 학생 B의 사각형은 유지
- [ ] **근거**: y-excalidraw `undoManager` 옵션 **생략**됨 (spike S1 검증 버그 회피). Excalidraw 기본 undo 동작만 활성화 → 자기 것만 undo
- [ ] **대안 동작 시나리오**: 만약 전체 canvas undo가 발생한다면 Phase 2에서 CRDT-aware undo 재설계 필요

---

## 13. before-quit 동기 저장 (Design §3.2-bis)

- [ ] 세션 실행 중 학생 드로잉 → 10~20초 경과 (자동 저장 전)
- [ ] Electron 창 X 버튼 (또는 cmd+Q)
- [ ] **기대**: 종료 지연 없이(2초 이내) 앱 종료
- [ ] 재시작 → 같은 보드 열기 → 드로잉 복원
- [ ] **현재 한계**: sync 경로가 async repo 호출이라 완벽한 동기 아님. 실패 시 `BoardFilePersistence.saveSnapshotSync` 직접 노출 + `endActiveBoardSessionSync` 수정 필요

---

## 에러 코드 해석표

| 코드 | 메시지 | 원인 | 조치 |
|------|--------|------|------|
| `BOARD_TUNNEL_BUSY:<existing>` | 다른 도구 사용 중 | 투표/설문 등 다른 터널 점유 | UI에서 그 도구 먼저 종료 |
| `BOARD_TUNNEL_TIMEOUT` | 터널 연결 30초 초과 | 인터넷 불안정 / cloudflared 응답 없음 | 재시도 / VPN·방화벽 점검 |
| `BOARD_TUNNEL_EXIT:<reason>` | 터널 비정상 종료 | cloudflared 프로세스 죽음 | 로그(reason) 확인 후 세션 재시작 |
| `BOARD_NOT_FOUND` | 보드 없음 | 잘못된 id / 삭제된 보드 | 목록 새로고침 |
| `BOARD_SESSION_ALREADY_RUNNING` | 이미 실행 중 | 동일 보드 중복 start 호출 | `get-active-session` 조회 후 UI 동기화 |
| `BOARD_SERVER_LISTEN_FAILED` | 포트 할당 실패 | OS/방화벽 제약 | 방화벽 허용 / 재시도 |
| `BOARD_PERSISTENCE_FAILED:<err>` | 저장 실패 | 디스크 풀 / 권한 | `%APPDATA%/Electron/data/boards` 확인 |
| `BOARD_QR_FAILED:<err>` | QR 생성 실패 | `qrcode` lib 에러 (매우 드묾) | 세션 재시작 |
| Close **1008** | 인증 실패 | 학생 URL 토큰/코드 불일치 | QR 다시 스캔 |
| Close **1013** | 인원 초과 | 50명 한도 | 다른 학생이 나갈 때까지 대기 |

---

## 체크리스트 합격 기준

Phase 1a MVP 릴리즈 판정은 다음과 같다.

### Must (합격 필수)
- 섹션 1 (Happy Path) 1.1.1 ~ 1.1.9 **전부 PASS**
- 섹션 2 (인증) 2.1, 2.2 **전부 PASS**
- 섹션 3.2 (서버 레벨 상호 배타) **PASS**
- 섹션 4.1, 4.2 (자동/수동 저장) **PASS**
- 섹션 5.2, 5.3 (이름 거부·실시간 접속자) **PASS**
- 섹션 7 (heartbeat) **PASS** — 실패 시 교실 현장 사용 불가
- 섹션 10 (회귀) **전부 PASS**

### Should (권장)
- 섹션 3.1 (UI 레벨 배타 배너), 4.3 (강제 종료 복구), 5.1 (이름 중복), 11.2 (WiFi 초기 로드), 13 (before-quit)

### 알려진 유예
- 섹션 6 (50명 초과) — 실기기 도달 어려움. Node 스크립트 시뮬로 대체
- 섹션 8 (터널 끊김 감지) — 현재 no-op, Phase 2에서 tunnel.ts 개선 후 검증
- 섹션 9 (CDN fallback) — Phase 1b/Phase 2에서 구현
- 섹션 11.1 (p50/p95 지연) — 정식 로드 테스트 도구 미구축. Step 8에서 간이 스크립트로 보강
- 섹션 12 (Undo 상세) — Phase 2에서 y-excalidraw 업스트림 PR 후 재검증

---

## 결과 기록 템플릿

```markdown
## 테스트 실행 #1 — YYYY-MM-DD

- **빌드**: commit `ac49ce1` (또는 packaged v1.12.0-beta)
- **환경**: 교사 PC (Windows 11, Wi-Fi), 학생 기기 N대
- **실행자**: (이름)

| 섹션 | 결과 | 비고 |
|------|:----:|------|
| 1. Happy Path | PASS / FAIL | ... |
| 2. 인증 | PASS / FAIL | ... |
| ... | ... | ... |

### 발견된 이슈
1. (제목) — 재현 절차 → 기대 → 실제 → 로그
2. ...

### 권고
- Step 9 진입 가능 / 수정 후 재테스트 필요
```

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-20 | Design §8.2 기반 13 섹션 체크리스트 초안. 에러 코드 해석표 + 합격 기준 | pblsketch |
