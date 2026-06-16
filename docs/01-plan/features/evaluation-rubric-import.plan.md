# 수행평가 운영계획 → 루브릭 불러오기 (Evaluation Plan → Rubric Import)

> 상태: **pending approval** (ralplan 합의 완료: Planner → Architect 조건부 → 5개 반영 → Critic APPROVE)
> 범위: "수업관리 > 수행평가" 탭에서 **학교 공식 평가 운영계획 hwp를 자동 파싱해 루브릭 초안으로 불러오기**.
> **진도표(CurriculumProgress) 매핑은 범위에서 제외** (의도적).
> 작성: 사전 조사 세션 핸드오프. 추측 금지로 실제 소스를 읽고 검증한 결과만 기재.

---

## 0. 한 줄 요약

교사가 백지에서 입력하던 수행평가 루브릭을, **학교가 학교알리미에 올린 "교과별 교수·학습 및 평가 운영 계획" hwp**에서 자동으로 평가요소 이름까지 채운 **초안**으로 가져온다. 점수(척도)는 문서에 없으므로 교사가 입력한다.

---

## 1. 환경 세팅

- **구현 대상 프로젝트**: `E:\github\ssampin` (Clean Architecture, Electron 40 + React 18 + TS + Tailwind + Zustand, GPL-3.0)
- **이식 원본 (참조용, 읽기 전용)**: `E:\github\schoolinfo-mcp` (이 핸드오프와 함께 `git clone --depth 1 https://github.com/chrisryugj/schoolinfo-mcp` 로 받아둠. MIT 라이선스 — GPL 프로젝트에 코드 포함 가능, 출처/공공누리 제1유형 표기 유지)
  - 핵심 파일: `src/evaluation.ts`(다운로드/파싱/구조화), `src/client.ts`(`searchSchoolsByName` 학교식별자), `src/lib/fetch-with-retry.ts`, `src/codes.ts`
- **빌드/실행 명령** (package.json 확인됨):
  - 개발: `npm run electron:dev`
  - 타입체크: `npm run typecheck`
  - 린트: `npm run lint`
  - 테스트: `npm test` (vitest)
  - 빌드: `npm run electron:build`
- **추가 의존성 (P1에서 설치)**: `npm i iconv-lite` (electron main의 EUC-KR HTML 디코딩용). `kordoc`·`undici`·`zod`는 이미 설치됨.
- **인증/식별자**:
  - 학교명 전국검색 `searchSchoolsByName` = **인증키 불필요** (학교알리미 내부 AJAX). 여기서 `shlIdfCd`(학교알리미 학교식별자) 확보.
  - 평가계획 파일 다운로드 = `SCHOOLINFO_API_KEY` 필요한 식별자 흐름. **앱 번들 키 1개 + rate limit** 권장 (키 재배포 약관은 P1에서 확인 필요 — 미검토 리스크).
  - 주의: 쌤핀이 쓰는 NEIS 식별자(`atptCode`/`SD_SCHUL_CODE`)와 학교알리미 `shlIdfCd`는 **다름**. 브리지 필요(§9-C).

---

## 2. 확인된 근거 — 쌤핀 측 (재조사 불필요)

### 2.1 수행평가 화면 (이식 진입점)

- `src/adapters/components/ClassManagement/Rubric/ClassRubricTab.tsx`
  - 헤더에 `+ 새 루브릭` 버튼 1개 → `handleNewRubric()` → `setBuilderTarget('new')` → `RubricBuilderModal`.
  - 상태: `const [builderTarget, setBuilderTarget] = useState<'new' | Rubric | null>(null)`.
  - **기존 루브릭 편집 경로 존재**: `RubricCard` ⋮메뉴 `onEdit(r)` → `setBuilderTarget(r)` (저장된 Rubric을 빌더에 채워서 엶). ← **초안 주입의 단서**.
  - 한도 가드: `canAddRubric`, `MAX_RUBRICS_PER_CLASS`(수업반당 10개), 빈상태 안내 + CTA.
  - 모달 렌더: `builderTarget !== null && <RubricBuilderModal classId rubric={builderTarget==='new'?undefined:builderTarget} .../>`
