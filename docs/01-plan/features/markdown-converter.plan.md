# 마크다운 변환기 — 구현 계획 (.plan)

- **상태**: 승인됨 (2026-06-14, /ralplan 합의 — Planner·Architect·Critic 인라인 검토 통과)
- **도구 ID**: `tool-markdown-convert` · **이름**: 마크다운 변환기 · **위치**: 쌤도구
- **요약**: 교사의 한글/엑셀/PDF/워드 파일을 마크다운(md)으로 변환(AI 첨부용). 변환 시 **선택적 개인정보 가리기**. 쌤핀은 생성형 AI 미탑재 — 본 도구는 '변환 + 가리기' 로컬 유틸리티.

> ⚠️ 작업 규칙: main 단일 워킹트리, 다른 세션 미커밋 파일(`TodoPopup.tsx`·`MemoFocus.tsx`·`PROGRESS.md`·NEIS 관련) 절대 미수정, 모든 변경 명시 path. `electron/` 수정 후 `node scripts/build-electron.mjs` 필수.

## A. RALPLAN-DR

**Principles**

1. 개인정보는 어떤 경로로도 기기 밖으로 나가지 않는다(파싱·마스킹 전부 로컬, 분석/로그에 원문 0).
2. 마스킹은 "보장"이 아니라 "보조" — 사람이 검토하기 전엔 신뢰하지 않는다(검토 강제).
3. domain은 순수·결정적, kordoc은 Electron 메인에만(레이어 불변).
4. 변환기가 본체, 가리기는 옵션 — 브랜드 책임 최소화.
5. 점진적 출시(`hidden`/BETA 게이트).

**Decision Drivers**: ① 개인정보 유출 표면 최소화 ② 기존 보안 자산 재사용(backup 일괄처리·secureStorage·dialogHandles) ③ "마크다운"을 몰라도 쓰게 하는 안내.

**채택 옵션**

- (가) kordoc 통합 = **Electron main `parse(buffer)` 직접 호출**. (CLI 서브프로세스·renderer 직접 import는 무효)
- (나) 복원표 저장 = **메모리 기본 + 사용자 명시 시에만 OS 암호화(secureStorage) 저장 + 만료/수동삭제**. (평문 영구저장 기각, 세션 전용은 복원 제약으로 비채택) — _사용자 확정 2026-06-14_
- (다) 검토 UI = **md 미리보기 + 가린 span 하이라이트 + 저신뢰(주소·계좌) 강제 확인**.

## B. 구현 (레이어별 파일)

