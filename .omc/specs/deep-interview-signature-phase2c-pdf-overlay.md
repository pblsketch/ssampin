# Deep Interview Spec: 쌤핀 서명받기 Phase 2C — PDF 오버레이 기반 서명 시스템

## Metadata

- **Interview ID**: di-signature-phase2c-pdf-overlay
- **Rounds**: 10 (R0 topology + R0.5 policy + R1~R10 Socratic + post-R5 reopen)
- **Final Ambiguity Score**: 18% (target ≤ 20%)
- **Type**: brownfield (E:/github/ssampin, Phase 2B 직후)
- **Generated**: 2026-05-28
- **Threshold**: 0.20
- **Threshold Source**: default (no `omc.deepInterview.ambiguityThreshold` in settings)
- **Initial Context Summarized**: no
- **Status**: PASSED
- **Challenge Modes Used**: contrarian (R4), simplifier (R6). Ontologist 미발동 (ontology 100% stable from R5).

## Clarity Breakdown

| Dimension | Score (min) | Weight | Weighted |
|-----------|-------------|--------|----------|
| Goal Clarity | 0.85 | 0.35 | 0.2975 |
| Constraint Clarity | 0.85 | 0.25 | 0.2125 |
| Success Criteria | 0.75 | 0.25 | 0.1875 |
| Context Clarity | 0.80 | 0.15 | 0.1200 |
| **Total Clarity** | | | **0.8175** |
| **Ambiguity** | | | **0.1825 (18%)** |

## Topology

| Component | Status | Description | Coverage Note |
|-----------|--------|-------------|---------------|
| pdf-template-upload | active | 교사가 PDF 직접 업로드 → Supabase Storage 저장. 일반 PDF 허용, 패스워드/봉인/AcroForm 거절. Multi-page 지원. | 파일 ≤ 10MB, 페이지 ≤ 10. 거절 케이스 한국어 친화 카피. |
| region-designer | active | pdf.js + 드래그 사각형 + participantId/signatureKind 바인딩. Pattern 1 + 간소화 Pattern 2 (균일 행 자동복제). | 페이지 경계 밖 reject. N<N' 절단·N>N' 경고. 50×20px 최소. 개별 수정 가능. |
| public-signing-surface | active | 자기 사각형이 있는 페이지 전체 PNG + 영역 강조 박스 + "내 칸 확대" 토글 + 손글씨 캔버스. 학생 번들 397KB 유지 (pdf.js 미포함). | 동의 표 + 체크박스 1개 → 캔버스 활성. 5년 보관·자동 파기·본인 요청 즉시 파기. |
| pdf-composition | active | 교사 '결과 PDF 생성' 버튼 → Edge Function compose-signed-pdf 가 pdf-lib 로 합성. 부분 합성 허용. Idempotent 재합성. | 미서명 영역 회색 점선 박스 "미서명". 푸터 "제출 현황 N/M (시각)". PDF metadata Keywords token 자동 삽입. **시각 워터마크 없음**. |
| legacy-mapping-migration | active | SignatureMappingTargetType 4타입 → `pdf-region` 단일. SignatureGoogleTemplatePlanner 완전 제거. inferSignatureMappingFromCsv 의 명단 추출 부분만 유지. | 회귀 가드 카피 일제 갱신: "PDF 오버레이 단일 모델 + 시각 워터마크 없음 + UI 카피로만 정책 명시". |

### Deferrals (1차 범위 밖)

| Component (planned) | Reason |
|---------------------|--------|
| google-docs-conversion | R0: PDF 직접 업로드만 1차 범위. |
| legal-grade-signing-delegate | R0.5 Option A: 외부 SaaS 미사용. 결석계/가정통신문 도메인엔 자필 서명 동등 효력 불필요. |
| sheets-track-integration | post-R5: 80명 양식이 연수등록부 1종에 한정 → Sheets 트랙 1차 도입 비용이 가치보다 큼. Phase 2D 재검토. |
| pattern-2-edge-cases | R5 γ: 불균일 행 양식, multi-page wrap 특수 케이스, 명단 N ≠ 사각형 N' 자동 처리는 Phase 2D. |

## Goal