- `src/adapters/components/ClassManagement/Rubric/RubricCopyModal.tsx` ← **불러오기 UX 템플릿** (그대로 변주)
  - 공통 `@adapters/components/common/Modal`, `IconButton`, `useToastStore` 사용.
  - 구조: 헤더(제목+부제+닫기) / 스크롤 본문(체크박스 카드 목록) / 푸터(안내문 + 액션버튼). `selectedIds` 다중선택, copying 상태, 결과 토스트.
- 참고 모달(검색+그룹+체크): `src/adapters/components/Calendar/NeisSyncSelectModal.tsx` (검색창 필터 패턴).
- 그 외 Rubric 폴더: `RubricBuilderModal.tsx`(생성/수정), `RubricGradingView.tsx`(채점), `RubricExportModal.tsx`, `RubricFeedbackModal.tsx`.

### 2.2 루브릭 도메인/유스케이스/저장

- `src/domain/entities/Rubric.ts`:
  - `Rubric { id; classId; title; description?; criteria: RubricCriterion[]; createdAt; updatedAt }`
  - `RubricCriterion { id; name; order; levels: RubricLevel[] }`
  - `RubricLevel { id; name; score; description? }`
  - `RubricsData { rubrics: Rubric[]; gradings: RubricGrading[] }`
- `src/usecases/rubric/ManageRubrics.ts`:
  - `createRubric(current, rubric)` → `canAddRubric` 10개 한도 + `validateRubric` 후 `repository.save`. (★루브릭 생성 진입점 — 재사용)
  - `updateRubric`, `copyRubric`, `deleteRubric`, `upsertGrading`.
- `src/domain/repositories/IRubricRepository.ts`: `load(): Promise<RubricsData|null>` / `save(data): Promise<void>` (로컬 JSON 'rubrics' 키).
- `src/domain/rules/rubricRules.ts`: `validateRubric`, `canAddRubric`, `MAX_RUBRICS_PER_CLASS`, `calculateMaxScore`, `copyRubricToClass`, `IdGenerator` 등.
- 상태: `@adapters/stores/useRubricStore` (zustand). 유스케이스는 "현재+변경→다음" 순수 흐름.

### 2.3 매핑 키 (과목)

- `src/domain/entities/TeachingClass.ts`:
  - `TeachingClass { id; name; subject; groupId?; students: TeachingClassStudent[]; ... }` ← **`subject`가 평가계획 과목 매핑 키**.
  - `TeachingClassStudent { number; name; grade?; classNum?; ... }` ← 학년 기본값 소스.
- `Rubric.classId = TeachingClass.id`.

### 2.4 문서 파싱 = 이미 존재 (★ kordoc 신규개발 0)

- `src/infrastructure/parse/KordocParserAdapter.ts` implements `IDocumentParserPort` (`@domain/ports/IDocumentParserPort`).
  - **electron main에서 kordoc 파싱**, renderer엔 결과 md만 전달.
  - 노출 API: `window.electronAPI.markdownConvert` — `pickAndParse()`, `pickAndParseMulti()`, **`parseBuffer(bytes: Uint8Array, fileName: string)`** ← 다운로드한 hwp bytes를 여기 넘기면 md 변환.
  - 반환 RawResult: `{ status:'ok'; fileName; markdown; format; isImageBased; warnings; metadata?; outline?; textQuality?{ needsReview; reason:'image_based'|'low_text'|... } }` ← `isImageBased`/`needsReview`가 schoolinfo `needsOcr`과 대응.
  - main 핸들러: `electron/ipc/markdownConvert.ts`.

### 2.5 외부 통신 보안 (SSRF 방어, main 전용)

- `electron/security/safeFetch.ts`:
  - 함수: `resolveAndVetHost(hostname)`(DNS+사설IP 차단), `pinDispatcher(vetted, timeoutMs)`(DNS rebinding 차단 undici Agent), `fetchSingleHop(url, timeoutMs, maxBytes, acceptHeader)` **(method:'GET' 하드코딩 L196)**, `fetchFollowingRedirects(...)`, `safeFetchText(rawUrl, opts)` (GET·텍스트·기본 1MiB).
  - 이미 계층화돼 있어 method/body/maxBytes 파라미터화가 자연스러움.

### 2.6 외부데이터 연동 레퍼런스 (NEIS)

- `src/infrastructure/neis/NeisApiClient.ts` implements `INeisPort`(`@domain/ports/INeisPort`).
  - NEIS는 **렌더러 직접 fetch** (GET·JSON·CORS허용; `isElectron`이면 `open.neis.go.kr/hub` 직접, dev면 Vite 프록시).
  - ⚠️ 평가계획은 이 패턴을 **못 씀** (§4 참조).