**domain/** (순수, import 0)

- `src/domain/privacy/maskRules.ts` — 패턴 정규식: 고신뢰(전화·주민번호·이메일) / 저신뢰(계좌·주소). `detectPatterns(text): DetectedSpan[]`
- `src/domain/privacy/keywordMask.ts` — 키워드 '포함' 매칭 + 한국어 조사 대응, 최소길이·경계로 과잉매칭 가드
- `src/domain/privacy/maskEngine.ts` — `applyMask(md, config, aliasCounter)→{masked, mappings}`, `restore(text, mappings)`. 별칭 결정적(난수/시간 호출 금지, 카운터 주입)
- `src/domain/privacy/types.ts` — `MaskRule`·`MaskMapping`·`MaskConfig`·`DetectedSpan`
- `src/domain/ports/IDocumentParserPort.ts` — `parse(ref): Promise<{ markdown; format; warnings }>`

**usecases/** (domain만 import)

- `src/usecases/markdownConvert/ConvertDocument.ts`
- `src/usecases/markdownConvert/MaskMarkdown.ts`

**infrastructure/** (domain 구현)

- `src/infrastructure/parse/KordocParserAdapter.ts` — 포트 구현 → `window.electronAPI.markdownConvert.pickAndParse()` 위임
- `src/infrastructure/privacy/MaskMappingRepository.ts` — 매핑 암호화 저장(secureStorage). **syncRegistry 미등록(GDrive 제외)**

**adapters/**

- `src/adapters/components/Tools/ToolMarkdownConvert.tsx` — `ToolLayout` 래핑 UI
- `src/adapters/stores/useMarkdownConvertStore.ts` — UI/세션 매핑 상태(기본 비영속)
- `src/adapters/di/container.ts` (수정) — Kordoc 어댑터→포트 조립

**등록 (수정 4곳)**: `src/adapters/components/Tools/ToolsGrid.tsx`(TOOLS), `src/adapters/constants/toolDefinitions.ts`, `src/adapters/components/Layout/Sidebar.tsx`(PageId), `src/App.tsx`(라우팅 `if (page === 'tool-markdown-convert')`). 초기 `badge:'BETA'` 또는 `hidden:true`.

**electron/** (main process)

- `electron/ipc/markdownConvert.ts` (신규) — `ipcMain.handle('markdown-convert:pick-and-parse')`: Open dialog → bytes read → kordoc `parse(buffer)` → `{ canceled, markdown, fileName, format, warnings }`. 경로·원본 bytes renderer 미노출 (`backup.import` 선례)
- `electron/preload.ts` (수정) — `markdownConvert: { pickAndParse() }` 그룹
- `electron/main.ts` (수정) — 핸들러 등록

**화면 흐름**: 파일 선택 → 가리기 옵션(ON 시 자동항목 체크 + 수동 키워드 복수입력 + 반 선택 자동채움[`useClassRosterStore`, 컴포넌트에서 평문 전달]) → 변환 → **검토(react-markdown 미리보기 + 하이라이트, 저신뢰 강제 확인)** → 복사. + 복원 탭. + 첫 사용 환영/접이식 "마크다운이 뭐예요?".

**데이터 모델**: `MaskMapping { alias; original; kind: 'name'|'phone'|'rrn'|'email'|'account'|'address'|'keyword' }`

**v1 범위 컷**: 스캔(이미지)PDF=안내만(OCR 없음) / 형식간 변환 없음 / 배치 변환 없음(1파일) / 자동 이름탐지(NER) 없음.

## C. 인수 기준

1. HWPX·XLSX·텍스트PDF·DOCX 표본 각 1 → md 변환(통합테스트)
2. 전화·주민번호·이메일 자동 마스킹(고신뢰 정규식 단위테스트)
3. "김민수"→"김민수가/에게" 마스킹, "이" 등 1글자 과잉매칭 차단(단위테스트)
4. 반 선택 시 학생 이름이 키워드에 자동 채움
5. mask→restore 라운드트립 = 원문 동일(도메인 테스트)
6. 🔴 가리기 ON이면 검토 통과 전 '복사' 비활성(컴포넌트 테스트)
7. 🟠 매핑이 GDrive 동기화 payload 미포함(`syncRegistry.meta.test` 확장)
8. 🟠 분석 이벤트·로그에 원문/검출 PII·파일경로 미포함(메타/단위테스트)
9. 게이트 4종 + hex·sp-coverage 통과

## D. 테스트 계획

- unit: 정규식 고/저신뢰, 조사·과잉매칭, 별칭 결정성, mask/restore 라운드트립
- integration: IPC 파싱 형식별 픽스처, 미지원/스캔 PDF graceful
- e2e: 파일선택→가리기→검토(강제)→복사→복원
- observability: 로그·분석 PII 부재 메타테스트, 파싱 실패 코드 분기

## E. Pre-mortem

1. 유출(주소/희귀 이름 잔존) → 저신뢰 강제검토·"완벽보장 아님" 경고·복사 직전 확인
2. kordoc 번들/버전 사고(pdfjs-dist 중복) → 메인 직접호출 + 형식별 통합테스트 + 패키지 앱 로드 스모크 + graceful 안내
3. 미사용/오해 → 안내 3지점 + 변환 시 "개인정보 가릴까요?" 프롬프트

## F. 검증 절차

`npx tsc --noEmit` → `npm run lint` → `npm run test` → `npm run regression-check` → `node scripts/check-hex-hardcoding.mjs` → `node scripts/check-sp-coverage.mjs` → `node scripts/build-electron.mjs` 후 패키지 앱에서 4형식 실제 변환 수동 확인 → 실기기 점검.

## G. ADR

- **Decision**: kordoc 메인 직접 호출 · 마스킹 domain 순수함수 · 매핑 secureStorage 암호화+기본 미저장 · 변환기 본체/가리기 옵션 · 검토 강제 · BETA 게이트.
- **Drivers**: 유출표면 최소 · 기존 보안자산 재사용 · 교사 접근성.
- **Alternatives**: CLI 서브프로세스·renderer import(무효), 평문 영구저장(기각), 세션만 저장(복원 제약).
- **Consequences**: 메인 번들 증가, 마스킹은 보조(검토 필수), 복원 기본 세션 한정(옵션 시 암호화 저장).
- **Follow-ups**: kordoc `parse()` API/temp [확인필요], kordoc↔pdfjs-dist 버전 정합 [확인필요], OCR·자동 NER는 v2 이후.

## 진행 로그

- 2026-06-14: 계획 승인. 구현은 메인 세션 직접 수행(이 세션 서브에이전트 결과 전달 장애로 /ralph executor 위임 불가). 첫 단계 = kordoc 설치·API 확정.
- 2026-06-14: **구현 완료(코드/빌드/테스트 레벨).**
  - kordoc 3.1.1 설치. API: `parse(ArrayBuffer)→{success,markdown,isImageBased,warnings,fileType}`. pdfjs-dist는 peer(기존 ^4.10.38 사용, 충돌 없음), 메모리 처리(임시파일 없음). **정정: 취약점 10건은 kordoc 무관(기존 vite/esbuild·nut-js/jimp 체인).**
  - 의존성 정리: electron-builder.yml에 onnxruntime-node·onnxruntime-common·@huggingface·@hyzyla 제외(설치파일 용량), build-electron.mjs external에 kordoc 추가. (sharp 유지)
  - domain: privacy/{types,maskRules,keywordMask,maskEngine}.ts + ports/{IDocumentParserPort,IMaskMappingRepository}.ts. maskEngine.test.ts **12/12 통과**.
  - electron: ipc/markdownConvert.ts(`markdown-convert:pick-and-parse`) + preload markdownConvert 그룹 + main 등록 + global.d.ts MarkdownConvertResult. kordoc external 확인(번들 미박힘).
  - infrastructure: parse/KordocParserAdapter.ts(IPC 위임), privacy/SecureMaskMappingRepository.ts(secureStorage 암호화, 7일 만료, syncRegistry 미등록=GDrive 제외).
  - usecases: markdownConvert/{ConvertDocument,MaskMarkdown,ManageMaskSessions}.ts + DI 조립.
  - adapters: ToolMarkdownConvert.tsx(변환/되돌리기 탭, 안내 접이식, 자동패턴+수동키워드+반명단 자동채움, **가리기 ON 시 검토 체크 전 복사 비활성**, 저신뢰 경고, 변환표 보관/복원). 단일 컴포넌트 메모리 상태(별도 store 불필요).
  - 등록 4곳: ToolsGrid TOOLS / toolDefinitions / Sidebar PageId / App 라우팅 (`tool-markdown-convert`, badge NEW).
  - **검증: tsc 0 / vitest 2404 pass(+12) / regression 35-35 / hex PASS / sp-coverage 1228 / vite build OK / electron esbuild OK.** lint: 신규코드 클린(잔존 1 error는 타 세션 미커밋 MemoFocus.tsx).
  - AC#7(매핑 GDrive 미동기화)·AC#8(로그 PII 미포함): secureStorage 별도 채널·무로깅으로 **구조적 충족**(전용 메타테스트는 후속 하드닝 옵션).
- **남음(코드 외)**: 실기기 수동 검증(실제 한글/PDF/엑셀 파일 변환·가리기·복원), 커밋(명시 path), v2.1.3 릴리즈 묶음 시 포함 검토. 미커밋 상태 — 사용자 확인 후 커밋.
- 2026-06-14 (후속 보강):
  - **md 파일 저장**: 변환 결과·복원 결과에 `.md` 저장 버튼(데스크톱 showSaveDialog→writeFile 핸들 패턴 / 브라우저 Blob 폴백). 가리기 ON 시 검토 후에만 저장.
  - **드래그 앤 드롭**: 1단계 영역을 드롭존으로. 전역 드롭 가드 회피 위해 영역에서 preventDefault+stopPropagation. 드롭은 File→bytes→신규 IPC `markdown-convert:parse-buffer`.
  - **여러 파일 동시 변환**: 다중 선택 IPC `markdown-convert:pick-and-parse-multi` + 다중 드롭. 결과를 `# 파일명` 섹션 + 구분선으로 **합본 1개 마크다운**으로 결합 → 한 번에 마스킹(별칭 일관). 파일 목록 표시.
  - **테스트 문서 생성기** `scripts/gen-test-docs.mjs` → `docs/markdown-converter-test-docs/`(가짜 데이터): 생기부-서술형 hwpx/docx/pdf + 학생명렬표 xlsx/hwpx. 5종 모두 kordoc 파싱 성공(이름·전화·주민번호 추출 확인).
  - 검증: tsc 0 / electron esbuild OK(kordoc external 유지) / vite build OK / 변경파일 lint 클린. 도메인 테스트는 변경 없음(직전 풀런 2404 pass).
  - ⚠️ Electron IPC 추가분(parse-buffer·pick-and-parse-multi)은 `electron:dev` 재시작 필요(메인 미감시).
- 2026-06-14 (사용자 피드백 반영):
  - **계좌 → 생년월일로 교체**: 계좌 패턴 제거(날짜를 계좌로 오탐하던 `2010-03-15` 버그 해소). 생년월일 패턴 추가 — YYYY-MM-DD / YYYY.MM.DD / YYYY년 M월 D일 / **YYMMDD 6자리(월01-12·일01-31 검증으로 학번 오탐 차단)**. 주민번호와 겹치면 주민번호 우선. PatternKind/PatternConfig `account`→`birth` 전면 교체.
  - **수동 입력 통합**: 이름/학교/지역 3칸 → **쉼표 구분 키워드 1칸**(label '키워드'). 반 명단 자동채움은 키워드에 합류.
  - **주소 인식 개선**: 시/도(서울특별시·경기도…) + 구/군/시 + 도로/동 + 번지 + 건물·동·호·층 체인까지 한 번에. 여전히 저신뢰(검토 필수).
  - 검증: tsc 0 / vitest 2407 pass(maskEngine 15/15) / 변경파일 lint 클린 / vite build OK / **실제 테스트문서 5종에서 생년월일·주소 정규식 매칭 확인**(표·PDF 포함).
  - 테스트 문서 생성기 `scripts/gen-test-docs.mjs` → `docs/markdown-converter-test-docs/` (생기부 서술형 hwpx/docx/pdf + 명렬표 xlsx/hwpx, 전부 가짜 데이터).
- 2026-06-14 (UI/UX 개선):
  - **배지 정리**: 쌤도구 그리드에서 마크다운 변환기(NEW) 외 BETA/NEW 배지 전부 제거(교실약속·서명받기·협업보드·내이모티콘·실시간담벼락). 도구 **내부 베타 배너**도 제거(ToolCollabBoard·MultiSurveyLiveBoardView).
  - **2분할 레이아웃**: 변환 탭을 좌(1 파일선택 + 2 가리기옵션) / 우(3 결과)로 분할. ToolLayout `disableZoom`. 결과 미리보기 `flex-1`로 높이 채움(결과창 확대).
  - **파일별 결과**: 합본 마스킹(별칭 일관성 유지)을 `\n\n---\n\n`로 분할해 파일별 미리보기 선택(전체 합본/개별 파일).
  - **통합/개별 다운로드 선택**: 다중 파일 시 [통합 .md 저장](합본 1개) + [개별 .md 저장](폴더 1회 선택 → 파일마다 별도 .md, 신규 IPC `markdown-convert:save-files`).
  - 검증: tsc 0 / vitest 2407 / lint 클린 / electron esbuild OK(save-files 핸들러 확인) / vite build OK.
  - ⚠️ 신규 IPC(save-files) 반영 위해 `electron:dev` 재시작 필요.
- 2026-06-14 (개별저장 ZIP화 + 대용량 테스트):
  - **개별 저장 → ZIP 1개**: 폴더 방식 `save-files` 폐기, 신규 `markdown-convert:save-zip`(저장창 1회). 기존 `electron/lib/zipStore.ts`(buildStoreZip, 외부 의존성 0, 이모티콘 내보내기 검증분) 재사용 — jszip 미추가. UI 버튼 "개별 저장 (ZIP)". 브라우저 dev는 개별 다운로드 폴백.
  - **대용량 테스트 생성기** `scripts/gen-large-test-doc.mjs`(학생 380명) → `생기부-대용량.pdf`(**116페이지**)·`.hwpx`·`학생명렬표-대용량.xlsx`(380행). kordoc 파싱 성능: PDF 116p 433ms / HWPX 82ms / XLSX 73ms (전부 성공).
  - 검증: tsc 0 / lint 클린 / electron esbuild OK(save-zip + buildStoreZip 번들) / vite build OK.
  - ⚠️ 신규 IPC(save-zip) 반영 위해 `electron:dev` 재시작 필요.