쌤핀 서명받기 도구 Phase 2B 의 4타입 셀·치환자 매핑 모델을 **PDF 오버레이 + 좌표 기반 영역 모델**로 전면 교체한다. 교사는 PDF 파일을 직접 업로드해 `pdf.js` 위에 사각형을 드래그로 그리고, 각 사각형을 명단 참여자 + 서명 종류와 바인딩한다. 행 단위 자동복제로 80명 연수등록부도 사각형 1~2개 작업으로 완료한다. 학생/학부모는 자기 사각형이 있는 페이지 미리보기 + "내 칸 확대" 토글 + 손글씨 캔버스로 서명하고, 교사가 '결과 PDF 생성' 버튼을 누르면 Edge Function 이 pdf-lib 로 좌표에 PNG 를 합성한 결과 PDF 를 생성한다. 1차 정책 (legalEffect=none, 자동 리마인드 없음, 강한 본인확인 없음, 외부 SaaS 미사용) 을 유지하되 시각 워터마크는 결과 PDF 에 노출하지 않는다.

## Constraints

- **자원**: Supabase 무료 티어 + Edge Function (256MB 메모리, 50초 타임아웃) 안에서 80명 × 10페이지 합성 작동
- **번들 예산**: 학생 번들 397KB 유지 → pdf.js 미포함 → 학생 미리보기는 서버 PNG 렌더 (Edge Function)
- **업로드 한도**: PDF 파일 ≤ 10MB, 페이지 ≤ 10
- **거절 PDF**: 패스워드, 봉인 디지털 서명, AcroForm 활성 필드
- **정책**: legalEffect=none, automaticReminders=false, strongIdentityRequired=false (`SIGNATURE_REQUEST_FIRST_RELEASE_SCOPE` 유지)
- **외부 의존**: 외부 SaaS (모두싸인·카카오싸인) 미사용. 본인확인 SDK·TSA·PAdES 미사용.
- **개인정보보호법**: 수집 항목·목적·5년 보관·자동 파기·본인 요청 즉시 파기 명세를 학생 동의 표에 명시
- **결과 PDF**: 시각 워터마크 없음. 푸터엔 "제출 현황 N/M (시각)" 만. PDF metadata Keywords 에 invisible token `행정용,법적효력없음,쌤핀` 자동 삽입.

## Non-Goals

- Google Docs URL → PDF 변환 경로 (R0 deferral)
- Google Sheets / Microsoft Excel 양식 직접 통합 (post-R5 deferral)
- 자필 서명 동등 법적 효력 (R0.5 Option A)
- 외부 SaaS 위임 (Option B/C 모두 deferral)
- 자동 리마인드 발송
- 본인확인 (휴대폰 본인인증·공동인증·금융인증 등) 통합
- TSA 타임스탬프, PAdES 봉인
- 불균일 행 양식의 Pattern 2 자동복제 (Phase 2D)
- 양식 매핑 자동 추론 (`inferSignatureMappingFromCsv` 의 매핑 추론 부분 — 명단 추출 부분은 유지)
- `SignatureGoogleTemplatePlanner` 의 결과 셀 / 결과 시트 writeback (완전 제거)
- 결과 PDF 의 시각 워터마크

## Acceptance Criteria

### 컴포넌트 1: PDF 양식 등록

- [ ] 교사가 `.pdf` 파일을 직접 업로드 → Supabase Storage 의 `signature-templates/{teacherId}/{templateId}.pdf` 에 저장
- [ ] 파일 크기 > 10MB 또는 페이지 수 > 10: 업로드 reject + 한국어 친화 안내
- [ ] 패스워드 PDF / 봉인 디지털 서명 PDF / AcroForm 활성 PDF: 업로드 reject + 각 케이스별 안내 카피
- [ ] Multi-page PDF 1차 지원 — `SignatureRegion.pageIndex` 가 도메인에 명시

### 컴포넌트 2: 서명 영역 디자이너 (교사 UI)