- 학교 검색 유스케이스: `src/usecases/school/SearchSchool.ts` (②번 온보딩과 공유).
- 저장 추상화: `src/infrastructure/storage/{ElectronStorageAdapter,IndexedDBStorageAdapter,LocalStorageAdapter}.ts`.
- DI: `src/adapters/di/container.ts`.

---

## 3. 확인된 근거 — schoolinfo-mcp `src/evaluation.ts` (이식 원본)

타입:

- `EvaluationFile { seq: string; filename: string; sizeKB?: number }` (파일명 파싱 안 함 — 원본 문자열)
- `EvaluationResult { filename; fileType; markdown; evaluationSections: string[]; needsOcr? }`
- `GradeOverview { grade: number|null; label: string; subjects: string[]; tableHtml: string; details?: Record<string,string> }`
- `StructuredEvaluation { grades: GradeOverview[]; allSubjects: string[] }`

함수:

- `listEvaluationDocs(school, year?) → { docs: EvaluationFile[]; downloadParams; year }` (year 미지정 시 [올해, 작년])
- `fetchEvaluationFiles(shlIdfCd, schoolName, year?)` → POST 목록 (서버 파라미터 `JG_YEAR`/`CHOSEN_JG_YEAR`/`PRE_JG_YEAR`)
- `downloadEvaluationFile(downloadParams, seq)` → 바이너리 GET (`/servlets/EiFileDownLoad.do?FILE_SEQ=n`, ≤50MB)
- `parseEvaluationDocument(input, filePath?)` → kordoc parse (쌤핀에선 **이거 대신 `markdownConvert.parseBuffer` 사용**)
- `extractEvaluationSections(markdown) → string[]` (순수, "수행평가"/"평가기준" 블록)
- `structureEvaluation(markdown) → StructuredEvaluation | null` (순수; 학년=`/([1-6])\s*학년[^0-9]{0,10}(?:평가|운영)/`, 과목=SUBJECTS 상수, **"한 학년 전과목 종합표(과목≥5)"만** 구조화, 2MB 초과 null)
- `autoFetchEvaluation(school, year?, opts?{all?, seq?})` → `EvaluationResult[]`

**중요한 데이터 특성** (선택 UI 설계 근거):

- **학년도(year)**: 서버 `JG_YEAR` → 다운로드 **전** 확정 가능.
- **파일(seq)**: 한 학년도에 여러 첨부. **코드는 파일명 파싱 안 함** → 학교가 "1학년*국어*…hwp"로 지었으면 교사가 눈으로 식별.
- **학년(1~6)**: 본문 정규식 추출 → 파싱 **후**.
- **과목**: SUBJECTS 상수, 종합표(과목≥5)만 → 파싱 후.
- **학기**: **구조화 안 함** (표 HTML 내 rowspan으로 존재만). → 반자동.
- **학교 유형 2종**: (A) 과목별 분리 파일(structureEvaluation이 구조화 안 함, 원문 표) / (B) 통합 1파일(grades[]로 분해).

---

## 4. 아키텍처 결정 (ADR)

- **Decision**: schoolinfo `evaluation.ts`의 **다운로드·EUC-KR 로직만 electron main에 신설**. 파싱은 기존 `markdownConvert.parseBuffer` 재사용. **평가영역명 추출은 "md표→텍스트" 순수 파서를 신규** 작성. 루브릭 생성은 기존 `ManageRubrics`. UI는 `RubricCopyModal` 패턴 모달 1개.
- **Drivers**: ⓐ평가계획은 POST·바이너리(≤50MB)·EUC-KR → 렌더러는 **CORS + 쌤핀 보안정책(safeFetch=main)상 부적합** (기술적 불가가 아니라 정책상 강제; `webSecurity`를 끄는 우회는 더 큰 보안 후퇴라 금지). ⓑ`parseBuffer` 기존재 → 파싱 0개발. ⓒ선택축 비대칭(§3).
- **Alternatives (기각)**:
  - B) 렌더러 직접 호출(NeisApiClient 모방): CORS + 보안정책으로 기각.
  - C) 뷰어 전용(루브릭 자동생성 없음): 핵심 가치 부족 → **A의 Phase 3로 흡수**.
  - structureEvaluation 전체 이식해 `tableHtml`을 도메인에 사용: **HTML이 도메인 오염** → 기각. tableHtml은 표시용으로만(선택).
