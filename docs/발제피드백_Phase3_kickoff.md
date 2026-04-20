# 발제 피드백 응답 모아보기 — Phase 3 Kickoff (새 세션용 핸드오프)

> **작성일:** 2026-04-20
> **대상:** Phase 3(이미지 응답) 착수할 새 Claude Code 세션
> **이전 세션 달성:** Phase 1(Match 96%) + Phase 2(Match 97%) 완료 및 커밋
> **다음 목표:** Phase 3 — 이미지 응답 A안(WebSocket + 로컬 파일, 오프라인 유지) · 공수 5일

---

## 🚦 출발 전 5분 체크리스트

새 세션을 열면 다음 순서로 빠르게 확인:

1. `git log --oneline -5` — 최근 4개 커밋이 multi-survey 관련인지 확인
   - `dc6c44f docs(multi-survey): Design v0.4 — Phase 2 구현 완료 역반영`
   - `e55e827 docs(multi-survey): PDCA 문서 — Plan v3 / Design v0.3 / Analysis / Report`
   - `a0b57e0 feat(multi-survey): 발제 피드백 응답 모아보기 Phase 1+2`
   - `aaa9d68 chore: add Vitest testing infrastructure`
2. `npx tsc --noEmit` — **0 errors 여야 함**
3. `npm test` — **52/52 passing 여야 함**
4. 이 문서 + [Plan 부록 A §3 Feature 5](PLAN_발제피드백_응답모아보기.md#feature-5-이미지-응답-타입-후순위) + [Design §11.3 Phase 3 스텁](02-design/features/발제피드백응답모아보기.design.md) 읽기

---

## 📍 현재 위치 (Phase 1+2 완료 상태)

| 영역 | 상태 |
|------|------|
| **도메인 순수 함수** | `src/domain/rules/toolResultAggregation.ts` · `toolResultSerialization.ts` + 41 tests |
| **Excel 내보내기** | `src/infrastructure/export/ExcelExporter.ts`의 `exportToolResultToExcel` · `exportMultiSurveyDataToExcel` + 11 tests |
| **SpreadsheetView 3탭** | `src/adapters/components/Tools/Results/` — 요약/테이블/개별 + inlineFooter 슬롯 + createPortal 모달 |
| **ToolMultiSurvey results 단계** | SpreadsheetView로 완전 교체 (구 ResultsView + 헬퍼 약 480라인 제거) |
| **PastResultsView** | multi-survey 카드에 "📊 스프레드시트로 열기" 모달 버튼 |
| **피드백 프리셋 3종** | `src/adapters/constants/feedbackPresets.ts` (A: 발제 퀵 / B: 사례나눔 리플렉션 / C: 소풍 활동 소감) |
| **라이브 피드백 월** | `src/adapters/components/Tools/FeedbackWall/` — View + Card (fade-in, 고정/하이라이트/장문 확대, 8색 파스텔) |
| **MultiSurvey running 단계** | "📋 피드백 월" 토글 버튼 + FeedbackWallView 분기 (IPC 변경 0건) |

---

## 🎯 Phase 3 범위 (5일 공수)

**목표:** 학생 모바일에서 "떠오르는 사진"을 카메라/갤러리로 업로드, 교사 기기에 로컬 저장.

**선택된 방안: A안 (Plan §3 Feature 5)**
- WebSocket 바이너리 프레임 → Electron 메인에서 `app.getPath('userData')/data/feedback-images/{sessionId}/{submissionId}.webp` 저장
- 썸네일(200x200) 함께 생성
- `MultiSurveyAnswer.value`에 `{ originalPath, thumbPath }` 객체 추가
- Excel 내보내기 시 zip 번들로 이미지 폴더 동봉

**B/C안은 배제됨** (가중 스코어링 A=70 / B=42 / C=53) — Plan §부록 A 참고.

### 구현 체크리스트 (Design §11.2 기준)

- [ ] `MultiSurveyQuestionType`에 `'image'` 추가
- [ ] `MultiSurveyAnswer.value` 타입 확장 (`ImageAnswerValue` 유니온)
- [ ] 학생 모바일 HTML 이미지 업로드 UI (`liveMultiSurveyHTML.ts`)
- [ ] **클라이언트 EXIF orientation 정규화** (iOS 사진 90° 회전 방지)
- [ ] 클라이언트 리사이즈/압축 (Canvas API, WebP, max 1280px, quality 0.7)
- [ ] WebSocket 바이너리 프레임 송수신 + **2MB 상한** + 재압축·거절
- [ ] Electron 메인 이미지 저장 IPC 핸들러 + **썸네일(200x200) 생성**
- [ ] 미저장 세션 24h 클린업 크론
- [ ] 결과 뷰 갤러리 그리드 + 라이트박스
- [ ] SpreadsheetView TableTab에 이미지 썸네일 셀
- [ ] Excel 내보내기 zip 번들 (이미지 폴더 포함)
- [ ] 설정 화면에 "이미지 스토리지 용량 + 정리" UI
- [ ] Google Drive 백업 로직에 `feedback-images/` 폴더 포함

### ⚠️ 놓치기 쉬운 함정 (Plan·Design에서 도출)

| # | 함정 | 대응 |
|---|------|------|
| 1 | iOS Safari EXIF orientation 미처리 → 90° 회전 저장 | 리사이즈 전 EXIF 읽어 Canvas transform 적용 |
| 2 | 썸네일 없이 원본 그리드 렌더 → 30장 × 5MB = 150MB 메모리 폭발 | 썸네일은 선택이 아닌 **필수** |
| 3 | 디스크 용량 방치 → 수 GB 누적 | 설정 UI에 "정리" 기능 필수 |
| 4 | Google Drive 백업이 JSON만 처리 중 | 이미지 폴더 경로 추가 |
| 5 | Cloudflare 터널 모드는 CF 무료 플랜 대역폭 점유 | 로컬 Wi-Fi 직접 접속은 무관 (터널은 외부 접속 시에만) |
| 6 | 세션 종료 vs 결과 저장 분기 | 결과 미저장 세션의 24h 클린업 정책 |
| 7 | WebP가 WebSocket 프레임에서 바이너리로 전달될 때 JSON 구조와 혼합 | 바이너리 프레임 vs 텍스트 프레임 분리 또는 base64로 JSON 속 |
| 8 | **SpreadsheetView의 existing state 구조 재검증** — `value` 유니온 확장 시 기존 `serializeAnswerCell`의 switch exhaustiveness | 기존 forward-compat 테스트가 컴파일 에러로 누락 감지 (설계됨) |

---

## 📚 필수 읽기 순서 (새 세션에서)

1. **이 문서** (핸드오프 전체)
2. [docs/PLAN_발제피드백_응답모아보기.md](PLAN_발제피드백_응답모아보기.md) **§3 Feature 5 A안** + **부록 A** (대안 비교 근거)
3. [docs/02-design/features/발제피드백응답모아보기.design.md](02-design/features/발제피드백응답모아보기.design.md) **§11.3 Phase 3 스텁**
4. (필요 시) [docs/03-analysis/발제피드백응답모아보기.analysis.md](03-analysis/발제피드백응답모아보기.analysis.md) — Phase 1/2 Gap 기록
5. (필요 시) [docs/04-report/features/발제피드백응답모아보기.report.md](04-report/features/발제피드백응답모아보기.report.md)

---

## 🔧 핵심 파일 위치 레퍼런스

**확장 대상 (Phase 3 수정):**
- [src/domain/entities/MultiSurvey.ts](../src/domain/entities/MultiSurvey.ts) — `MultiSurveyQuestionType`, `MultiSurveyAnswer.value` 유니온
- [src/domain/entities/ToolTemplate.ts](../src/domain/entities/ToolTemplate.ts) — `MultiSurveyTemplateQuestion` (prefill 유형에 image 추가)
- [src/domain/rules/toolResultSerialization.ts](../src/domain/rules/toolResultSerialization.ts) — `serializeAnswerCell` switch에 `image` case
- [src/domain/rules/toolResultAggregation.ts](../src/domain/rules/toolResultAggregation.ts) — image는 집계 미대상이나 total 계산에 포함 여부 결정
- [src/infrastructure/export/ExcelExporter.ts](../src/infrastructure/export/ExcelExporter.ts) — zip 번들 반환 타입 확장
- [src/adapters/components/Tools/Results/TableTab.tsx](../src/adapters/components/Tools/Results/TableTab.tsx) — 썸네일 셀 렌더링
- [src/adapters/components/Tools/Results/IndividualTab.tsx](../src/adapters/components/Tools/Results/IndividualTab.tsx) — 이미지 카드
- [src/adapters/components/Tools/FeedbackWall/FeedbackWallCard.tsx](../src/adapters/components/Tools/FeedbackWall/FeedbackWallCard.tsx) — 이미지 응답도 월에 카드로?

**신규 예상:**
- `electron/ipc/feedbackImage.ts` (신규) — 이미지 저장 IPC 핸들러
- `src/infrastructure/storage/feedbackImageStore.ts` (신규) — 로컬 파일 경로 관리
- `src/adapters/utils/imageProcessor.ts` (신규) — EXIF 정규화 + 리사이즈

**WebSocket 통합 지점:**
- [electron/ipc/liveMultiSurvey.ts](../electron/ipc/liveMultiSurvey.ts) — 바이너리 프레임 수신 확장
- [electron/ipc/liveMultiSurveyHTML.ts](../electron/ipc/liveMultiSurveyHTML.ts) — 학생 HTML에 업로드 UI 주입

---

## 🏗️ 아키텍처 제약 (반드시 준수)

[CLAUDE.md](../CLAUDE.md) "Clean Architecture 4-레이어" 확인 필수:

```
✅ domain/        ← 외부 의존 0. 이미지 메타 타입만 (경로는 string)
✅ usecases/      ← domain만 import. 이번 기능에는 거의 불필요
✅ adapters/      ← domain + infrastructure 호출 가능. UI 컴포넌트
✅ infrastructure/ ← domain만 import. Electron IPC, 파일 시스템, WebSocket
❌ domain → 다른 레이어 import 금지 (순수 TypeScript만)
```

**특히 주의:**
- `ImageAnswerValue` 타입은 **경로 문자열 기반** (Buffer/File 등 런타임 객체 금지)
- 이미지 파일 I/O는 전부 `infrastructure/` 또는 `electron/`
- SpreadsheetView는 `file://` 경로 렌더 시 보안 정책 확인 필요

---

## 🎨 테마 가이드 (Phase 1+2 경험 반영)

- 프로젝트 기본 테마는 **Notion 스타일 라이트** (`sp-bg: #ffffff`)
- `bg-sp-accent/70` 등 **투명도 변형 금지** — 라이트 배경에서 대비 부족
- 이미지 썸네일 테두리: `border border-sp-border`
- 라이트박스 모달: **Portal 필수** (`createPortal(document.body)`) — `transform` 조상 함정 방지 (Phase 1 검증 사례)

---

## 🧪 테스트 전략

Phase 1에서 설정한 Vitest가 그대로 사용 가능:
- **Unit test 대상:** EXIF 정규화 함수, 이미지 경로 생성 함수, zip 번들 Excel 출력
- **Integration test (선택):** WebSocket 바이너리 프레임 왕복 — Electron 필수 환경이라 수동 QA로 대체 가능
- 기존 52개 테스트가 **회귀 0**으로 유지되는지 매 수정 후 `npm test` 필수

---

## ✅ Design v0.4에 이미 반영된 Phase 3 계약

Phase 3 스텁이 구체화되어 있음:
> **Phase 3 이미지:** `MultiSurveyAnswer.value` 유니온에 `ImageAnswerValue` 추가.
> `serializeAnswerCell` switch에 case 추가 (display=파일명, raw=thumbPath).
> TableTab 셀에 `<img src={file://...thumbPath}>` 썸네일.
> `addMultiSurveySheets` 반환 형태 확장: 현재 `xlsx.writeBuffer()` 단일 →
> Phase 3에서는 `{ xlsx, images: Map<string, Buffer> }` 오브젝트로 반환,
> adapters 측에서 JSZip으로 `.xlsx + images/` 번들 zip 생성.
> Sheet 2 이미지 셀은 파일명 텍스트(`응답3_Q1.webp`) + 같은 zip 내 `images/` 경로 참조.

---

## 🚀 새 세션 첫 명령어 (추천)

새 세션에서 가장 먼저 실행할 것:

```
/pdca design 발제피드백응답모아보기
```

이미 Design v0.4가 있으므로 기존 문서를 열고 **Phase 3 본문 섹션을 추가**하는 방식으로 진행하자. 다음 항목을 확정:

1. `ImageAnswerValue` 정확한 타입 정의
2. WebSocket 바이너리 프레임 프로토콜 (opcode 또는 JSON+base64)
3. Electron IPC 핸들러 인터페이스 (`save-feedback-image`, `delete-feedback-image`)
4. Excel zip 번들 생성 라이브러리 선택 (JSZip? archiver?)
5. 설정 UI 위치 (`Settings/AppInfoSection`? 전용 섹션?)

이후 `/pdca do 발제피드백응답모아보기`로 구현 시작.

---

## 💾 정리 상태 체크

- ✅ Git: 4개 커밋 완료, 내 작업 모두 push 가능 상태
- ✅ TypeScript: 0 errors
- ✅ Tests: 52/52 passing
- ✅ Design v0.4: Phase 1+2 완료 반영, Phase 3 스텁 구체화됨
- ✅ Analysis: Phase 1(96%) + Phase 2(97%) 기록
- ✅ Report: Phase 1+2 통합 완료 보고서 존재
- 🟡 다른 개발자 WIP: `electron/ipc/liveMultiSurvey*.ts`, `Memo/*`, `Homeroom/Survey/*` 등 modified 상태 (내 변경 아님, 무시 가능)

---

## 🤔 Open Questions (새 세션에서 결정 필요)

1. **이미지 응답을 피드백 월에서도 표시할까?**
   - Pros: 시각적으로 강력한 임팩트 (Padlet 수준)
   - Cons: 구현 복잡도 증가, 파스텔 카드 톤과 어울리지 않을 수 있음
   - 초기 결정: Phase 3에서는 **테이블/개별 탭에만 우선 표시**, 월 통합은 선택적 확장

2. **이미지 업로드 중 학생 모바일 네트워크 끊김 처리?**
   - Retry 큐? Timeout 후 에러 메시지?
   - 초기 결정: **단순 에러 토스트** — 학생이 수동 재시도

3. **zip 번들 파일명 규칙?**
   - `{title}_응답모음_{date}.zip` 내에 `{title}.xlsx` + `images/응답N_QM.webp`
   - 확정 필요

4. **이미지 응답이 `required: true`일 때 미업로드 submission 처리?**
   - 빈 응답으로 제출 허용? 업로드 강제?
   - 초기 결정: **빈 응답 허용** (기존 text 질문과 동일 정책)

---

**이 문서는 Phase 3 완료 후 삭제하거나 Archive로 이동 가능합니다.**