- [ ] pdf.js 로 PDF 1~10페이지를 페이지별 캔버스에 렌더
- [ ] 사각형 드래그 그리기 + 사각형 클릭 시 참여자 + 서명 종류 바인딩 패널 표시
- [ ] Pattern 2 토글 ON + 두 사각형 드래그 → 시스템이 행 간격 자동 추론 → 명단 N명에 대해 자동복제 사각형 미리보기 표시
- [ ] 자동복제 결과를 교사가 검토·개별 수정 가능
- [ ] 페이지 경계 밖 사각형: reject + "사각형이 페이지 안에 들어와야 해요"
- [ ] 명단 N < 자동복제 N': 명단 수까지만 자동 생성
- [ ] 명단 N > 자동복제 N': 발급 단계 경고 + 발급 차단 + 카피 "X명에게 자리가 부족합니다"
- [ ] 사각형 최소 크기 = 50 × 20 px (드래그 종료 시점 검증)

### 컴포넌트 3: 학생/학부모 공개 서명

- [ ] 학생 번들에 pdf.js 미포함 (397KB 가드 유지)
- [ ] Edge Function `render-page-preview` 가 page PNG 를 학생에게 전달 (자기 영역 빨간 강조 박스 포함)
- [ ] Edge Function `render-region-cutout` 이 자기 사각형만 잘라낸 PNG 를 토글 시 전달
- [ ] 개인정보 동의 표 (수집 항목·목적·5년 보관·자동 파기·본인 요청 즉시 파기) + 체크박스 1개 → 캔버스 활성화
- [ ] 동의 시각 + IP 가 Supabase 감사 로그에 기록

### 컴포넌트 4: PDF 합성 파이프라인

- [ ] Edge Function `compose-signed-pdf` 가 pdf-lib 로 서명 PNG → PDF 좌표 합성
- [ ] 교사가 1명 제출만 있어도 '결과 PDF 생성' 버튼 활성 (부분 합성 허용)
- [ ] 미서명 영역: 회색 점선 박스 + "미서명" 텍스트 자동 삽입
- [ ] 푸터 자동 텍스트: "제출 현황: N/M (YYYY-MM-DD HH:MM 기준)"
- [ ] 결과 PDF 에 **시각 워터마크 없음** (정책: UI 카피로만 명시)
- [ ] PDF metadata Keywords 에 `행정용,법적효력없음,쌤핀` invisible token 자동 삽입 (`doc.setKeywords()`)
- [ ] 결과 PDF 저장 경로: `signature-results/{requestId}/{version}.pdf` (idempotent 재합성, v2/v3 보존)
- [ ] 80명 × 10페이지 합성 ≤ 50초 + 256MB 안에 완주

### 컴포넌트 5: 기존 매핑 모델 단순화

- [ ] `SignatureMappingTargetType` 을 `'pdf-region'` 단일로 좁힘
- [ ] `SignatureGoogleTemplatePlanner` 파일 + 테스트 + 픽스처 완전 제거
- [ ] `inferSignatureMappingFromCsv` 의 매핑 추론 (generated-table-column) 부분 제거, 명단 추출 부분만 유지
- [ ] 회귀 가드 카피 일제 갱신: "PDF 오버레이 단일 모델 + 시각 워터마크 없음 + UI 카피로만 정책 명시"
- [ ] `npm run typecheck` 0 errors, `npm run test` PASS, `npm run regression-check` PASS, `npm run build:student` 학생 번들 ≤ 397KB

### 정합성·운영 가드

- [ ] 1차 정책 회귀 가드 (legalEffect=none / automaticReminders=false / strongIdentityRequired=false) 통과
- [ ] 결과 PDF 시각 워터마크 부재 회귀 가드 통과 (PDF 텍스트에서 "행정용 의사 확인" 문자열이 발견되면 fail — UI 카피로만 존재)
- [ ] PDF metadata Keywords 회귀 가드 통과 (`행정용,법적효력없음,쌤핀` 존재 검증)
- [ ] 학생 동의 표 4행 회귀 가드 통과

## Assumptions Exposed & Resolved

| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| Google Docs URL → PDF 변환 경로가 필요할 것이다 | 정말 1차에 필요한가? PDF 직접 업로드만으로도 학교 양식 다수 커버 가능 | R0: deferral. 사용자가 시트로 작성하면 PDF export 후 업로드. |
| 1차에 자필 서명 동등 법적 효력 보장 시도 | 학교 도메인에서 그게 정말 필요한가? + 외부 SaaS·자체 구축 비용 감당 가능한가? | R0.5: Option A. 결석계·가정통신문은 행정용 의사 확인 증거 수준이면 충분. 비용 0. |
| 기존 4타입 매핑 (sheets-cell·named-range·docs-placeholder·generated-table-column) 일부 유지가 가치 | 운영 publish 사실상 0건. 코드 단순화 효용 vs 자산 보존 효용 비교 | R1: 전면 폐기. 단 명단 자동 채우기 (`inferSignatureMappingFromCsv` 의 명단 추출 부분) 는 별도 기능으로 유지. |
| Pattern 1 (명시 바인딩) 만으로 1차 출시 충분 | 사용자가 80명 양식 (연수등록부) 사례를 직접 언급 → 모순 노출 | R5: γ — 간소화 Pattern 2 (균일 행 자동복제) 를 1차 포함. 불균일 엣지케이스는 Phase 2D. |
| Sheets 트랙 1차 동시 지원 가치 (Phase 1/2A 자산 활용) | 80명 양식이 연수등록부 1종에 한정 → Sheets 의 진짜 가치는 어디? 학생 UX 트랙 갈라짐 비용 | post-R5: 트랙 도입 비용 > 가치. Phase 2D deferral. 명단 자동 채우기는 별도로 유지. |
| 결과 PDF 푸터에 "행정용 의사 확인 — 자필 서명 동등 효력 아님" 시각 워터마크 의무 | 학교 행정 문서로서 자연스럽지 않음. 정책 noise 가 정상 사용에 마찰 | R9 후속: 시각 워터마크 제거. UI 카피 + PDF metadata invisible token 으로 정책 carry. |
| Pattern 2 의 행 간격 자동 추론에 의존 → 양식이 균일하지 않으면? | 불균일 양식은 실무에 일부 존재 (제목·소제목 섞임) | R5 γ: 사각형 수가 명단과 안 맞으면 자동 일시정지 + 수동 조정 안내. 1차는 균일 행 양식만 보장. |
| 합성은 학생 제출마다 즉시 실행 | 80명 양식 = 80번 합성 = 비용 폭주 | R3: 온디맨드 합성. 교사 버튼 액션 1번에 최신 버전 1개 생성. idempotent. |
| 학생은 자기 영역만 보면 충분 | 결석계 학생은 OK 지만 80명 학생은 양식 전체 맥락 필요 | R6 (simplifier): Option 3 — 페이지 전체 + 내 칸 확대 토글. 양쪽 다 제공. |

## Technical Context (Brownfield)

### Preserved Assets (Phase 1/2A/2B 잔류)

- `inferSignatureMappingFromCsv` 의 명단 추출 부분 (헤더·행 → `SignatureParticipant`)
- Phase 1 자동 채우기 UI (시트 URL → 명단·메타) — 매핑 추론 패널만 제거
- Phase 2A `publish-signature-request` / `get-signature-request-public` / `submit-signature` Edge Functions (양식 종류 무관)
- Phase 2B `SignatureCanvasPad` (학생 손글씨 캔버스, native canvas + pointer events)
- `migration 029` (RLS + private bucket signature-uploads)

### Removed Assets

- `SignatureGoogleTemplatePlanner.ts` (~250줄) + 테스트
- `inferSignatureMappingFromCsv` 의 매핑 추론 (generated-table-column 헤더 → 슬롯) 부분
- `SignatureMappingTargetType` 의 4타입 → `'pdf-region'` 단일로 좁힘

### New Assets

- `SignatureRegion` 도메인 entity (`pageIndex` + `rect{x,y,w,h}` 정규화 좌표 + `participantId` + `signatureKind`)
- `PdfTemplate` 도메인 entity (업로드된 PDF 메타)
- `ComposedPdf` 도메인 entity (합성 결과 + version)
- Edge Functions: `validate-pdf-upload`, `render-page-preview`, `render-region-cutout`, `compose-signed-pdf`
- 클라이언트 (교사): pdf.js + 사각형 드래그 + Pattern 2 자동복제 UI
- 클라이언트 (학생): 페이지 PNG + 강조 박스 + 확대 토글 + 동의 표 + `SignatureCanvasPad` 재사용

### 의존성·라이브러리

- `pdf.js` (Mozilla) — 교사 PDF 렌더, 학생 번들엔 미포함
- `pdf-lib` — Edge Function 합성 (Deno 호환 확인)
- 기존 Supabase JS SDK / Edge Function 런타임 그대로

