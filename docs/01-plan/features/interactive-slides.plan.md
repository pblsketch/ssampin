# Plan: Interactive Slides (인터랙티브 슬라이드)

> 쌤도구에 Pear Deck 스타일 인터랙티브 슬라이드 도구 추가
> 최근 검토: **2026-05-10 v2** — 아키텍처 / 보안 / UX / QA 4인 팀 리뷰 반영 (변경 이력은 문서 끝 참조)

## 1. 개요

### 목표
교사가 Google Slides URL을 연결하거나 PDF를 업로드하면, **슬라이드 위에** 투표/텍스트/드로잉 등 인터랙티브 활동(이하 "활동"; 내부 기술 용어는 `Overlay`)을 추가하고, 학생 화면을 실시간 동기화하여 수업을 진행할 수 있는 도구.

### 핵심 가치
- **기존 슬라이드 그대로 사용** — Google Slides URL만 붙여넣거나 PDF 업로드 (OAuth 불필요, 공유 설정만)
- **슬라이드 위 활동** — 별도 화면 이동 없이 현재 슬라이드 위에서 바로 응답
- **학생 화면 제어** — 교사가 넘기면 학생도 따라감 (교사 진행 모드 / Instructor-Paced)
- **하이브리드 소스** — Google Slides (공유 뷰어 설정만으로 연동, OAuth 불필요) / PDF 모두 지원
- **한국 시장 차별화** — Pear Deck급 도구가 부재 (교내망/오프라인 대응 가능)

### 타겟 유저
- 중·고등학교 교사 (이미 Google Slides 또는 PPT로 수업하는 교사)
- 학생 (스마트폰 브라우저, **계정 가입·로그인 불필요** — 이름만 입력)

### Pear Deck 대비 차별점
- **OAuth 로그인 불필요** — 슬라이드 공유 "뷰어" 설정만으로 바로 연동
- Google 계정 없이 PDF만으로도 사용 가능 (하이브리드)
- 오프라인/교내망 환경 동작 (로컬 WS 서버 + LAN 모드)
- Phase 2에서 학생 자율 모드 (Student-Paced) 추가 예정

---

## 2. 기능 요구사항

### Phase 1 — MVP (핵심)

| ID | 기능 | 설명 | 우선순위 |
|----|------|------|---------|
| F1 | 슬라이드 소스 연결 | Google Slides URL 입력 또는 PDF 업로드 → 페이지별 이미지로 변환 | P0 |
| F1-1 | Google Slides → 이미지 | 공유 "뷰어" + API 키로 Slides API 호출 → 슬라이드별 PNG 캐시. **API 키는 메인 프로세스에서만 보유**, 렌더러는 IPC로 호출. **revisionId 기반 캐시 무효화**, 30분 단명 contentUrl을 즉시 다운로드해 file:// 경로로 사용. 로딩 UX: 스켈레톤 + 진행률 (현재/전체) | P0 |
| F1-2 | PDF → 이미지 | PDF.js로 페이지별 canvas 렌더링 → 이미지 캐시. **현재 `PdfCanvasPreview`는 1페이지 전용** → N페이지 루프 + lazy 렌더 + 100페이지/50MB 상한 신규 구현 | P0 |
| F2 | 슬라이드 뷰어 (교사) | 이미지 기반 슬라이드 표시 + 이전/다음 (키보드 ←/→ 지원) | P0 |
| F3 | 슬라이드별 활동 배치 | 각 슬라이드 위에 활동(투표/텍스트/드로잉) 추가. **활동별 자동 활성화 토글** (per-overlay) — 슬라이드 진입 시 자동 시작 옵션. **Phase 1은 슬라이드당 동시 활성 1개로 제한** (배치는 여러 개 가능) | P0 |
| F3-1 | 활동 영역 + 편집 정책 | 교사가 드래그로 영역 지정. **활성화 전 확인 다이얼로그** ("시작하면 설정을 바꿀 수 없어요"). **닫고 새로 만들기 = 위치/크기/타입 자동 복제** (텍스트만 재편집) | P0 |
| F4 | 세션 생성 & 참여코드 | 세션 이름 입력 + **6자 영숫자 대문자 코드** (charset `ACDEFGHJKLMNPQRTUVWXY3479` ≈244M 조합) + QR. **접속 모드는 설정에서 영속** (LAN 기본/터널). LAN 모드: `http://{localIP}:{port}` 직접 접속 + 방화벽 첫 실행 가이드 토스트 | P0 |
| F5 | 학생 참여 화면 | 코드 → 이름 → (세션 status에 따라 로비 / 자동 합류) → 슬라이드 + 활동. 활동 없는 슬라이드 = 단순 이미지 (교사/학생 동일) | P0 |
| F6 | 실시간 슬라이드 동기화 | 교사가 넘기면 모든 학생 자동 이동. 재접속 시 `late-join-state`로 즉시 복원 (현재 슬라이드 + 활성 활동 + **닫힌 활동 목록** + myResponses[]) | P0 |
| F7 | 실시간 응답 집계 + 공개 모드 | 학생 응답 즉시 집계 → 교사 화면 표시. **공개 모드 3단계**: 비공개 / 익명 집계 (기본) / 전체 공개. 활동별 저장 | P0 |
| F8 | 교사 대시보드 (진행 중) | 실시간 응답 현황 + 학생 접속 상태 (`student-presence-changed` 활용) | P1 |
| F8-2 | 수업 종료 & 결과 요약 | "수업 종료" → 학생 종료 화면 + 교사 결과 리포트. **세션 종료 시 자동 익명화** (실명 → "학생1, 학생2...", 매핑 테이블 별도) | P1 |
| F8-3 | 과거 세션 결과 조회 | 같은 수업의 이전 세션 결과 (반별 비교). **기본 보존 180일** + 즉시 삭제 버튼 + GDrive 백업 제외 | P1 |

### Phase 1 인수 기준 (P0 출시 차단 게이트)