- **Consequences**: (+)신규코드 최소·보안회귀0·도메인 청결(텍스트만 추출)·정직한 자동화. (−)electron IPC 보안표면 1개 신설·학기 반자동·추출 정확도 양식 의존. `shlIdfCd` 브리지가 ②(학교검색)와 결합.

---

## 5. 데이터 흐름

```
[렌더러] 수업반 컨텍스트(현재 TeachingClass.subject / students[].grade = 기본값)
  → usecase: ImportEvaluationPlan
    → port: IEvaluationPlanPort (domain/ports)
      → adapter: SchoolInfoEvaluationAdapter (infrastructure/schoolinfo, 얇음)
        → window.electronAPI.schoolinfoEvaluation.{resolveSchoolId, listDocs, downloadDoc}
          → [electron main] ipc/schoolinfoEvaluation.ts
               resolveSchoolId: searchSchoolsByName (인증키 불필요) → shlIdfCd
               listDocs: POST 목록(JG_YEAR) → EvaluationFile[]
               downloadDoc: 바이너리 GET(≤50MB) via safeFetchBytes(host 화이트리스트)
          → bytes → markdownConvert.parseBuffer(bytes, fileName) → { markdown, isImageBased, textQuality }
  → 순수: evaluationTableParser.ts ("md표 → {subject, grade, areas:{name, ratio?, semester?}[]}")
  → 교사 선택(학년도/파일/학년/과목/학기/항목)
  → 순수: evaluationPlanMapping.planToRubricDraft → Rubric(criteria[].name 채움, levels=placeholder)
  → RubricBuilderModal(초안 prefill, 점수 비움) → 교사 점수 입력
  → ManageRubrics.createRubric (canAddRubric + validateRubric) → useRubricStore
```

핵심 경계: **다운로드+인코딩 = main**, **파싱 = 기존 재사용**, **표 추출·매핑 = 순수함수(테스트 집중)**, **저장 = 기존 유스케이스**.

---

## 6. 선택 UI 흐름 (RubricCopyModal 패턴)

진입점: `ClassRubricTab` 헤더의 `+ 새 루브릭` 옆에 보조 버튼 `📥 평가계획에서 불러오기` + 빈상태 CTA.

1. **학년도** 드롭다운(기본 올해) → `JG_YEAR`로 `listDocs`.
2. **파일 선택 + 검색**: `EvaluationFile[]` 목록(파일명 원본 표시). 파일명 검색 필터(NeisSyncSelectModal 패턴). **수업반 `subject`를 기본 검색어**로.
3. **(파싱 후) 학년·과목 좁히기**: 통합형(B)=`structureEvaluation.grades[]` 드롭다운(수업반 grade/subject 기본 선택); 분리형(A)=라벨 고정 + 원문 표 뷰.
4. **학기**: 표에 학기열 인식 시 `전체/1학기/2학기` 칩; 미인식 시 칩 숨김 + "학기 구분이 명확하지 않아요. 항목을 직접 확인해 주세요" 안내.
5. **항목 체크**: 평가영역 체크박스 → `N개 가져오기`.
6. **빌더 진입**: 항목 채워진 `RubricBuilderModal`(점수 비움) → 교사 점수 입력 → 저장.

---

## 7. 레이어별 작업 (N 신규 / M 수정 / R 재사용)

- domain:
  - N `src/domain/ports/IEvaluationPlanPort.ts`
  - N `src/domain/entities/EvaluationPlan.ts`
  - N `src/domain/services/evaluationTableParser.ts` (★순수: md표 → 평가영역명. 핵심 테스트)
  - N `src/domain/services/evaluationPlanMapping.ts` (★순수: → Rubric 초안)
- usecases:
  - N `src/usecases/evaluation/ImportEvaluationPlan.ts`
  - N `src/usecases/evaluation/ApplyPlanToRubricDraft.ts`
- infrastructure:
  - N `src/infrastructure/schoolinfo/SchoolInfoEvaluationAdapter.ts` (IEvaluationPlanPort 구현, electronAPI 호출)
  - R `src/infrastructure/parse/KordocParserAdapter.ts` (parseBuffer 그대로)