## Ontology (Key Entities)

| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| `SignatureRequest` | core domain | id, title, templateKind, templateSource, mapping, participants, submissions, access, scope, status, createdAt, updatedAt | has many `SignatureParticipant`, `SignatureSubmission`, `SignatureRegion` |
| `SignatureParticipant` | core domain | id, displayName, role, requiredSignatureKinds, uniqueLinkTokenHash, pinHash | belongs to `SignatureRequest`, bound to `SignatureRegion` |
| `SignatureSubmission` | core domain | id, participantId, signatureKind, signerName, submittedAt, image (storagePath, mimeType, sizeBytes) | belongs to `SignatureRequest`, references `SignatureRegion` |
| `PdfTemplate` | core domain (Phase 2C 신규) | id, storagePath, pageCount, fileSize, uploadedAt | belongs to `SignatureRequest` |
| `SignatureRegion` | core domain (Phase 2C 신규, `SignatureSlotMapping` 후신) | id, pageIndex, rect{x,y,w,h} (정규화 0~1), participantId, signatureKind, autoReplicateRowSourceId (Pattern 2 origin) | belongs to `SignatureRequest`, references `SignatureParticipant` |
| `ComposedPdf` | core domain (Phase 2C 신규) | requestId, version, storagePath, composedAt, submissionCount (N), participantCount (M) | belongs to `SignatureRequest` |

## Ontology Convergence

| Round | Entity Count | New | Changed | Stable | Stability |
|-------|--------------|-----|---------|--------|-----------|
| 1 | 5 | 5 | - | - | N/A |
| 2 | 5 | 0 | 0 | 5 | 100% |
| 3 | 6 | 1 (`ComposedPdf`) | 0 | 5 | 83.3% |
| 5 | 6 | 0 | 0 | 6 | 100% |
| 6 | 6 | 0 | 0 | 6 | 100% |
| 10 | 6 | 0 | 0 | 6 | 100% |

도메인 모델은 Round 3 에서 6개로 확정된 뒤 7라운드 연속 100% 안정. Ontologist 모드 발동 불필요.

## Interview Transcript (요약)

| Round | 컴포넌트 | 차원 | 결정 |
|-------|---------|------|------|
| R0 | 토폴로지 | gate | 5개 active component lock, google-docs-conversion deferral |
| R0.5 | 정책 | gate | Option A — 1차 정책 (legalEffect=none) 유지, 외부 SaaS 미사용 |
| R1 | legacy-migration | Goal | 4타입 → `pdf-region` 단일. SignatureGoogleTemplatePlanner 제거. 명단 자동 채우기 유지 |
| R2 | pdf-template-upload | Constraints | 일반 PDF 허용, 패스워드/봉인/AcroForm 거절 |
| R3 | pdf-composition | Constraints | 온디맨드 서버 합성 (compose-signed-pdf Edge Function) |
| R4 | region-designer | Criteria (Contrarian) | Pattern 1 + Pattern 2 deferral → 80명 양식 모순 노출 |
| R5 | region-designer | Goal (재흔들림) | γ — 간소화 Pattern 2 (균일 행만) 1차 포함. 엣지케이스 Phase 2D |
| post-R5 | sheets-track | reopen | Sheets 트랙 1차 보류, Phase 2D defer. 명단 자동 채우기는 유지. PDF + Pattern 2 로 80명 양식 해결 |
| R6 | public-signing-surface | Criteria (Simplifier) | Option 3 — 페이지 전체 PNG + 강조 박스 + 내 칸 확대 토글 |
| R7 | pdf-template-upload | Constraints | 10MB / 10페이지 |
| R8 | pdf-composition | Criteria | 부분 합성 허용. 미서명 회색 박스. 푸터 N/M |
| R9 | public-signing-surface | Constraints | 동의 표 + 체크박스 1개. 5년 보관, 본인 요청 즉시 파기. **워터마크 정책 번복: 결과 PDF 시각 워터마크 제거, UI 카피 + invisible PDF metadata 로만 정책 carry** |
| R10 | region-designer | 잔여 묶음 | 페이지 경계 reject / N≷N' 정책 / 50×20px 최소 / 자동복제 결과 개별 수정. PDF metadata Keywords 보조 마크 포함 |