**F1 슬라이드 소스 연결**
- Google Slides 공개 URL 붙여넣기 → 10초 이내 첫 슬라이드 렌더
- 비공개 URL → 가이드 모달 (공유 설정 안내 + URL 복사 + "PDF로 시작" 대안)
- 빈 프레젠테이션(0장) → 에러 + 에디터 진입 차단
- 캐시는 앱 재시작 후에도 유지 (file:// 영구 경로)

**F1-1 Google Slides 이미지**
- 프로그레스 바 "N/전체" 형식, fetch 완료마다 증가
- API 키 미설정 → 설정 안내 다이얼로그
- 503/429 응답 → 재시도 1회 후 PDF 대안 제시
- revisionId 변경 감지 → "슬라이드가 변경되었어요" 토스트 + 캐시 자동 갱신

**F1-2 PDF 이미지**
- 50MB 초과 → 거부 ("페이지 줄이거나 품질 낮춰 다시 시도")
- 100페이지 초과 → 경고 후 사용자 확인으로 진행
- 암호화 PDF → "지원하지 않습니다" 안내
- 실패 페이지 → 회색 스켈레톤 + 인라인 "다시 시도"

**F2 슬라이드 뷰어**
- 첫 슬라이드에서 이전 비활성, 마지막에서 다음 비활성
- 키보드 ←/→ 슬라이드 전환
- "N/전체" 표시가 항상 일치

**F3·F3-1 활동 배치 + 편집 정책**
- 드래그 후 저장/재로드 ±1px 복원
- 활성화 전 확인 다이얼로그 (Modal.tsx 사용, "이 활동을 시작하면 설정을 바꿀 수 없어요")
- 활성화된 활동 편집 버튼 disabled
- 닫기 시 위치/크기/타입 복제된 비활성 활동 자동 생성 + 편집 패널 자동 오픈
- 슬라이드 삭제 시 응답 데이터 삭제 확인 모달
- 슬라이드당 동시 활성 1개 제약, 배치는 최대 10개 권장

**F4 세션 & 참여코드**
- 6자 코드 (charset 헷갈림 제거)
- 충돌 시 서버 자동 재생성
- 종료 후 동일 코드 입력 → "만료된 세션" 에러
- LAN URL + QR 동시 표시
- 동일 studentToken 동시 2 연결 시 두 번째 차단

**F5 학생 참여**
- 로비 카피 분기: `lobby` → "선생님이 수업을 시작하면 화면이 전환됩니다", `active` → "수업이 진행 중이에요. 잠시 후 연결됩니다" 후 2초 자동 합류
- 활동 없는 슬라이드는 응답 UI 없음
- 이미 응답한 활동 → "응답 완료" 배지 + UI 재응답 차단
- studentToken 서버 발급 보장

**F6 실시간 동기화**
- 40명 환경 슬라이드 전환 P95 < 500ms (부하 스크립트 검증)
- 재연결 시 `late-join-state`로 즉시 복원
- 빠른 연속 전환 → 학생 화면이 마지막 슬라이드로 수렴

**F7 응답 집계**
- 첫 응답 후 교사 화면 P95 < 300ms 반영
- 비공개 모드에서 학생 화면에 결과 미노출
- 바 차트 합계 정확히 100% (반올림 보정)

### Phase 2 — 확장

| ID | 기능 | 설명 | 우선순위 |
|----|------|------|---------|
| F9 | 주관식 활동 | 슬라이드 위 텍스트 입력 → 응답 수집 | P1 |
| F10 | 워드클라우드 활동 | 키워드 수집 → 슬라이드 위 시각화 | P1 |
| F11 | 드로잉 활동 | 학생이 슬라이드 전체 영역에 그려서 **제출 버튼**으로 PNG 전송. **400KB 이내 압축 권장** + 서버 magic byte 검증 + WS `maxPayload: 2MB`. 세로 모드 폰: 슬라이드 90도 회전 캔버스 제공 | P1 |
| F12 | Draggable 응답 | 슬라이드 위 요소 드래그 (분류/순서) | P2 |
| F13 | 학생 자율 모드 (Student-Paced) | 교사 범위 지정 → 학생 자기 속도로 탐색 | P1 |
| F14 | Q&A 질문 | 학생 질문 등록 + 추천. **익명 기본**, 교사가 "실명 모드" 토글로만 전환 | P1 |
| F15 | 결과 Excel 내보내기 | 슬라이드별 응답 데이터 (익명화 적용) | P1 |
| F16 | 수업 템플릿 저장 | 슬라이드+활동 세트 저장/재사용 | P2 |

### Phase 3 — 고급

| ID | 기능 | 설명 | 우선순위 |
|----|------|------|---------|
| F17 | 퀴즈 게임 모드 | 리더보드 + 타이머 (`overlay-deadline` 메시지 활용) | P2 |
| F18 | 협업 보드 활동 | Excalidraw 기반 공동 작업 (기존 기능 재사용) | P3 |
| F19 | Google Slides 실시간 갱신 | revisionId 폴링 (Slides API에 webhook 없음) | P3 |
| F20 | PPTX 직접 업로드 | LibreOffice 자동 변환 OR Drive 업로드 후 URL 자동 취득 | P3 |

---

## 2-1. 화면 구성 & 흐름

### 교사 화면 3단계 (양방향 흐름)

```
① 에디터 (준비) ←──── (lobby 상태에서만 복귀 가능)
   - 슬라이드 소스 연결 (Google Slides URL / PDF)
   - 슬라이드별 활동 배치 (react-rnd)
   - 활동별 자동활성화 토글
   - "수업 시작" → ②로 이동
   ↓
② 로비 (대기)             ↑ "수업 설정 수정" 링크
   - 세션 이름 입력 (예: "2반 1교시")
   - 접속 모드 (LAN / 터널) — 기본값은 설정에 영속, 변경은 링크
   - QR + 참여코드 + 접속 URL
   - 참여 학생 목록 실시간 업데이트
   - "진행 시작" → ③으로 이동 (이후 에디터 복귀 불가)
   ↓
③ 프레젠터 (진행)
   - 슬라이드 이미지 + 응답 결과
   - 하단 컨트롤 (점진적 노출)
     기본:        [◀ 이전] [N/전체] [다음 ▶] [수업 종료]
     활동 있을 때: + [활동 패널] (활성화 + 결과 공개 모드 묶음)
     연결 끊김:   상단 빨간 배너 "재연결 중..." + 5초 후 자동 재시도
   - 외부 인터넷 노출 시 빨간 "터널 모드" 배지 + LAN 전환 1클릭
   - 사이드 패널: 응답 현황 (이름 + 온/오프라인 상태)
```

### 학생 화면 흐름

```
참여코드 입력 → 이름 입력 → (세션 status에 따라 분기)
  ├── status='lobby': 로비 ("선생님이 수업을 시작하면 화면이 전환됩니다")
  └── status='active': "수업이 진행 중이에요" → 2초 후 자동 합류
→ 슬라이드 뷰
  - 활동 비활성: 슬라이드 이미지만
  - 활동 활성: 응답 UI → 제출 → "응답 완료" 배지
  - 이미 응답한 활동(late-join): "응답 완료" 표시
  - 닫힌 활동(late-join 시): 슬라이드 하단 sp-muted 안내 "이전 활동이 종료되었어요"
    + 결과 공개 모드면 집계 차트 표시
→ 수업 종료 화면
  - 이름 입력 단계 + 종료 화면 모두 "수업 후 180일 자동 삭제됩니다" 고정 문구
```

### 모바일 학생 — 터치 영역 정책
- 학생 화면에서 활동 hit-area는 **`max(교사 지정 렌더 크기, 44px)`로 강제** (CSS padding 또는 투명 hit-box)
- 시각 크기와 터치 영역을 분리 → 작게 그려도 누를 수 있음
- F11 드로잉: 가로 모드 권장. 세로 모드는 슬라이드를 90도 회전한 캔버스 제공

### 빈 상태 / 에러 상태

| 상황 | UI 처리 |
|------|--------|
| Google Slides 비공개 | Modal: "공유 설정이 필요합니다" + URL 복사 + "PDF로 시작" 대안 |
| PDF 50MB 초과 | "PDF 파일이 너무 커요 (최대 50MB). 페이지를 줄이거나 품질을 낮춰 다시 시도해 주세요" |
| 교사 측 네트워크 끊김 | 상단 빨간 배너 + 자동 재시도. 학생 화면은 마지막 슬라이드 유지 |
| 슬라이드 부분 로드 실패 | 실패 슬라이드는 회색 스켈레톤 + 인라인 "다시 시도" |
| LAN 모드 학생 접속 실패 | "교내망 격리 가능성, 핫스팟 모드 시도" CTA |

---

## 3. 기술 전략

### 슬라이드 소스 처리 흐름 (개정)

```
┌── Google Slides URL ──────────────────────────────────────────┐
│  전제: 공유 설정 "뷰어" (OAuth 불필요)                        │
│  1. URL → presentationId 파싱 (렌더러 → IPC 호출)             │
│  2. **메인 프로세스** API 키로 presentations.get → revisionId │
│  3. (presentationId, revisionId) 캐시 키 → 히트 시 4 스킵     │
│  4. pages.getThumbnail → contentUrl (~30분 단명)              │
│  5. 메인 프로세스가 contentUrl 즉시 다운로드 → 로컬 PNG 저장   │
│     userData/cache/slides/{presentationId}/{revisionId}/{pageId}.png │
│  6. 렌더러에는 file:// 경로만 전달 (API 키 노출 차단)         │
│  7. 수업 시작 시 revisionId 재조회 → 변경 시 캐시 갱신 토스트 │
└──────────────────────────────────────────────────────────────┘

┌── PDF 업로드 ────────────────────────────────────────────────┐
│  1. pdfjs-dist (기존 설치) → 페이지별 canvas 렌더             │
│     - 기존 PdfCanvasPreview는 page 1 전용 → N페이지 신규 구현 │
│     - lazy 렌더 (이동/스크롤 시 추가 페이지 렌더)             │
│  2. canvas.toDataURL() → 디스크 file:// 경로로 저장           │
│  3. 50MB 파일 / 100페이지 상한                                │
└──────────────────────────────────────────────────────────────┘

        ↓ 공통: 슬라이드 이미지 file:// 경로 배열 ↓

┌── 렌더링 레이어 ─────────────────────────────────────────────┐
│  [배경] 슬라이드 이미지 (풀스크린, 16:9 고정)                │
│  [전면] 활동 캔버스 (응답 영역)                               │
│    - react-rnd로 교사 배치 (에디터)                          │
│    - fabric.js로 학생 드로잉 (런타임)                        │
└──────────────────────────────────────────────────────────────┘
```

### 기존 자산 재사용 맵 (재평가)

| 필요 기능 | 기존 자산 | 재사용 평가 | 추가 작업 |
|----------|----------|------------|----------|
| Google Slides API 키 | — | 메인 프로세스 환경변수 주입 + IPC | 핸들러 신규 (~0.5~1일) |
| WS 서버 패턴 | realtimeWall.ts (85KB) | **부분 재사용 권장** | `SessionedWebSocketServer<TC,TS>` 베이스 추출 후 두 곳 모두 thin adapter화 (2~3일). 미선택 시 ~90KB 중복 |
| WS 동기화 스토어 | useRealtimeWallSyncStore (35KB) | 패턴 복제 | useSlidesSessionStore 신규 |
| 학생 SPA | src/student/ + vite.student.config.ts | 구조 복제 | src/slides-student/ + `vite.slides-student.config.ts` (outDir 충돌 주의) |
| PDF → 이미지 | PdfCanvasPreview (1페이지 전용) | **확장 필요** | N페이지 루프 + lazy + 캐시 (1~2일) |
| 활동 배치 | react-rnd | 그대로 사용 | — |
| 드로잉 캔버스 | useChalkCanvas (140KB, 풀스크린 칠판 가정) | **부분 추출 필요** | `useFabricOverlay({ canvasRef, color, penSize, mode })` 추출 (1~2일) |
| 투표 UI | ToolPoll (Tools/ 컨텍스트 결합) | **부분 추출 필요** | CreateView 옵션 빌더 + `PollVotingOverlay` 추출 (1~2일) |
| 워드클라우드 | ToolWordCloud | 모듈화 가능 | 활동 컴포넌트로 래핑 |
| QR + 참여코드 | shortCode 시스템 | 그대로 사용 | charset/길이 명시 |
| Excel 내보내기 | exceljs | 그대로 사용 | 익명화 적용 |
| 터널 | Cloudflared | 공유 (LAN 모드 우선) | — |
| 공통 UI | Modal/Drawer/Card/Button/IconButton/Kbd | 활성화/종료 확인, 활동 설정 패널 | rounded-xl 유지, **rounded-sp-* 사용 금지** |

### 새로 도입할 라이브러리: 없음

모든 핵심 의존성이 이미 설치되어 있습니다:
- `pdfjs-dist` ^4.10.38 (PDF 렌더링)
- `fabric` ^7.2.0 (캔버스 드로잉)
- `react-rnd` ^10.5.3 (드래그/리사이즈)
- `ws` ^8.19.0 (WebSocket)
- `zustand` ^5.0.3 (상태 관리)
- `zod` ^3.25.76 (런타임 검증)
- `qrcode` ^1.5.4 (QR 생성)
- `exceljs` ^4.4.0 (Excel 내보내기)

Google Slides API는 **API 키** + native `fetch`로 메인 프로세스에서 직접 호출 (OAuth 불필요).

### 아키텍처 (개정 — Use Cases 레이어 추가)

```
┌─ Domain (외부 의존성 0, 순수 TypeScript) ──────────────┐
│  InteractiveLesson                                      │
│    - id, title, source, sourceUrl, slides[], createdAt  │
│    - 한 lesson은 N개의 LessonSession을 가짐 (1:N)        │
│  Slide                                                  │
│    - id, pageNumber, imagePath (file://), overlays[]    │
│  SlideOverlay                                           │
│    - id, slideId, type, position, autoActivate          │
│    - **config: OverlayConfig** (discriminated union)    │
│  OverlayConfig (discriminated union — fabric.js 누설 차단)│
│    - PollConfig       { question, options[] }           │
│    - TextConfig       { prompt, maxLen }                │
│    - WordCloudConfig  { prompt, maxKeywords }           │
│    - DrawConfig       { strokeWidth, palette[] }        │
│    - DraggableConfig  { items[], targets[] }            │
│  LessonSession                                          │
│    - id, lessonId, sessionName, shortCode               │
│    - status: 'lobby'|'active'|'archived'                │
│    - currentSlideIndex, startedAt, archivedAt           │
│    - resultsVisibility: 'hidden'|'anonymous'|'full'     │
│  StudentResponse                                        │
│    - id (서버 발급 UUID), sessionId, slideId, overlayId │
│    - studentToken, clientResponseId, data, submittedAt  │
│  OverlayResults (집계, 종료 시 finalize)                │
│    - overlayId, type, aggregated, respondCount, total   │
│  Student                                                │
│    - studentToken (서버 발급 UUID)                      │
│    - name (익명화 후 "학생N"으로 치환 가능)             │
│    - presence: 'online'|'offline'                       │
│                                                         │
│  Ports (인터페이스, infrastructure가 구현)              │
│  - IGoogleSlidesPort     (썸네일 fetch, revisionId 조회)│
│  - IImageCachePort       (file:// 경로 저장/조회)       │
│  - ISessionRepository    (세션 CRUD, 영속)              │
│  - IRealtimeBroadcaster  (WS 메시지 송수신)             │
└────────────────────────────────────────────────────────┘

┌─ Use Cases (domain만 import) ──────────────────────────┐
│  StartLessonSession    - 세션 생성, shortCode 발급      │
│  EndLessonSession      - 종료, OverlayResults finalize, │
│                           익명화 적용                    │
│  AdvanceSlide          - 인덱스 갱신 (교사 권한 검증)   │
│  ActivateOverlay       - 활동 활성화 (per-slide 1개 제약)│
│  DeactivateOverlay     - 활동 종료, 결과 freeze         │
│  SubmitStudentResponse - upsert (studentToken+overlayId)│
│  AggregateResponses    - OverlayConfig 분기 집계        │
│  RestoreLateJoinState  - 재접속 시 상태 복원            │
│  AnonymizeSession      - 종료 시 학생명 → "학생N" 매핑  │
│  PurgeExpiredSessions  - 보존 기간(180일) sweep         │
└────────────────────────────────────────────────────────┘

┌─ Adapters (domain + usecases import) ──────────────────┐
│  useInteractiveLessonStore (Zustand)                    │
│    - 수업 CRUD, 슬라이드 소스, 활동 배치                │
│  useSlidesSessionStore (Zustand + WS client)            │
│    - 세션 상태, 슬라이드 동기화, 응답 집계              │
│    - 패턴: useRealtimeWallSyncStore                     │
│  ToolInteractiveSlides.tsx (메인 도구 UI)               │
│  LessonEditor.tsx (react-rnd 활동 배치)                 │
│  LessonPresenter.tsx (교사 진행 화면, 점진적 노출)      │
│  StudentSlideViewer (별도 SPA: src/slides-student/)     │
└────────────────────────────────────────────────────────┘

┌─ Infrastructure (외부 기술 구현) ──────────────────────┐
│  GoogleSlidesApiClient (메인 프로세스, API 키 보유)     │
│    - IGoogleSlidesPort 구현                             │
│  LocalImageCacheRepository                              │
│    - IImageCachePort 구현                               │
│    - userData/cache/slides/{presId}/{revId}/{pageId}.png│
│  WS 서버 (electron/ipc/interactiveSlides.ts, 메인 프로세스)│
│    - ipcMain.handle 통한 렌더러 연동                    │
│    - 가능 시 SessionedWebSocketServer<TC,TS> 베이스 사용│
│  JsonInteractiveLessonRepository                        │
│    - userData/data/lessonSessions/{sessionId}.json      │
│    - **라이브 응답: 메모리 + 종료 시 스냅샷**            │
│      (per-event 디스크 쓰기 X, JSON 폭증 방지)          │
│  LAN 서버: http://{localIP}:{port} + firstRun 자체진단  │
│  Cloudflared 터널 (외부 접속, 선택)                     │
└────────────────────────────────────────────────────────┘
```

### WebSocket 프로토콜 (확장)

```
[교사 → 서버]
  slide-advance         { sessionCode, slideIndex, timestamp }
  overlay-activate      { sessionCode, overlayId }
  overlay-deactivate    { sessionCode, overlayId,
                          showResults: 'hidden'|'anonymous'|'full' }
  lesson-end            { sessionCode }

[서버 → 학생 전체 broadcast]
  slide-changed         { slideIndex, overlays[] }
  overlay-activated     { overlayId, config, position, activatedAt }
  overlay-deactivated   { overlayId, results? }
  lesson-ended          {}
  teacher-disconnected  { gracePeriodMs }      # NEW
  teacher-reconnected   {}                      # NEW
  overlay-deadline      { overlayId, deadline } # NEW (Phase 3 reserved)
  error                 { code, message }      # NEW

[학생 → 서버]
  join-session          { sessionCode, studentName,
                          rejoin?: { previousToken } }
  overlay-response      { sessionCode, overlayId, studentToken,
                          clientResponseId, data }

[서버 → 학생 (개별 ack)]
  session-joined        { studentToken, sessionStatus,           # NEW
                          currentSlideIndex }
  late-join-state       { slideIndex,
                          activeOverlays[{id, activatedAt, deadline?}],
                          closedOverlays[{id, closedAt, results?}],
                          studentList: { totalOnline },
                          myResponses[{overlayId, submittedAt}] }
  response-accepted     { overlayId,                              # NEW
                          status: 'recorded'|'late'|'rejected' }

[서버 → 교사]
  response-received     { overlayId, aggregated, respondCount, totalCount }
  student-joined        { studentToken, studentName, totalCount }
  student-presence-changed { studentToken, online, totalOnline }  # NEW
```

#### 세션 인증 & 응답 무결성 (P0)

- **studentToken 서버 발급**: `join-session` 수신 시 서버가 `crypto.randomUUID()` 발급, `session-joined` ack로 반환. 클라이언트는 sessionStorage 보관 후 모든 메시지에 첨부.
- **WS ↔ studentToken 바인딩**: 서버는 `Map<WS, studentToken>` 유지. `overlay-response`의 token이 연결 바인딩과 다르면 drop + 보안 로그.
- **응답 upsert**: 동일 (overlayId, studentToken)은 **upsert** (학생 정정 허용). `submittedAt` 최신 우선, `clientResponseId`로 idempotency.
- **Rejoin 식별**: `join-session.rejoin.previousToken`이 "최근 60초 내 disconnect"일 때만 토큰 재발급. 그 외엔 신규 학생.
- **late-join-state 정보 최소화**: `studentList`는 인원 수만, `myResponses[]`는 요청 token 매핑된 것만. 다른 학생 응답 내용 절대 미포함.

#### 메시지 검증 & 페이로드 한도

- **Zod 스키마 필수**: 13건 메시지 타입 모두 `electron/ipc/interactiveSlides.ts` 상단에 정의. parse 실패 → 즉시 `connection.close(1008)`.
- **WS `maxPayload: 2MB`** 강제.
- **드로잉 PNG**: 클라이언트 1280×720 + 압축으로 400KB 이내. 서버 측 PNG magic byte (`89 50 4E 47 0D 0A 1A 0A`) 검증.
- **Rate limit**: 학생당 overlay당 1초 5회 (debounce + sliding window).
- **교사 역할 상호 배제**: `sessionCode + role=teacher` 동시 2 연결 차단.
- **Heartbeat reconciliation**: 5초마다 서버가 활성 활동 상태 broadcast → WS drop 시 학생 멈춤 방지.
- **Deactivation grace**: deactivate 직후 500ms 내 도착한 응답은 `'late'` 상태로 수락.

### 활동 라이프사이클 (UX 안전망 포함)

```
[비활성] → 교사 활성화 + 확인 다이얼로그 → [활성: 학생 응답 가능]
       → 교사 닫기 → [닫힘: results 공개 모드별 표시]
       → 교사 "닫고 새로 만들기" → 위치/크기/타입 복제된 [비활성] 자동 생성
                                  + 편집 패널 자동 오픈
```

- 슬라이드별로 여러 활동 배치 가능, **Phase 1 동시 활성은 1개**
- 자동 활성화는 **활동별 토글** (per-overlay)
- 활성화된 활동은 수정 불가 — 확인 다이얼로그로 인지 강제
- 닫고 새로 만들기는 위치 복제 → 수업 중 오타 발견해도 텍스트만 재편집

### 활동 유형

| 유형 | 학생 UI | 교사 결과 표시 | 기존 자산 (추출 필요 여부) |
|------|---------|--------------|----------|
| poll | 슬라이드 위 버튼 | 바 차트 오버레이 | ToolPoll → `PollVotingOverlay` 추출 |
| text | 슬라이드 위 텍스트 입력 | 응답 리스트/익명 피드 | MultiSurveyLiveBoard 패턴 |
| wordcloud | 키워드 입력 | 워드클라우드 시각화 | ToolWordCloud 모듈화 |
| draw | 슬라이드 전체 자유 그리기 → 제출 PNG | 갤러리 뷰 | useChalkCanvas → `useFabricOverlay` 추출 |
| draggable | 슬라이드 위 요소 드래그 | 위치 히트맵 | react-rnd 응용 |

---

## 4. 비기능 요구사항 (검증 방법 명시)

| 항목 | 기준 | 검증 방법 | 등급 |
|------|------|----------|------|
| 동시 접속 | 최소 40명 | `scripts/load-test-slides.mjs` Phase 1: 40 WS 동시 join → ACK < 2s, 메모리 +50MB 이내, 손실 0 | P0 |
| 슬라이드 전환 지연 | P95 < 500ms (40명) | 같은 스크립트 Phase 2: 교사 advance → 학생 changed 수신 diff | P0 |
| 응답 반영 지연 | P95 < 300ms (단일) | 부하 스크립트 Phase 3 RTT | P0 |
| 응답 burst 처리 | 40명 5초 내 응답 시 손실 0%, P95 집계 < 300ms, 합계=40 | Phase 3 burst 시나리오 | P0 |
| Google Slides 첫 로드 | < 3초 (30장 기준) | 30장 공개 덱 수동 측정, 교내망 프록시 별도 1회 | P1 |
| Google Slides 캐시 히트 | < 200ms | `performance.now()` 단위 테스트 | P1 |
| PDF 첫 로드 | < 2초 (30페이지/1MB) | 표준 PDF 30페이지 수동 측정 | P1 |
| 모바일 반응형 | iOS Safari 17+ (iPhone SE) + Android Chrome 124+ (Galaxy A34) | 두 디바이스 수동 인수 | P0 |
| 오프라인 대응 | LAN 모드 + Wi-Fi 인터넷 차단에서 PDF 수업 완주 | 수동 검증 | P1 |
| 활동 위치 정확도 | 4:3 / 16:9 / 21:9에서 ±2px | Playwright screenshot 비교 | P1 |
| LAN 모드 접속 | 5분 내 학생 폰 접속 성공률 ≥ 95% | 10교실 dogfooding | P1 |
| 세션 식별 | 세션 이름 라벨로 과거 결과 구분 | F8-3 인수 기준 | — |
| 슬라이드 로딩 UX | 스켈레톤 + N/전체 진행률 | F1-1 인수 기준 | — |
| WS 메시지 한도 | maxPayload 2MB, 학생 rate 1s 5회 | ws 옵션 + 단위 테스트 | P1 |
| **응답 데이터 보존** | **기본 180일, 즉시 삭제 옵션** | **F8-3 인수 기준 + sweep cron 단위 테스트** | **P0 (법적 요건)** |

---

## 5. 레퍼런스

### 서비스 참고

| 서비스 | 참고 포인트 |
|--------|------------|
| [Pear Deck](https://www.peardeck.com/) | 오버레이 UX, Instructor/Student-Paced, Google Slides 연동 패턴 |
| [Nearpod](https://nearpod.com/) | 활동 다양성, 세션 관리, 결과 대시보드 |
| [Mentimeter](https://www.mentimeter.com/) | 실시간 응답 시각화 애니메이션 |
| [Slido](https://www.slido.com/) | 간결한 참여 UX, 슬라이드 위 오버레이 패턴 |

### 오픈소스 참고

| 프로젝트 | 라이선스 | 참고 포인트 |
|---------|---------|------------|
| [Open-Response](https://github.com/OSU-MC/Open-Response) | MIT | React+WS 실시간 폴링, REST+WS 이중 구조, 응답 집계 |
| [Claper](https://github.com/ClaperCo/Claper) | GPLv3 (UX만 참고) | 슬라이드 위 활동 UX 흐름 |
| [DeckDeckGo](https://github.com/deckgo/deckdeckgo) | MIT | 프레젠테이션 리모트 컨트롤 WS 패턴 |
| [Auden](https://github.com/dtinth/auden) | MIT | React+TS 3화면 분리 (presenter/audience/display) |
| [konva-react-image-annotation](https://github.com/dynamic11/konva-react-image-annotation) | MIT | 이미지 위 어노테이션 오버레이 패턴 |
| [react-rnd](https://github.com/bokuweb/react-rnd) | MIT | 드래그+리사이즈 — **이미 설치됨** |

### API 참고

| API | 용도 | 문서 |
|-----|------|------|
| Google Slides API v1 | [getThumbnail](https://developers.google.com/slides/api/reference/rest/v1/presentations.pages/getThumbnail) → 슬라이드별 PNG (단명 URL) | 공식 문서 |
| Google API 키 | [API Key 사용](https://developers.google.com/slides/api/guides/authorizing) — 공개 프레젠테이션 읽기 전용 | 공식 문서 |

### 기존 코드 참고 (쌤핀 내부)

| 용도 | 파일 | 크기 | 핵심 패턴 |
|------|------|------|----------|
| WS 동기화 스토어 | `src/adapters/stores/useRealtimeWallSyncStore.ts` | 35KB | 메시지 타입 분기, 재연결, broadcast 수신 |
| WS 서버 | `electron/ipc/realtimeWall.ts` | 85KB | Zod 검증, broadcastToClients, 세션 관리 |
| 학생 SPA | `src/student/StudentRealtimeWallApp.tsx` | — | 닉네임 → WS 연결 → 실시간 뷰 |
| (참고) OAuth 클라이언트 | `src/infrastructure/google/GoogleOAuthClient.ts` | — | 인터랙티브 슬라이드에서는 미사용 (API 키) |
| PDF 렌더링 (1페이지) | `src/adapters/components/Export/PdfCanvasPreview.tsx` | — | pdfjs worker 설정 — N페이지 확장 필요 |
| 캔버스 드로잉 | `src/adapters/components/Tools/Chalkboard/useChalkCanvas.ts` | 140KB | fabric.js 풀스크린 통합 — 일부 추출 필요 |
| 투표 도구 | `src/adapters/components/Tools/ToolPoll.tsx` | — | 객관식 UI + 집계 — 일부 추출 필요 |
| react-rnd 사용 | `src/adapters/components/Tools/RealtimeWallFreeformBoard.tsx` | — | 카드 자유 배치 |

---

## 6. 기술적 실현가능성 평가

### 종합 판단: ✅ 매우 높음 (단 일부 추출 작업 필요)

| 영역 | 상태 | 설명 |
|------|------|------|
| WebSocket 인프라 | ✅ 완비 (재구조화 권장) | SessionedWebSocketServer 베이스 추출 시 깔끔 |
| Google Slides API | ✅ 단순화 | API 키, 메인 프로세스 격리, revisionId 캐시 무효화 |
| PDF → 이미지 | ⚠️ 확장 필요 | 현재 1페이지 전용, N페이지 + lazy 신규 구현 |
| 활동 배치 | ✅ 완비 | react-rnd |
| 드로잉 캔버스 | ⚠️ 추출 필요 | useChalkCanvas → useFabricOverlay 분리 |
| 학생 SPA | ✅ 완비 | 별도 빌드 + 터널 (vite.slides-student outDir 분리) |
| 투표/워드클라우드 | ⚠️ 추출 필요 | ToolPoll → PollVotingOverlay 분리 |
| 추가 패키지 | ✅ 0개 | — |

### 새로 구현 필요 항목 (개정)

| 항목 | 난이도 | 예상 공수 |
|------|--------|----------|
| Google Slides API 클라이언트 (메인 프로세스, IPC, revisionId 캐시) | 낮 | 0.5~1일 |
| 슬라이드 활동 에디터 UI (react-rnd) | 중 | 3~4일 |
| WS 메시지 13종 + Zod 스키마 | 낮 | 1~2일 |
| WS 서버 (`SessionedWebSocketServer` 추출 포함) | 중~높 | 4~5일 |
| 학생 슬라이드 뷰어 SPA | 중 | 3~4일 |
| `useSlidesSessionStore` | 낮 | 1~2일 |
| 이미지 캐시 (revisionId 키, 단명 URL 다운로드) | 낮 | 1일 |
| 교사 프레젠터 화면 (점진적 노출 컨트롤 바) | 중 | 2~3일 |
| `useFabricOverlay` 추출 | 중 | 1~2일 |
| `PollVotingOverlay` 추출 | 중 | 1~2일 |
| `PdfCanvasPreview` N페이지 확장 | 낮 | 1~2일 |
| 익명화 + 보존 sweep | 낮 | 1일 |

총 ≈ 22~31일. **Phase 1 MVP는 원본 추정 2~3주 → 3~4주로 상향**.

---

## 7. 범위 제외 (Out of Scope)

- 슬라이드 직접 편집/생성 (Google Slides/Canva 역할)
- 영상/VR/3D 콘텐츠 삽입
- LMS 연동 (Moodle, Google Classroom)
- **NEIS / 생기부 시스템 연동** (별도 PDCA에서 보호자 동의 흐름과 함께 검토)
- 성적표 자동 반영
- Google Slides 실시간 협업 편집 미러링 (MVP 제외)
- Microsoft PowerPoint Online 연동 (Phase 3 이후 검토)
- **GDrive 자동 백업**: interactive-slides 응답 데이터(`student-responses-*.json`, 드로잉 PNG)는 `syncRegistry`에 등록하지 않음 → 미성년자 PII가 교사 개인 Drive로 유출되는 것 차단
- **챗봇 KB 학습**: 응답 데이터는 ssampin-chat 임베딩 파이프라인 미포함
- **보호자 동의 흐름** (MVP 제외): 학교 단위 운영 정책에 위임. §11 보존·익명화 정책으로 PIPA 최소 요건 충족

---

## 8. 성공 지표

| 지표 | 목표 | 측정 공식 |
|------|------|----------|
| 수업 생성 → 시작까지 소요 시간 | 2분 이내 | URL/PDF 입력 시점 ~ "수업 시작" 클릭 시점 (사용자 세션 로그) |
| 학생 참여율 (활동 응답률) | 85% 이상 | 응답 학생 수 / 총 참여 학생 수 (활동별 평균) |
| 슬라이드 동기화 성공률 | 99% | slide-changed 수신 학생 수 / 전체 학생 수 (per advance) |
| 활동 배치 → 미리보기 | 즉시 (WYSIWYG) | 인수 기준만 — 수치 미적용 |
| Google Slides 연결 성공률 | 95% | 첫 썸네일 로드 성공 / 전체 URL 입력 시도. 가이드 모달 후 재시도 성공 포함 |

---

## 9. 개발 일정 (개정)

| Phase | 기간 | 핵심 산출물 |
|-------|------|------------|
| Phase 1 (MVP) | **3~4주** | Google Slides 연동 + PDF + 투표 활동 + WS 동기화 + 학생 화면 + 보안/PIPA 기본 |
| Phase 2 (확장) | **2주** | 주관식/워드클라우드/드로잉 + Student-Paced + Excel 내보내기 |
| Phase 3 (고급) | **2~3주** | Draggable, 퀴즈 게임 + 타이머, 실시간 갱신, PPTX 자동 변환 |

**근거**: 새 패키지 0개. 단 `useChalkCanvas`/`ToolPoll`/`PdfCanvasPreview` 부분 추출 + `SessionedWebSocketServer` 베이스 추출이 필요해 원본 2~3주에서 1주 상향. 추출은 부수 효과로 realtimeWall 코드도 깔끔해짐.

---

## 10. 리스크 & 대응 (개정)

| 리스크 | 영향 | 대응 |
|--------|------|------|
| Google 공유 설정 미스 | 낮 | 가이드 모달 + URL 복사 + PDF 대안 |
| Google API 할당량 | **중** | revisionId 캐시 + 백오프 재시도 + GCP quota cap (예: 10,000/day) + 초과 시 PDF 모드 안내 |
| API 키 노출 (asar 추출) | **중** | 메인 프로세스 격리 + API restriction (Slides API 단일) + 잔여 위험 문서화 |
| 활동 위치 반응형 | 낮 | react-rnd + 상대좌표(%) + 16:9 고정 |
| 학생 모바일 터치 | 중 | 학생 렌더 hit-area ≥ 44px (시각 크기와 분리) + 작은 활동은 모달 확대 |
| WS 끊김 (학생) | 낮 | 기존 패턴 + late-join + heartbeat 5초 |
| WS 끊김 (교사) | **중** | `teacher-disconnected` broadcast + 60초 grace + 학생 화면 마지막 슬라이드 유지 |
| Google Slides 비공개 | 낮 | 가이드 모달 + PDF 대안 |
| 교내 방화벽 차단 | 낮 | PDF 오프라인 모드 안내, 사전 캐시 |
| Windows Firewall 첫 실행 차단 | **중** | NSIS 인스톨러에 firewall exception (`netsh advfirewall ...`) + firstRun 자체진단 |
| AP isolation (교내망 격리) | 중 | 자동 감지 불가 명시 + "핫스팟 모드 시도" 폴백 안내 |
| 다중 NIC / VPN 활성 | 중 | `os.networkInterfaces()` 후보 2개 이상이면 IP 선택 모달 |
| fabric.js 번들 크기 | 낮 | tree-shaking (기존 Chalkboard 최적화 적용) |
| PDF 메모리 (100페이지) | 낮 | lazy 렌더 + 100페이지 상한 |
| 교사 PC 슬립 / 디스크 풀 | 중 | grace period + 학생 자동 재연결 + 디스크 풀 시 사용자 토스트 |
| 학생 token 위변조 | 중 | studentToken 서버 발급 + WS 바인딩 + Zod 검증 |
| 미성년자 PII 노출 (터널) | 높 | shortCode entropy (~244M) + "외부 인터넷 노출" 빨간 배지 + LAN 우선 안내 + 익명화 기본 |
| PIPA 보존 위반 | 높 | 180일 자동 sweep + 즉시 삭제 + 익명화 기본 + GDrive 백업 제외 |

---

## 11. 보안 & 개인정보 처리 (NEW)

> 한국 개인정보보호법(PIPA) + 미성년자 보호 기준 준수.

### 11.1 응답 데이터 보존·파기 정책 (P0, 법적 요건)

- **기본 보존 기간**: 세션 종료 후 **180일**, 이후 자동 파기 (배경 작업 매일 0시 sweep, `PurgeExpiredSessions` 유스케이스).
- **익명화 옵션 (기본 ON)**: 세션 종료 시 학생 실명 → "학생1, 학생2..." 자동 치환. 매핑 테이블 별도 보관(교사 임의 복원 가능, 옵션). F8-3은 익명화된 결과만 표시.
- **즉시 삭제**: 세션별 "결과 삭제" 단일 버튼 (휴지통 없이 즉시 영구 삭제).
- **수집 안내 문구**: 학생 참여 화면 "이름 입력" 단계 + 종료 화면 모두 "수업 후 180일 자동 삭제됩니다" 고정 문구.
- **GDrive 백업 제외**: §7 OOS 참조.
- **챗봇 학습 제외**: ssampin-chat 임베딩 파이프라인 미포함.

### 11.2 세션 인증 & 응답 무결성 (P0)

§3 "세션 인증 & 응답 무결성" 절 참조 (studentToken 서버 발급 / WS 바인딩 / upsert / rejoin / late-join 정보 최소화).

### 11.3 외부 노출 통제 (P0)

- shortCode 6자 영숫자 대문자, charset = `ACDEFGHJKLMNPQRTUVWXY3479` (헷갈림 제거), 약 244M 조합. 세션 만료 시 즉시 무효화.
- 터널 URL은 세션 종료 시 즉시 close (`cloudflared tunnel cleanup`).
- 교사 화면에 **"외부 인터넷 노출 중"** 빨간 배지 + "LAN 모드로 전환" 1클릭 버튼.
- 세션 생성 시 1회 모달: "학생 실명 + 응답이 인터넷을 경유합니다. 가능하면 LAN 모드를 사용하세요."

### 11.4 드로잉 보존 정책 (P0, F11)

- 캡처된 PNG는 세션 종료 후 N일 자동 삭제 (보존 기간 따름).
- 드로잉 결과 갤러리에 "민감정보 노출 시 삭제" 단일 버튼.

### 11.5 Q&A 익명 기본값 (P1, F14)

익명 기본 ON. 교사가 "실명 모드" 토글로만 전환.

### 11.6 API 키 보안 처리 (P1)

- **메인 프로세스 전용 호출**: 렌더러는 `slides:fetchThumbnails(presentationId)` IPC만 사용. 키는 `electron/ipc/interactiveSlides.ts`에서만 보유.
- **GCP quota cap**: 일일 한도 10,000 reads (조정 가능). 초과 시 자동 차단 + "오늘 한도 도달, PDF 모드 사용" 토스트.
- **API restriction**: 키 권한을 Google Slides API 단일 서비스로 제한.
- **잔여 위험**: asar 추출 시 키 노출 가능. quota cap으로 피해 한정. `docs/02-design/security-spec.md`에 명시.

### 11.7 LAN 모드 사전 점검 (P1)

- **firstRun 자체 진단**: 세션 시작 시 `localIP:port`로 자기 자신에게 fetch → 200 못 받으면 방화벽 의심 토스트 + 가이드.
- **Windows Firewall exception**: NSIS 인스톨러에 `netsh advfirewall firewall add rule` 등록.
- **다중 NIC/VPN**: 후보 2개 이상이면 IP 선택 모달 (예: "Wi-Fi: 192.168.0.5 / VPN: 10.8.0.2").

### 11.8 PIPA 매핑

출시 전 `docs/02-design/security-spec.md`에 PIPA Article 22(개인정보 수집·이용 동의) 매핑표 작성.

---

## 12. 디자인 레퍼런스 & 컴포넌트 재사용 (NEW)

### 12.1 design examples/ 참조 (CLAUDE.md 강제)

- 에디터 패널: `RealtimeWallFreeformBoard` 디자인 패턴 참조
- 학생 뷰어: `src/student/` 기존 화면 톤 유지
- 프레젠터: `design examples/` 내 3-stage 흐름(lobby/active/end) 화면 확인 필요
- 구현 착수 전 Stitch 예시 추가 생성 권고

### 12.2 디자인 시스템 토큰 (CLAUDE.md)

- 다크 테마: `sp-bg` / `sp-surface` / `sp-card` / `sp-border` / `sp-accent` / `sp-highlight` / `sp-text` / `sp-muted`
- 모서리: 모든 카드/패널 `rounded-xl`. **`rounded-sp-*` 사용 금지** (사용자 피드백 정책)
- z-index 시맨틱 토큰: `z-sp-modal: 50` (확인 다이얼로그), `z-sp-toast: 60` (연결 끊김 배너)

### 12.3 컴포넌트 재사용

| 화면 요소 | 컴포넌트 | 비고 |
|----------|---------|------|
| 활동 설정 패널 (에디터) | `Drawer.tsx` (slide-in 우측) | 공간 효율 우선 |
| 활성화 / 종료 / "닫고 새로 만들기" 확인 | `Modal.tsx` | focus-trap 보장 |
| 활동 없음 빈 상태 | `Card` | "활동을 추가하세요" 안내 |
| 접속코드 표시 | 기존 담벼락 세션 코드 패턴 복제 | — |
| 버튼 | `Button`, `IconButton` | WCAG 2.5.5 hit-area 강제 |
| 키보드 단축키 표시 | `Kbd` | "←/→ 슬라이드 전환" 등 |

### 12.4 한국어 UX 카피 가이드

- "오버레이"는 내부 기술 용어. **UI 노출 카피는 "활동" 사용** ("활동 추가", "활동 시작").
- "Instructor-Paced" → **"교사 진행 모드"**. "Student-Paced" → **"학생 자율 모드"** (Phase 2).
- 종료 화면 + 이름 입력 화면 공통 고지: "수업 후 180일 자동 삭제됩니다".

---

## 13. 품질 게이트 & 검증 전략 (NEW)

### 13.1 메타테스트 (구조적 회귀 차단)

| ID | 메타테스트 | 검증 대상 |
|----|----------|----------|
| MT-1 | WS 메시지 13종 모두 Zod 스키마 보유 | `electron/ipc/interactiveSlides.ts` |
| MT-2 | 모든 OverlayConfig variant에 `aggregateResults` 분기 | `src/domain/rules/overlayRules.ts` |
| MT-3 | main app + slides-student 동일 `PROTOCOL_VERSION` 상수 | 두 wsClient 파일 |
| MT-4 | 모든 영속 엔티티에 마이그레이션 항목 | `JsonInteractiveLessonRepository.ts` |
| MT-5 | LAN URL이 `installNavigationGuard` 화이트리스트 경유 | `electron/security-guards.ts` |
| MT-6 | `vite.slides-student` outDir 충돌 없음 | 두 vite config 파일 |

### 13.2 부하 시나리오 (P0)

`scripts/load-test-slides.mjs` (LAN/터널 각각 실행):
1. 40 WS 동시 join → ACK
2. slide-advance → 40 학생 changed RTT 측정 (P95 < 500ms)
3. **응답 burst**: 40 학생 0~5s 분산 응답 → response-received RTT (P95 < 300ms), 손실 0%, 합계 = 40
4. lesson-end → 정상 종료 확인

### 13.3 Phase 1 출시 게이트

**Must (출시 차단)**
1. F1~F7 인수 기준 모두 수동 PASS
2. 부하 §13.2 P95 기준 통과 (LAN + 터널 양쪽)
3. MT-1~MT-6 자동 PASS
4. `npx tsc --noEmit` 0 errors, 기존 710개 테스트 회귀 0
5. LAN + 터널 각각 실제 Wi-Fi 환경 1회 완주 (실제 스마트폰 2대 이상)

**Should (권고)**
6. 교사 1명 + 학생 10명 이상, 20분 dogfood 1회

**Nice-to-have**
7. Playwright e2e 1개 (세션 → join → 투표 → 결과)

### 13.4 Phase 2 / 3 게이트 (개요)

- Phase 2: F9~F11 인수 + 드로잉 PNG 손실 0% + Phase 1 부하 회귀 0
- Phase 3: 퀴즈 타이머 ±100ms + Excalidraw 협업 보드 회귀 0

### 13.5 커버리지 매트릭스

| Feature | Unit | Integ | E2E | Load | Manual |
|---------|:----:|:-----:|:---:|:----:|:------:|
| F1 소스 연결 | O | — | — | — | O |
| F1-1 Slides API | O | O (mock) | — | — | O |
| F1-2 PDF 변환 | O | O | — | — | O |
| F2 슬라이드 뷰어 | O | — | O | — | — |
| F3 활동 배치 | O (% 변환) | — | — | — | O |
| F3-1 영역 저장/복원 | O | O | — | — | O |
| F4 세션 코드 | O | O | O | — | O |
| F5 학생 참여 | — | — | O | — | O |
| F6 동기화 | — | O (WS mock) | O | O | O |
| F7 집계 | O | O | O | O | O |
| F8 대시보드 | — | — | — | — | O |
| F8-2 종료 + 익명화 | O | — | O | — | O |
| F11 드로잉 | — | O | — | — | O (필수) |
| WS burst (NFR) | — | — | — | O (필수) | — |
| LAN 모드 (NFR) | — | — | — | O | O (필수) |

---

## 변경 이력

- **v2 (2026-05-10)** — 4인 팀 리뷰 반영
  - **추가** §11 보안 & 개인정보 처리, §12 디자인 레퍼런스 & 컴포넌트 재사용, §13 품질 게이트 & 검증 전략
  - **추가** Use Cases 레이어 10개 (StartLessonSession ~ PurgeExpiredSessions)
  - **추가** WS 메시지 5종 (`teacher-disconnected`, `teacher-reconnected`, `session-joined`, `response-accepted`, `student-presence-changed`, `error`, `overlay-deadline` reserved)
  - **변경** API 키 메인 프로세스 격리 + revisionId 기반 캐시 무효화 + 단명 contentUrl 즉시 다운로드 절차 명문화
  - **변경** studentToken 서버 발급 + WS ↔ token 바인딩 + 응답 upsert 정책
  - **변경** 결과 공개 ON/OFF → 3단계 (hidden / anonymous / full)
  - **변경** 활성화 전 확인 다이얼로그 + "닫고 새로 만들기" 위치 복제 안전망
  - **변경** 로비 ↔ 에디터 양방향 흐름 (lobby 상태에서만)
  - **변경** PIPA 180일 보존 + 익명화 기본 ON + GDrive 백업·챗봇 학습 명시 제외
  - **변경** Phase 1 일정 2~3주 → 3~4주 (추출 작업 반영)
  - **변경** PdfCanvasPreview 1페이지 전용 → N페이지 확장 작업 명시
  - **변경** 비기능 요구사항 검증 근거 → 검증 방법으로 구체화 + burst/보존 행 추가
- v1 (이전) — 초안