- electron:
  - N `electron/ipc/schoolinfoEvaluation.ts` (resolveSchoolId/listDocs/downloadDoc; POST목록·바이너리·`iconv-lite` EUC-KR; evaluation.ts 이식)
  - M `electron/security/safeFetch.ts` (SSRF 코어 `resolveAndVetHost`/`pinDispatcher` 유지; `fetchSingleHop`에 method/body 파라미터화; `safeFetchBytes(url,{method,body,maxBytes,allowedHosts,acceptHeader})` 신규. host 화이트리스트=`www.schoolinfo.go.kr`, 50MB, 303 처리)
  - M `electron/preload.ts` (`electronAPI.schoolinfoEvaluation` 노출)
  - M `electron/main.ts` (ipcMain 핸들러 등록)
- adapters:
  - N `src/adapters/components/ClassManagement/Rubric/RubricImportFromPlanModal.tsx`
  - M `ClassRubricTab.tsx` (헤더 버튼 + 빈상태 CTA + builderTarget에 초안 주입)
  - M `RubricBuilderModal.tsx` (초안 prefill 수용 — §9 선결조건)
  - M `src/adapters/di/container.ts` (포트/어댑터/유스케이스 등록)
- deps: N `iconv-lite`

---

## 8. 핵심 인터페이스 초안

```typescript
// domain/entities/EvaluationPlan.ts
export interface EvaluationPlanDoc {
  readonly seq: string;
  readonly filename: string;
  readonly sizeKB?: number;
}
export interface EvaluationArea {
  readonly name: string;
  readonly ratio?: string;
  readonly semester?: '1' | '2' | null;
}
export interface EvaluationPlanGrade {
  readonly grade: number | null;
  readonly label: string;
  readonly subjects: readonly string[];
  readonly areasBySubject: Readonly<Record<string, readonly EvaluationArea[]>>;
}
export interface ParsedEvaluationPlan {
  readonly filename: string;
  readonly markdown: string; // 뷰어 표시용 (parseBuffer 결과)
  readonly grades: readonly EvaluationPlanGrade[]; // 통합형일 때
  readonly isSingleSubject: boolean; // 분리형 여부
  readonly needsOcr: boolean; // isImageBased || textQuality.needsReview
}

// domain/ports/IEvaluationPlanPort.ts
export interface IEvaluationPlanPort {
  resolveSchoolId(schoolName: string): Promise<{ shlIdfCd: string; name: string } | null>; // searchSchoolsByName
  listDocs(
    shlIdfCd: string,
    schoolName: string,
    year: number,
  ): Promise<readonly EvaluationPlanDoc[]>;
  downloadAndParse(
    shlIdfCd: string,
    schoolName: string,
    doc: EvaluationPlanDoc,
  ): Promise<ParsedEvaluationPlan>;
}

// domain/services/evaluationPlanMapping.ts (순수)
export function planToRubricDraft(
  grade: EvaluationPlanGrade,
  subject: string,
  classId: string,
  pickedAreaNames: readonly string[],
  genId: IdGenerator,
  now: string,
): Rubric; // criteria[].name = 평가영역명; levels = [placeholder 1수준] (validateRubric 최소 통과); title = `${subject} — …`
```

---

## 9. 선결조건 / 미검증 가정 (구현 0순위로 확인)

- **A.** `RubricBuilderModal.tsx`를 읽어 **초안 prefill 가능성** 확정.
  - 권장: `builderTarget` 타입을 `'new' | Rubric | { kind:'draft'; rubric: Rubric } | null`로 확장하고, 빌더가 draft를 받으면 **createRubric 경로**(미저장)로 저장.
  - prefill 불가 시 폴백: 가져오기 즉시 `createRubric` + 토스트 "점수를 입력하세요" + 카드에 '미완성' 배지. (단 취소 시 잔존/한도 소모 단점 명시)
- **B.** `evaluationTableParser`는 `tableHtml`을 도메인에 **넣지 말 것**. `parseBuffer` markdown의 표를 파싱해 평가영역명만 텍스트로 추출. 표시는 markdown 그대로.
- **C.** `shlIdfCd` 브리지: `resolveSchoolId`가 `searchSchoolsByName`(인증키 불필요)을 호출. ②(온보딩 학교검색)와 공유 — 가능하면 ② 먼저/동시 진행.
- **D.** 인증키 번들 약관(키 재배포 가능 여부) 확인.

---

## 10. 실행 순서 (Phase)

0. **선결**: §9-A `RubricBuilderModal.tsx` 읽기 → prefill 경로 확정. `npm i iconv-lite`.
1. **P1 main 파이프라인**: `safeFetchBytes` + `ipc/schoolinfoEvaluation.ts`(resolveSchoolId/listDocs/downloadDoc) + preload/main. 검증: 실학교 1곳 hwp가 `parseBuffer`로 md가 되는지.
2. **P2 추출/매핑(순수)**: `evaluationTableParser.ts` + `evaluationPlanMapping.ts` + 픽스처 단위테스트.
3. **P3 포트/어댑터/유스케이스 + 뷰어 모달**: 학년도→파일검색→파싱→뷰어. **여기까지 독립 출시 가능**.
4. **P4 루브릭 초안화**: 학년·과목·학기 선택 → 빌더 prefill → `createRubric`. 한도·검증 가드 재사용.

---

## 11. 수용 기준 (테스트 가능)

- AC1: 학년도 선택 시 그 해 파일 목록 표시(없으면 "해당 연도 파일 없음").
- AC2: 통합형 hwp에서 학년·과목 선택 후 "가져오기" → 선택 평가영역이 `criteria[].name`으로 채워진 빌더가 열림.
- AC3: 분리형(단일과목) 파일은 학년·과목 라벨 고정 + 원문 표 + 항목 선택 가능.
- AC4: `isImageBased`/`needsReview`면 "이미지 문서 자동추출 불가 — 원문 보기" 폴백(크래시 없음).
- AC5: 수업반당 10개 한도/`validateRubric` 작동, 점수 미입력 루브릭도 저장·후수정 가능.
- AC6: main 다운로드가 화이트리스트 외 호스트 / >50MB / 사설IP 거부(SSRF 회귀).
- AC7: md표 파서가 표준 양식에서 평가영역명 ≥90% 추출, 추출 0건이면 뷰어 폴백.
- AC8: 다운로드 취소(AbortController) 시 리소스 정리.

---

## 12. 검증 / 테스트

- 단위: `evaluationTableParser.test.ts`, `evaluationPlanMapping.test.ts` (고정 md → 스냅샷). `safeFetchBytes` SSRF 차단 테스트.
- **픽스처**: `tests/fixtures/`에 통합형·분리형·이미지형 샘플(hwp 또는 parseBuffer 출력 md) 고정. **실학교 의존 금지**(재현성).
- 통합: `electronAPI` 목으로 어댑터 계약 테스트.
- 회귀: 기존 `npm test` green 유지, `npm run typecheck` 0 에러.

---

## 13. 리스크 / 완화

- 양식 다양성(`structureEvaluation` null / 표 추출 실패) → 원문 markdown 뷰어 폴백(AC4·AC7 동일 경로).
- 학기 미구조화 → 반자동(칩 or 안내). 과장 금지.
- 새 IPC 보안표면 → safeFetch SSRF 방어 재사용 + host 화이트리스트 + 50MB cap + 303 처리.
- 인증키/식별자 → 번들 키 1개 + rate limit + storage 캐시(키: `shlIdfCd+year+seq`, TTL).
- 대용량 표 렌더(모바일/위젯) → 뷰어 가상화/접기.

---

## 14. 절대 하지 말 것 (Scope Guard)

- ❌ 진도표(CurriculumProgress) 매핑 (이번 범위 아님).
- ❌ `tableHtml`(HTML)을 도메인 엔티티/`criteria[]`에 직접 주입 (도메인 오염).
- ❌ 렌더러에서 학교알리미 직접 호출 / `webSecurity` 끄기 (보안 후퇴).
- ❌ 평가계획에서 점수(RubricLevel.score)를 자동 채운 척하기 (문서에 없음 — 교사 입력).
- ❌ 실학교 네트워크에 의존하는 테스트 (픽스처 사용).
- ❌ 승인 전 임의 범위 확장.

---

## 15. 참고 (사전 조사 출처)

- schoolinfo-mcp: https://github.com/chrisryugj/schoolinfo-mcp (로컬 clone: `E:\github\schoolinfo-mcp`)
- 데이터 출처: 학교알리미(schoolinfo.go.kr) 공공누리 제1유형, NEIS(open.neis.go.kr)
- 관련 후속: ② 온보딩 학교 자동검색(위도·경도→날씨, 개교기념일→DDay) — `shlIdfCd` 브리지 공유. ③ 학생수·학급규모→좌석 기본값.
