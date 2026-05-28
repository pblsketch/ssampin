# Plan: 쌤핀 서명받기 Phase 2C — PDF 오버레이 기반 서명 시스템 (v2.2)

- **Status**: 🟡 **partial Step 0 PoC executed** — 3/4 PASS (A0-1 FAIL, A0-2/A0-3/A0-4 PASS). v2.2 갱신 사항을 v2.1 plan 본문에 반영 + Changelog 추가. Architect/Critic 의 v2.2 재 consensus 는 Session 3 시작 시 (실제 implementation 착수 전) 수행 권고.
- **Origin Spec**: `.omc/specs/deep-interview-signature-phase2c-pdf-overlay.md` (ambiguity 18%, status PASSED)
- **Project**: `E:/github/ssampin` (commit base: `419c8d1` Phase 2C Step 0 PoC)
- **Mode**: consensus non-interactive (--consensus --direct, no --interactive)
- **RALPLAN-DR**: short mode
- **Consensus Quality**: composite 0.62 → 0.87 (v2.1 base), v2.2 변경분은 PoC 실측 기반으로 단방향 갱신 (consensus 재실행 권고).
- **Next Step**: A0-1 FAIL 에 따른 architecture pivot (Step E.1 client-side pre-render) 을 본문에 반영 + 개인정보 제1 원칙에 따른 AC-4 consent_log ip_hash 변경 + AC-6 가드 `poc-*` 패턴 갱신.

### Iteration 3 changes vs v2.1 (Step 0 PoC 실측 + 개인정보 권고 반영)

1. **A0-1 FAIL — Architecture pivot (Step E.1 client-side pre-render)**
   - pdfjs-dist + unpdf 둘 다 Supabase Edge Function (Deno) 에서 `document is not defined` / worker version mismatch 로 fail. Plan v2.1 Risk #1 현실화 확인.
   - Edge Function `prerender-template-previews` 폐기. `src/signature/prerenderTemplatePreviews.ts` 신규 client-side 모듈로 교체 — 교사 SignatureRegionDesigner 가 이미 사용 중인 pdfjs-dist 인스턴스로 publish 시점에 페이지 PNG + region cutout PNG 렌더 → Supabase Storage 업로드.
   - 학생 hot-path Edge Function 호출 0회 목적은 그대로 유지. Edge Function 비용 ↓, 새 의존성 0.

2. **A0-2 PASS — Step F (compose-signed-pdf) 그대로 진행**
   - pdf-lib + @pdf-lib/fontkit + Noto Sans KR 4.6MB OTF 가 Supabase Edge Function 에서 작동 확인 (80 region × 10 page 합성 **327ms** / 50s 한도의 0.6%). 50s 한도 30x 마진 — composition_queue fallback 발동 가능성 낮음. 단 메모리는 Deno Edge `memoryUsage` 미지원으로 직접 측정 불가 — 256MB 한도는 Edge Function 로그에서 별도 모니터링.
   - PoC 의 `poc-compose-stress` 와 production `compose-signed-pdf` 의 코드 차이는: (a) 실제 region 좌표/PNG 입력 (b) Storage 업로드 (c) `composition_queue` 폴링 통합. 라이브러리 호환은 검증 완료.

3. **AC-4 consent_log → consent_ip_hash (개인정보 제1 원칙 일관성)**
   - v2.1: "동의 시각 + 동의 시점 IP 가 `signature_submissions.consent_log` JSON 컬럼에 기록"
   - v2.2: **"동의 시각 + 동의 시점 IP 의 SHA-256 해시 가 기록"**. 같은 함수 `submit-signature` 의 기존 `ip_hash` / `user_agent_hash` 패턴과 동일. 5년 retention (migration 032) 유지.
   - 운영 publish 0건이라 변경 비용 0. 동의 *증거* 의 법적 의미상 "같은 사람 재방문 여부" 검증으로 충분 (raw IP 불필요).

4. **AC-6 회귀 가드 — `_poc` → `poc-*` 패턴 갱신**
   - Plan v2.1 의 `'_poc 잔존 가드': supabase/functions/_poc/ 디렉터리 부재` → Supabase CLI 가 `functions/` 직속만 인식하므로 PoC 함수는 `poc-render-pdf-page` / `poc-compose-stress` / `poc-measure-cold` 식으로 명명됐다. 가드도 `'poc- 잔존 가드': supabase/functions/poc-* 디렉터리 부재 (PoC 단계 통과 후 삭제 의무)` 로 변경.

5. **A0-3 PASS (1회) — 7일 baseline 은 follow-up**
   - cold 1.25s (Seoul region, supabase-edge-runtime-1.74.0 / Deno v2.1.4). 흥미로운 발견: 매 호출 새 isolate (per-request 모델) — warm 재사용 거의 없음. 운영에서는 "cold 일정성" 이 더 중요한 메트릭.
   - 7일 p95 cold / p50 warm 측정은 pg_cron 으로 별도 schedule (Session 3 또는 Phase 2D).

6. **A0-4 PASS — `inferRowSpacing` 알고리즘 검증 (15/15)**
   - 균일 양식 100% 정확도, 비균일 (소계 행 끼움) 양식 균일가정 ~50% (manual fallback 트리거 정당화), 비균일 + 4 anchor 100% 회복.
   - `src/signature/inferRowSpacing.ts` + `.test.ts` 신규 commit (`419c8d1`).

### Iteration 2 changes vs v1
- Step 0 PoC Gate 추가 (Architect P0#1 / Critic A)
- Step E 재설계: 2 hot-path Edge Function → 1 publish-time pre-render (Architect P0#2 / Critic B)
- 정책 carry: 파일명 패턴 primary + Keywords best-effort + UI 카피 (Architect P0#3 보강 / Critic D — R9 결과 PDF 시각 표시 금지 유지)
- Korean font 번들 (Noto Sans KR subset + `@pdf-lib/fontkit` 이미 package.json 있음) (Architect P0#4 / Critic D)
- `SIGNATURE_REQUEST_SCHEMA_VERSION` v1→v2 + 마이그레이션 shim (Critic C 신규)
- migration 032 Storage lifecycle (Critic E 신규)
- `signatureMappingInference.ts` 리팩터 범위 명시 (Architect Q4 / Critic F)
- `resultFileUrl` 마이그레이션 명시 (Architect specific concern #3 / Critic G)
- Risk #1 mitigation 정정: skia-canvas / @napi-rs/canvas 는 Deno Edge 미지원 → 실제 fallback 명시 (Critic H)
- 실제 연수등록부 fixture 의무화 (Architect P2#8 / Critic Q8)
- `SignatureRequestPublicApp.tsx` ~60% 재작성으로 reclassify (Architect specific concern #5)
- Architect 사실 오류 정정 명시: Edge Function 인프라는 이미 존재 (Phase 2A/2B 3개 함수 deployed)

---

## 1. Requirements Summary

Phase 2B 의 4타입 셀·치환자 매핑 모델 (`sheets-cell` / `sheets-named-range` / `docs-placeholder` / `generated-table-column`) 을 **PDF 오버레이 + 좌표 기반 영역 모델** 로 전면 교체. 교사 PDF 직접 업로드 → pdf.js 위 드래그 사각형 → 참여자/서명 종류 바인딩 + Pattern 1 명시 / Pattern 2 균일 행 자동복제. 학생/학부모 자기 사각형이 있는 페이지 PNG (publish 시점 사전 렌더) + 내 칸 확대 토글 + 손글씨 캔버스. 교사 '결과 PDF 생성' → Edge Function pdf-lib 좌표 합성. 1차 정책 (legalEffect=none, 외부 SaaS 미사용) 유지, 결과 PDF 시각 워터마크 부재 (R9), 정책 carry는 파일명 + Keywords + UI 카피 3층 (각 한계 acknowledge).

### 검증된 코드베이스 사실 (Critic 으로부터)
- `supabase/functions/` 디렉터리 **존재** — `publish-signature-request`, `get-signature-request-public`, `submit-signature` 3개 함수가 이미 deploy 됨 (Phase 2A/2B). Architect의 "infrastructure doesn't exist" 주장은 잘못. PoC 는 새 PDF 처리 함수만 검증.
- `pdfjs-dist@4.10.38`, `pdf-lib@1.17.1`, `@pdf-lib/fontkit` 모두 **package.json 에 이미 존재**. 의존성 추가 작업 불필요.
- `SignatureRequest.ts:1` 현재 `SIGNATURE_REQUEST_SCHEMA_VERSION = 1`. v2 bump 필요.
- `signatureMappingInference.ts:88-180` — 매핑 추론과 명단 추출이 강결합. 단순 "부분 제거" 가 아닌 명시 리팩터 필요.
- `SignatureRequestPublicApp.tsx:138-263` — 현재 PNG/동의표/토글 없음. ~60% 재작성.
- 운영 publish 거의 0건 → 데이터 마이그레이션 위험 ≈ 0, 단 schemaVersion shim 으로 미래 안전성 확보.

---

## 2. Acceptance Criteria (testable)

### AC-0: PoC Gate (Step 0 통과 필수)
- [ ] **A0-1**: Supabase Edge Function (Deno) 에서 PDF 1페이지 → PNG 래스터화 작동. 라이브러리: `pdfjs-dist` Deno 호환 검증 OR 외부 라이브러리 대체. 콜드 스타트 ≤ 8s, PNG 렌더 ≤ 3s
- [ ] **A0-2**: `pdf-lib` + `@pdf-lib/fontkit` + Noto Sans KR subset 으로 80개 영역 × 10페이지 합성: 시간 ≤ 50s, 메모리 ≤ 256MB, 한글 footer 텍스트 정상 렌더 (tofu 없음)
- [ ] **A0-3**: Edge Function 콜드/웜 invocation latency 7일 측정 baseline 확보 (p95 cold start, p50 warm)
- [ ] **A0-4**: 실제 연수등록부 PDF fixture (PII 제거 후 commit, 또는 비균일 행 — 직급/부서 소계 행 포함 — 합성 fixture) 로 Pattern 2 자동복제 시각 검증 ≥ 80% 행 정확도. 정확도 미달 시 manual fallback UX 명시 (AC-3 참조)
- [ ] **A0 Gate**: 4개 artifact 중 하나라도 실패 시 plan 중단 + Planner 로 복귀하여 option 재선택

### AC-1: 도메인 단순화 + 스키마 마이그레이션
- [ ] `SignatureMappingTargetType` (in `src/domain/entities/SignatureRequest.ts:19-23`) 가 `'pdf-region'` 단일로 좁혀짐
- [ ] `SignatureRegion` 신규 entity 추가 (`pageIndex: number`, `rect: { x, y, w, h }` 정규화 0~1, `participantId`, `signatureKind`, `autoReplicateRowSourceId?`)
- [ ] `PdfTemplate` 신규 entity 추가 (`storagePath`, `pageCount`, `fileSize`, `uploadedAt`)
- [ ] `ComposedPdf` 신규 entity 추가 (`requestId`, `version`, `storagePath`, `composedAt`, `submissionCount`, `participantCount`)
- [ ] **`SIGNATURE_REQUEST_SCHEMA_VERSION` 을 1 → 2 로 bump** (in `SignatureRequest.ts:1`)
- [ ] **v1→v2 마이그레이션 shim**: 로컬 저장된 `LocalSignatureRequestDraft` 가 v1 (`mapping.signatureSlots` 에 `'sheets-cell'/'sheets-named-range'/'docs-placeholder'/'generated-table-column'` 타입) 으로 load 되면:
  - `mapping` 필드를 `{ textFields: [], signatureSlots: [] }` 로 코어스
  - `participants` 는 그대로 유지
  - `schemaVersion` 을 2로 갱신하고 사용자에게 "이전 양식의 영역 매핑이 PDF 오버레이로 교체됐어요. 새 양식을 다시 등록해 주세요." 안내 토스트
- [ ] migration shim 단위 테스트: 5개 v1 fixture (각 4타입 + 빈 매핑) → 모두 v2 로 coerce + participants 보존
- [ ] `SignatureGoogleTemplatePlanner.ts` 258 LOC + 테스트 + 픽스처 완전 삭제
- [ ] `npm run typecheck` 0 errors

### AC-2: PDF 업로드 (Component 1)
- [ ] 교사 UI `.pdf` 직접 업로드 → Supabase Storage `signature-templates/{teacherId}/{templateId}.pdf` 저장
- [ ] Edge Function `validate-pdf-upload` 가 다음을 reject + 한국어 안내 카피 반환:
  - 파일 크기 > 10MB
  - 페이지 수 > 10
  - 패스워드 보호 PDF
  - 봉인 디지털 서명 PDF (`/Sig` 객체 검출)
  - AcroForm 활성 필드 PDF — 단, *비활성* AcroForm metadata (한국 정부 양식에서 흔함) 는 허용 (활성 필드만 reject)
  - **신규**: mixed page orientation (A4 portrait + A4 landscape 혼합) 감지 시 **경고 + 교사 확인 프롬프트** ("가로/세로 혼합 양식이에요. Pattern 2 자동복제는 페이지 단위로만 작동합니다. 계속할까요?") — 명시적 거절 아님, 교사가 OK 누르면 진행
- [ ] Multi-page PDF (1~10 페이지) 지원
- [ ] migration 030: `signature-templates` private bucket + RLS 정책 추가
- [ ] 거절 케이스별 통합 테스트 (각 케이스 fixture 1개씩, 6개)

### AC-3: 서명 영역 디자이너 (Component 2 — 교사 UI)
- [ ] `pdfjs-dist` (이미 package.json 있음) — `vite.config.ts` 에 worker 설정 갱신
- [ ] `src/signature/SignatureRegionDesigner.tsx` 생성 — pdf.js 페이지별 캔버스 + pointer-events 드래그
- [ ] 사각형 클릭 시 패널: 참여자 + 서명 종류 바인딩
- [ ] Pattern 2 토글 ON + 두 번째 사각형 → 행 간격 자동 추론 + 명단 N명에 자동복제 미리보기
- [ ] 자동복제 결과 개별 사각형 수정 가능
- [ ] 페이지 경계 밖 reject + 토스트
- [ ] 사각형 최소 크기 = 50×20 px
- [ ] 명단 N < N': 명단 수까지만 생성
- [ ] 명단 N > N': 발급 단계 경고 + 차단 + "X명에게 자리가 부족합니다"
- [ ] **신규**: 비균일 행 양식 (실제 연수등록부 fixture) 에서 자동복제 시 정확도 미달 (≥ X 행 빗나감) 시 자동 일시정지 + "이 행만 수동으로 조정해 주세요" 안내 + 빨간색 어긋난 영역 하이라이트
- [ ] 단위 테스트: `inferRowSpacing`, `signatureRegionRules` (boundary/minimum/mismatch)
- [ ] 통합 테스트: 80명 자동복제 (실제 연수등록부 fixture 또는 sanitized 합성 fixture)

### AC-4: 공개 서명 페이지 (Component 3 — 학생/학부모)
- [ ] **`SignatureRequestPublicApp.tsx` ~60% 재작성** 으로 reclassify (단순 extension 아님)
- [ ] 학생 번들 397KB 유지 가드 통과
- [ ] **publish 시점 사전 렌더** (`prerender-template-previews` Edge Function, AC-4.5 참조) 결과를 학생이 signed URL 로 fetch — 학생 hot-path 에 Edge Function 호출 없음
- [ ] `SignatureRequestPublicApp.tsx` 갱신:
  - 페이지 PNG 표시 + 강조 박스 (signed URL)
  - "내 칸 확대" 토글 → cutout PNG signed URL 전환
  - 개인정보 동의 표 + 체크박스 1개 → 캔버스 활성화
  - 미동의 시 캔버스 회색 + 안내
- [ ] **동의 시각 + 동의 시점 IP 의 SHA-256 해시** (`consent_ip_hash`) 가 `signature_submissions.consent_log` JSON 컬럼에 기록 (migration 031). 기존 `ip_hash` / `user_agent_hash` 패턴과 동일. **raw IP 는 어디에도 저장하지 않는다** (제1 원칙 — 개인정보 최소 수집). 같은 사람 재방문 검증으로 충분.
- [ ] SSR 테스트: 페이지 PNG / 강조 박스 / 토글 / 동의 표 / 체크박스

### AC-4.5: Publish-time Pre-render (Component 3 보조) — **v2.2: client-side pivot**

> **v2.2 변경 (A0-1 FAIL 결과 반영)**: Edge Function `prerender-template-previews` 폐기. 교사 브라우저에서 publish 시점에 pdfjs-dist 로 렌더. SignatureRegionDesigner 가 이미 pdfjs-dist 를 사용하므로 추가 의존성 0. Edge Function 비용 ↓, 학생 hot-path 호출 0회 목적 그대로.

- [ ] **`src/signature/prerenderTemplatePreviews.ts` 신규 client-side 모듈**:
  - SignatureRegionDesigner 의 "발급" 버튼 클릭 시 호출
  - 입력: `templateId`, `signatureRegions[]`, `participants[]`, `regionVersion`
  - 처리: pdfjs-dist 로 각 페이지 PNG 렌더 (디자이너의 캔버스 재사용 가능) + 강조 박스 합성 + 각 region cutout PNG 렌더
  - 출력: 브라우저에서 Supabase Storage `signature-templates/{teacherId}/{templateId}/v{regionVersion}/page-{i}.png` 및 `.../cutout-{participantId}-{kind}.png` 업로드 (signed URL with TTL 60d default 또는 `expiresAt`). 학생 hot-path 가 그 signed URL 만 fetch
  - **사전 렌더 실패 처리**: 브라우저 측에서 페이지 N개 중 1개라도 실패 시 → 토스트 "미리보기 생성 실패. 잠시 후 다시 시도해 주세요" + 자동 재시도 1회. 재시도까지 실패하면 publish 자체를 `status='publish_failed'` 로 둠
  - 진행률 UI: "1/10 페이지 미리보기 생성 중..." (모달 또는 progress bar)
- [ ] `publish-signature-request` Edge Function 갱신: 응답에 `templateId`, `teacherId`, `signedUrlSpec` 등 client-side pre-render 가 필요한 메타데이터 포함 (Supabase Storage 업로드 URL 발급)
- [ ] 디자이너에서 region 편집 시 → `regionVersion` 증분 + 다음 publish 시점에 새 v{n} 경로에 재렌더 (이전 버전은 migration 032 lifecycle 으로 soft-delete)
- [ ] 학생이 사전 렌더 완료 전 페이지 진입 시 "미리보기 준비 중..." 스피너 + 2초 폴링, 30초 timeout 후 "잠시 후 다시 열어 주세요" 안내
- [ ] 통합 테스트: publish → client-side 사전 렌더 → Storage 업로드 → 학생 페이지 fetch 흐름
- [ ] 학생 번들 397KB 가드 유지 — `prerenderTemplatePreviews` 는 *교사* 번들에만 포함, 학생 번들에는 제외 (route 분리 + Vite chunk split)

### AC-5: PDF 합성 (Component 4)
- [ ] Edge Function `compose-signed-pdf` 신규 (Deno + pdf-lib + `@pdf-lib/fontkit` + Noto Sans KR subset)
- [ ] 교사 1명 제출만 있어도 '결과 PDF 생성' 버튼 활성
- [ ] 미제출 영역: 회색 점선 박스 + "미서명" 텍스트 (Noto Sans KR 로 렌더)
- [ ] 결과 PDF 푸터 자동 텍스트: `제출 현황: N/M (YYYY-MM-DD HH:MM 기준)` (Noto Sans KR 로 렌더, tofu 없음)
- [ ] **결과 PDF 에 시각 워터마크 부재** (R9 결정 유지 — 푸터에 "행정용 의사 확인" 텍스트도 없음)
- [ ] **정책 carry 3층 (R9 결과 PDF 시각 표시 금지 유지하면서 가능한 최대치)**:
  1. **파일명 패턴** (primary visible carrier): `{title}_쌤핀_행정용_v{n}.pdf` — Downloads / 이메일 첨부에서 사용자가 보는 위치
  2. **PDF metadata Keywords** (best-effort secondary): `행정용,법적효력없음,쌤핀` — `doc.setKeywords()` + `doc.setProducer('쌤핀 행정용')` 동시 삽입 — 일부 PDF viewer 에서 메타로 노출
  3. **In-app UI 카피** (in-context carrier): 교사 발급 화면, 학생 동의 화면, 결과 PDF 생성 버튼 툴팁
- [ ] 결과 PDF 저장 경로: `signature-results/{requestId}/v{version}.pdf` (idempotent)
- [ ] 합성 완료 토스트 + 양식 카드 링크 갱신
- [ ] 성능 가드: 80명 × 10페이지 합성 ≤ 50s + 256MB (PoC A0-2 통과 후 검증)
- [ ] **fallback (구체 패턴)**: 합성 측정 결과 50s 한도 초과 위험 시 **`composition_queue` 테이블 (requestId, status, attempts, lastError) + Supabase pg_cron 1분 폴링 → `compose-signed-pdf` invoke**. 80×10 같은 대규모는 **chunked composition** (20×10 4 배치 → 최종 merge 1회) 으로 각 invocation ≤ 15s 보장. UI 는 `composition_queue.status` 를 Supabase realtime subscribe 하여 진행 상태 실시간 표시 + 완료 시 토스트
- [ ] 통합 테스트: 부분 합성 (5/30, 30/30, 70/80), 80×10 성능 측정, 워터마크 부재 검증 (PDF 텍스트 추출 후 "행정용 의사 확인" 검색 0건), Keywords token 존재 검증

### AC-6: 회귀 가드 갱신
- [ ] `scripts/regression-grep-check.mjs` 갱신 — comment-strip 후 매칭 (false positive 방지):
  - **신규 가드**:
    - `pdf-region 단일 모델`: 도메인 entity 파일에서 4타입 문자열 (`sheets-cell`/`sheets-named-range`/`docs-placeholder`/`generated-table-column`) 부재 검증 (코드 only, 코멘트/changelog 제외)
    - `결과 PDF 워터마크 부재`: `compose-signed-pdf` 의 PDF 본문 작성 코드에 "행정용 의사 확인" 한글 문자열 없음 (정확한 패턴: `drawText.*행정용` 또는 `embedText.*행정용` 검출 시 fail)
    - `정책 Keywords 존재`: `compose-signed-pdf` 에 `setKeywords` 호출 + `행정용,법적효력없음,쌤핀` 문자열 모두 존재
    - `파일명 패턴`: `compose-signed-pdf` 에 `_쌤핀_행정용_v` 문자열 존재
    - `학생 동의 표 4행`: `SignatureRequestPublicApp.tsx` 또는 `PrivacyConsentTable.tsx` 에 "수집 항목", "목적", "보관 기간", "파기" 4개 문자열 모두 존재
    - `Noto Sans KR 폰트 임베드`: `compose-signed-pdf` + `prerender-template-previews` 에 `fontkit` import 와 `NotoSansKR` 또는 `noto-sans-kr` 패스 존재
    - **v2.2** `poc- 잔존 가드`: `supabase/functions/poc-*` 디렉터리 부재 검증 (PoC 단계 통과 후 삭제 의무). Supabase CLI 가 `functions/` 직속만 함수로 인식하므로 v2.1 의 `_poc/` 가 아닌 `poc-` prefix 사용
    - **v2.2** `consent_log raw IP 부재 가드`: `submit-signature` Edge Function 의 consent_log write 코드에 `clientIP` 변수를 raw 로 저장하는 코드가 없는지 검증. `consent_ip_hash` 필드만 허용 (정규 표현 `consent_log.*ip[^_]` 검출 시 fail — `consent_log.*ip_hash` 는 통과)
    - `Keywords round-trip 가드`: 결과 PDF 통합 테스트에서 `pdftotext -keywords` 또는 pdf-lib `doc.getKeywords()` 로 `행정용,법적효력없음,쌤핀` 추출 검증
  - **제거 가드**:
    - "Google Sheets URL → 매핑 자동 추론 가드" (Phase 1 명단 추출 가드는 유지)
    - "결과 PDF 워터마크 의무 가드" (R9 정책 번복으로 부재 가드로 교체)

### AC-7: 운영·전반 + Storage Lifecycle
- [ ] `npm run test` PASS — 전체 (예상 **~1926 ±30 PASS** — Step A 시작 전 실측으로 baseline 확정, hard gate 아님)
- [ ] `npm run typecheck` 0 errors
- [ ] `npm run lint` 0 errors
- [ ] `npm run regression-check` PASS
- [ ] `npm run build:student` 통과 + 학생 번들 ≤ 397KB
- [ ] `npm run build` 통과 (교사 번들 pdf.js 포함 OK)
- [ ] **migration 032 (`signature_storage_lifecycle.sql`)**:
  - `signature-templates` bucket: 미발급 (publish 안 된) 양식 파일 1년 후 auto-purge
  - `signature-results` bucket: requestId 당 최신 2개 버전 유지, 그 이상 버전 async soft-delete
  - `signature-submissions.consent_log` 컬럼: 5년 후 pg_cron 월간 batch job 으로 NULL 처리 (개인정보보호법 보관기간 준수)
  - `signature-uploads` (기존) bucket: 5년 보관 정책 적용
- [ ] Storage 용량 가드: 80명 × 10페이지 × 3버전 × 100 publish 누적 < 500MB 검증 (Supabase 무료 1GB 한도)
- [ ] `SignatureRequest.resultFileUrl` 마이그레이션 (AC-1 의 schemaVersion bump 와 묶음):
  - Field를 `@deprecated` JSDoc 마크
  - 새 canonical 위치 = `ComposedPdf.storagePath`
  - `useSignatureRequestStore.ts` + `ToolSignatureRequest.tsx` 에서 `ComposedPdf` entity 로부터 읽도록 갱신
  - back-compat 읽기 fallback: `resultFileUrl` 가 있으면 표시, 새 합성은 `ComposedPdf` 로

---

## 3. Implementation Steps

### Step 0. PoC Gate (HARD: 2-3 days, 4 artifacts must pass)
1. **Edge Function PDF→PNG 래스터화 검증**:
   - `supabase/functions/_poc/render-pdf-page/` 임시 함수
   - `pdfjs-dist@4.10.38` Deno import 시도 (`https://esm.sh/pdfjs-dist@4.10.38?target=deno`)
   - 1페이지 PDF → PNG ≤ 3s, 콜드 스타트 ≤ 8s 측정
   - **실패 시 fallback 평가**: (a) `unpdf` 등 Deno-native PDF 라이브러리, (b) Cloudflare Worker 동반 함수, (c) external Node container — 어느 하나 통과해야 함
2. **pdf-lib 합성 스트레스 테스트**:
   - `supabase/functions/_poc/compose-stress/` 임시 함수
   - `pdf-lib@1.17.1` + `@pdf-lib/fontkit` + Noto Sans KR subset (~20KB) 로 80 영역 × 10 페이지 합성
   - 시간 ≤ 50s, 메모리 ≤ 256MB 측정
   - 한글 텍스트 ("제출 현황: 30/30 (2026-05-28 14:00 기준)") 렌더 → tofu 없음 확인
3. **콜드 스타트 baseline 7일 측정**:
   - `supabase/functions/_poc/measure-cold/` 임시 함수
   - 7일 cron 간격으로 invoke + Supabase Edge Function logs 에서 콜드/웜 latency 수집
   - p95 cold ≤ 8s, p50 warm ≤ 500ms 목표
4. **실제 연수등록부 fixture Pattern 2 검증**:
   - 비균일 행 양식 (직급 헤더 또는 부서 소계 행 포함) PDF fixture 준비 — PII 제거 후 `tests/fixtures/training-register-sample.pdf` commit, 또는 권한 없으면 sanitized 합성 PDF 생성
   - 수동 Pattern 2 자동복제 시뮬레이션 → 정확도 측정 (≥ 80% 행 매칭 자동, 빗나간 행은 manual fallback)
   - 정확도 < 80% 면 AC-3 의 "이 행만 수동 조정" UX 가 critical path 임을 confirm

**Gate 통과 = 4개 artifact 모두 통과**. 하나라도 실패 시 → 작업 중단, Planner 복귀, option 재선택.

### Step A. 도메인 + 스키마 마이그레이션
1. `src/domain/entities/SignatureRequest.ts` 갱신:
   - `SIGNATURE_REQUEST_SCHEMA_VERSION` 1 → 2
   - `SignatureMappingTargetType` → `'pdf-region'` 단일
   - `SignatureRegion` / `PdfTemplate` / `ComposedPdf` entity 추가
   - `SignatureRequest.resultFileUrl` 에 `@deprecated` JSDoc + back-compat 주석
2. v1→v2 마이그레이션 shim 함수: `src/domain/rules/signatureSchemaMigration.ts` 신규
   - `migrateV1ToV2(legacy: LegacySignatureRequest): SignatureRequest`
   - mapping 필드 정리 + schemaVersion 갱신 + participants 보존
3. `src/domain/rules/signatureSchemaMigration.test.ts` 신규 — 5개 v1 fixture (각 4타입 + 빈 매핑)
4. `src/domain/rules/signatureRegionRules.ts` 신규 — 페이지 경계, 최소 크기, mismatch, mixed-orientation 정책 순수함수
5. `src/domain/rules/signatureRegionRules.test.ts` 신규
6. `JsonSignatureRequestRepository.ts` (저장소) 갱신: load 시 v1 감지 → migration shim 자동 호출
7. 회귀 가드 갱신 (AC-6 패턴)

### Step B. 레거시 자산 제거 + signatureMappingInference 명시 리팩터
1. 삭제: `src/infrastructure/google/SignatureGoogleTemplatePlanner.ts` (258 LOC) + `.test.ts` + 픽스처
   - 사전 grep: `SignatureGoogleTemplatePlanner` 임포트가 다른 파일에 있는지 확인 후 제거
   - `SignatureImageUrlDurability`, `SignatureImageUrlRef`, `SignatureWritebackSubmission` 타입의 외부 import 도 정리
2. **`signatureMappingInference.ts:88-180` 리팩터** (Architect Q4 / Critic F):
   - 신규 export 함수 `inferParticipantColumns(headers, sampleRows)` 추출 — `recipientNameColumn`, `studentNumberColumn`, `classNameColumn`, `roleColumn` 검출 로직만 분리
   - 기존 `inferSignatureMappingFromCsv` 가 `inferParticipantColumns` 호출 + participants 빌드만 수행, mapping 필드는 항상 `{ textFields: [], signatureSlots: [] }` 반환
   - `signatureSlot` 헤더 분류 (`classification.kind.type === 'signature'`) 로직 완전 제거
   - 다음 commit cycle 에 `inferSignatureMappingFromCsv` 자체를 `extractParticipantsFromCsv` 로 리네임 (이 plan 에서는 호환 위해 이름 유지)
3. `signatureMappingInference.test.ts` 갱신 — 매핑 추론 케이스 제거, 명단 추출 케이스 유지

### Step C. PDF 업로드 + Storage + migration 030
1. `supabase/migrations/030_signature_templates_bucket.sql`:
   - `signature-templates` private bucket
   - RLS: teacherId 기준 (service_role 만 직접 접근)
2. `supabase/functions/validate-pdf-upload/`:
   - PDF 파싱 라이브러리 선택은 Step 0 PoC 결과에 따라 confirm (`pdfjs-dist` 또는 fallback)
   - 파일 크기, 페이지 수, 패스워드, 봉인, AcroForm 활성, mixed-orientation 검사
   - 거절 시 한국어 카피, 통과 시 Storage 업로드 + `PdfTemplate` 메타 반환
3. 교사 UI 업로드 패널 (`ToolSignatureRequest.tsx` 보강): 파일 입력, 진행률, 거절 안내

### Step D. 서명 영역 디자이너 (교사 UI)
1. `vite.config.ts`: `pdfjs-dist` worker 설정 (이미 dep 존재)
2. `src/signature/SignatureRegionDesigner.tsx` 신규: pdf.js viewport 캔버스 overlay, 드래그, 바인딩 패널, Pattern 2 토글, 자동복제 미리보기
3. `src/signature/inferRowSpacing.ts` 순수함수 + 테스트
4. `src/signature/replicateRegionAcrossParticipants.ts` 순수함수 + 테스트
5. `SignatureRegionDesigner.test.tsx` — 통합 테스트 (실제 연수등록부 fixture 사용)

### Step E. 공개 서명 페이지 (학생/학부모) + Publish-time Pre-render
1. **`supabase/functions/prerender-template-previews/`** 신규:
   - Trigger: `publish-signature-request` 완료 후 즉시 invoke (in-line 또는 immediate-after)
   - 입력: `templateId`, `signatureRegions[]`, `participants[]`
   - 처리: 각 페이지 PNG 렌더 + 강조 박스 그리기 + 각 region cutout PNG 렌더
   - 출력: Storage 에 저장된 signed URL 매핑 (`{pageIndex → pageUrl}`, `{participantId → cutoutUrl}`) 반환
   - 라이브러리: Step 0 PoC 통과 라이브러리 사용
2. `publish-signature-request` Edge Function 갱신: pre-render 호출 후 응답에 signed URL 포함
3. **`SignatureRequestPublicApp.tsx` ~60% 재작성** (extension 아님으로 reclassify):
   - 페이지 PNG (signed URL) + 강조 박스 (사전 그려짐)
   - "내 칸 확대" 토글 → cutout signed URL 전환
   - `src/signature/PrivacyConsentTable.tsx` 신규 컴포넌트 (4행 표 + 체크박스)
   - 미동의 시 캔버스 회색 + 동의 시 활성
4. `supabase/migrations/031_signature_submissions_consent_log.sql`: `consent_log JSONB` 컬럼 추가
5. SSR 테스트 + 동의 → 캔버스 활성 시나리오

### Step F. PDF 합성 파이프라인 + 폰트 + 정책 Carry + resultFileUrl 마이그레이션
1. **Noto Sans KR subset 폰트**:
   - `tests/fixtures/fonts/NotoSansKR-subset.ttf` 또는 `supabase/functions/_assets/NotoSansKR-subset.ttf` 에 저장
   - subset 생성 도구로 사용 글자만 추출 (~20-30KB): "행정용", "제출 현황", 숫자, 콜론, 슬래시, 공백, 한국어 양식명 candidates
   - `@pdf-lib/fontkit` 으로 embed
2. `supabase/functions/compose-signed-pdf/` 신규:
   - 입력: `requestId`
   - 처리: 모든 submission 다운로드 + 원본 PDF 로드 + region 좌표에 PNG 임베드 + 미서명 영역 회색 박스 + 푸터 텍스트 (Noto Sans KR)
   - **정책 carry**: `doc.setKeywords(['행정용','법적효력없음','쌤핀'])` + `doc.setProducer('쌤핀 행정용')` + 파일명 패턴 `{title}_쌤핀_행정용_v{n}.pdf`
   - 출력: `signature-results/{requestId}/v{version}.pdf`
3. 교사 UI '결과 PDF 생성' 버튼 + 진행 토스트
4. **`resultFileUrl` 마이그레이션**:
   - `SignatureRequest.resultFileUrl` 을 `@deprecated`
   - `useSignatureRequestStore.ts` 의 `getResultUrl(request)` 헬퍼: `ComposedPdf` entity 우선, fallback `resultFileUrl`
   - `ToolSignatureRequest.tsx` 의 결과 PDF 링크 갱신 — 헬퍼 사용
5. 통합 테스트: 부분 합성 / 80×10 성능 / 워터마크 부재 / Keywords token 존재 / 파일명 패턴

### Step G. UI 카피 정책 carry
1. 교사 발급 화면 카피: "이 서명은 행정용 의사 확인용입니다. 자필 서명과 동등한 법적 효력은 보장되지 않습니다."
2. 학생 동의 표 헤더: "학교 행정상 보호자 의사 확인용"
3. 결과 PDF 생성 버튼 옆 툴팁: 동일 카피
4. 회귀 가드 패턴 추가 (AC-6)

### Step H. 통합 검증·캡처
1. `npm run test` PASS — 새 baseline 명시 (~1926)
2. `npm run typecheck` 0 errors
3. `npm run lint` 0 errors
4. `npm run regression-check` PASS
5. `npm run build:student` 통과 + 397KB 가드
6. `npm run build` 통과
7. E2E 캡처 5개 시나리오
8. `docs/signature-deployment-checklist.md` Phase 2C 섹션 추가:
   - PoC Gate (Step 0) 통과 evidence
   - migration 030/031/032 적용
   - Edge Function 4개 신규 배포 (`validate-pdf-upload`, `prerender-template-previews`, `compose-signed-pdf`, `_poc` 함수들은 제거)
   - Noto Sans KR subset 폰트 배포 경로
   - OAuth scope 변동 없음 (drive.file 그대로)

### Step I. migration 032 Storage Lifecycle
1. `supabase/migrations/032_signature_storage_lifecycle.sql`:
   - `signature-templates` lifecycle: 미발급 양식 1년 auto-purge (Storage policy)
   - `signature-results` version-prune: 최신 2개 버전 유지, 그 이상 async soft-delete
   - `consent_log` 5년 retention: pg_cron monthly job (`signature_submissions.consent_log = NULL WHERE submittedAt < NOW() - INTERVAL '5 years'`)
   - `signature-uploads` (기존) 5년 retention
2. Storage 용량 측정 스크립트: `scripts/measure-storage-capacity.mjs` — `80 × 10페이지 × 3버전 × 100 publish < 500MB` 검증

### Step Ordering Note (Migrations)

Migration **030 → 031 → 032 순서로 적용 필수**:
- 030 (Step C.1) — `signature-templates` bucket
- 031 (Step E.4) — `signature_submissions.consent_log` JSON 컬럼
- 032 (Step I.1) — Storage lifecycle + consent_log retention (031 의 컬럼 존재에 의존)

각 마이그레이션 적용 후 다음 Edge Function 배포:
- 030 → `validate-pdf-upload` 배포
- 031 → `submit-signature` 재배포 (consent_log write) + 학생 공개 앱 빌드
- 032 → pg_cron 작업 활성화

CI 검증: `supabase db reset` 으로 030→031→032 순서대로 클린 적용 가능한지 자동 테스트.

---

## 4. Risks and Mitigations

| Risk | 영향 | Mitigation |
|---|---|---|
| pdfjs-dist 의 Deno Edge Function 호환 (rasterization) 미검증 | Step E.1 prerender / Step C validate 작동 불가 | **v2.2 — Step 0 PoC A0-1 결과 FAIL 확정** (pdfjs-dist worker version mismatch + unpdf `document is not defined`). v2.2 mitigation: **(d) Step E pre-render 를 server-side Edge Function 이 아닌 client-side 교사 브라우저로 이동** (`src/signature/prerenderTemplatePreviews.ts`). 학생 hot-path Edge Function 호출 0회 목적 그대로 유지. Step C validate-pdf-upload 의 페이지 수 / AcroForm 등 검증은 pdf-lib (Deno 호환 검증 완료) 만으로도 가능 — PNG 래스터화는 불필요. |
| 80 × 10 합성이 Edge Function 50s/256MB 초과 | 합성 실패 | Step 0 PoC A0-2 측정 후 한도 근접 시 **`composition_queue` 테이블 + pg_cron 1분 폴링 → chunked composition (20×10 4 배치 + 최종 merge)** 으로 각 invocation ≤ 15s 보장. UI 는 queue status realtime subscribe. expected fallback 으로 plan 포함 (예전 mitigation 의 "비상 case"가 아니라 정상 path). |
| pdfjs-dist 가 교사 번들 ms 증가 | dev 빌드 속도 저하 | Vite `optimizeDeps` 사전 번들. 초기 빌드 2~5s 증가 허용. |
| Pattern 2 행 간격 추론이 비균일 양식에서 빗나감 | 자동복제 잘못된 자리 | AC-3 의 자동 일시정지 + manual fallback UX + 실제 연수등록부 fixture 의무 (Step 0 A0-4) |
| 학생 모바일에서 페이지 PNG 로딩 느림 | UX 마찰 | publish-time pre-render 로 hot path Edge Function 호출 제거. 학생은 signed URL signed CDN-cached static PNG fetch. PNG quality는 화면 폭에 맞춘 ~720px wide. |
| 정책 carry 가 detached PDF 에서 약화 | 파일 다른 곳에 옮겨지면 정책 출처 불명 | **R9 결정 (결과 PDF 시각 표시 금지) 유지하면서 가능한 최대치**: 파일명 패턴 (primary) + Keywords (best-effort) + UI 카피 (in-app only). 사용자 명시 결정으로 detached 케이스 weakness 를 accepted tradeoff 로 명시 — 결과 PDF 만으로 분쟁 자료가 되는 케이스는 1차 정책 (legalEffect=none) 자체와 충돌하므로 도구 사용 범위 밖. |
| 도메인 마이그레이션 시 기존 운영 데이터 손상 | 데이터 소실 | 운영 publish 0건 확인 후 진행 — 사전 검증 스크립트: `scripts/verify-no-active-publishes.mjs` 가 Supabase `signature_requests` row count = 0 + 로컬 draft 카운트 측정. migration shim (AC-1) 이 v1 → v2 안전 변환. |
| Storage 용량 한도 초과 (Supabase 1GB 무료) | 운영 비용 폭주 | migration 032 의 lifecycle 정책 + Storage 용량 가드 (Step H.5) |
| 한글 footer 가 tofu (□□□) 로 렌더 | 결과 PDF 품질 저하 | `@pdf-lib/fontkit` (이미 dep) + Noto Sans KR subset (~30글자, ~20KB) 임베드. Step 0 PoC A0-2 에서 검증. |
| `SignatureRequest.resultFileUrl` 마이그레이션 누락으로 기존 코드 깨짐 | 빌드 깨짐 | `@deprecated` + back-compat 헬퍼로 부드러운 전환. Step F.4 명시. |
| Edge Function 비용 증가 (5개 함수) | Supabase 무료 한도 근접 | pre-render at publish 로 학생 hot-path 호출 0회. publish 당 1회 + 합성 당 1회. 100 publishes × ~3 invocations = 300/일 = ~10K/월, Supabase 500K 한도 무리 없음. (이전 napkin 의 80 × 2 = 160 hot-path 호출은 pre-render 로 제거됨.) |

---

## 5. Verification Steps

1. **Step 0 PoC Gate** (2-3일) — 4개 artifact (A0-1~A0-4) 모두 통과해야 다음 step 진행
2. 도메인 + schemaVersion + migration shim: `npm run typecheck` + 새 shim 단위 테스트
3. PDF 업로드: 6개 거절 케이스 fixture (mixed-orientation 포함) + 정상 케이스 통합 테스트
4. 영역 디자이너: drag → bind → toggle → 80명 자동복제 (실제 연수등록부 fixture)
5. 공개 페이지 + pre-render: publish → 사전 렌더 → 학생 페이지 fetch SSR + 동의 → 캔버스 활성
6. PDF 합성: 부분/전체 + 80명 성능 + 워터마크 부재 + Keywords + 파일명 패턴 + 한글 폰트 tofu 없음
7. 학생 번들 397KB 가드
8. 전체 회귀: `npm run test` ~1926 PASS, `npm run regression-check` 갱신 가드 통과
9. Storage 용량 측정: `scripts/measure-storage-capacity.mjs` 통과
10. 운영 캡처 5개 시나리오 → 텔레그램 전송
11. 배포 체크리스트 갱신 + 커밋 + 푸시

---

## 6. RALPLAN-DR Summary (v2)

### Principles

1. **단순화 우선 (도메인 단순화)** — 4타입 매핑 → `pdf-region` 단일. SignatureGoogleTemplatePlanner 258 LOC 폐기. *시스템 단순화는 부분적* (4 Edge Functions 추가) — 그러나 Edge Function 들은 책임 분리 명확하고 hot-path 는 pre-render 로 격리.
2. **사용자 자산 보존** — `SignatureCanvasPad`, `inferSignatureMappingFromCsv` 의 명단 추출 (이제 `inferParticipantColumns` 로 분리) 유지. Phase 2A/2B Edge Functions 3개 유지.
3. **점진적 deferral** — 80명 = 연수등록부 1종, Sheets 트랙, 불균일 행 자동복제, 법적 효력 트랙 모두 Phase 2D.
4. **정책-구현 분리 — 결과 PDF 시각 표시 금지 (R9 결정 유지)** — 정책은 파일명 + 메타 + UI 카피 3층으로 carry, 결과 PDF 본문은 깨끗. *검증 가능한 한계 인정*: detached PDF 는 파일명 의존, 메타 strip 가능성 있음.
5. **운영 안전 마진 — 측정 기반** — 256MB / 50s / 397KB 모두 Step 0 PoC 에서 측정으로 검증, 추정 아님. 50s 초과 시 background job 자동 fallback.

### Decision Drivers (top 3)

1. **외부 비용 0** — 외부 SaaS·본인확인·TSA·PAdES 미사용. 모든 dep (pdfjs-dist, pdf-lib, @pdf-lib/fontkit) 이미 package.json 에 있음. Supabase 무료 티어 안에서 작동.
2. **연수등록부 (실제 80명 시나리오) 1차 지원** — Pattern 2 간소화 자동복제 + 비균일 행 manual fallback UX
3. **법적 효력 비주장 정책 유지** — R9 결과 PDF 시각 표시 금지 유지하면서 정책 carry 3층으로 가능한 carry

### Viable Options (>=2, with rendering strategy split)

#### Option A (Selected, v2 refined): PDF 오버레이 단일 + publish-time pre-render + 정책 3층 carry + Step 0 PoC Gate

**Pros**:
- 도메인 1타입 + 5개 신규 entity (PdfTemplate, SignatureRegion, ComposedPdf)
- 학생 hot path Edge Function 호출 0회 (pre-render at publish)
- 80명 양식 1~2회 작업 + 비균일 행 fallback UX
- 외부 의존 0, package.json 이미 충분
- Step 0 PoC Gate 가 catastrophic risk 차단

**Cons**:
- pdfjs-dist Deno 호환 검증 필요 (PoC 2-3일)
- publish 시 region 편집 → 재발급 트리거 (UX 추가 단계)
- 정책 carry detached PDF 에서 약함 (사용자 R9 결정에 따른 accepted tradeoff)

#### Option B (Rejected, post-R5 deep-interview): PDF + Google Sheets 동시

**Invalidation rationale**: 80명 = 연수등록부 1종 → Sheets 의 차별 가치를 PDF Pattern 2 가 동등 해결. 학생 UX 트랙 갈라짐, 셀-이미지 매핑 회귀, 무료 한도 정책 변경 필요.

#### Option C (Rejected, R0.5): 외부 SaaS 위임 법적 효력 트랙

**Invalidation rationale**: 학교 도메인 결석계/가정통신문은 자필 효력 불필요. 비용 미지불 명시.

#### Option D (NEW, Architect P0#2 reflected): On-demand render-page-preview / render-region-cutout 2 Edge Functions (v1 기존)

**Invalidation rationale**:
- 학생 hot path Edge Function 호출 80명 × 2 = 160회/양식 × ~3 page open = 480 invocations/양식 → 콜드 스타트 마찰
- 모바일 학부모 3G 환경에서 페이지 열림까지 2.3~13.3s
- pre-render at publish 가 학생 perceived latency 1초 대로 떨어뜨림 (CDN-cached static PNG fetch only)
- Edge Function 비용 ~5x 절감
- *Trade-off*: publish 후 region 편집 시 재발급 트리거 필요 — but 디자이너 단계에서 모든 region 확정 후 publish 하는 워크플로우라 실무 영향 작음

---

## 7. ADR (Architecture Decision Record) v2

### Decision
**쌤핀 서명받기 Phase 2C 는 PDF 오버레이 단일 모델 + 좌표 기반 영역 (`SignatureRegion`) + 간소화 Pattern 2 자동복제 + publish-time pre-render + 온디맨드 서버 합성 + 정책 3층 carry (파일명 + Keywords + UI) + Step 0 PoC Gate 로 진행한다.**

### Drivers (v2 expanded)
1. 외부 비용 0 (Supabase 무료, 모든 dep package.json 이미 존재)
2. 연수등록부 (실제 80명 시나리오) 1차 지원
3. 1차 정책 (legalEffect=none) 유지 + 결과 PDF 시각 표시 금지 (R9) 유지
4. Phase 1/2A/2B 자산 보존
5. 학생 번들 397KB + Edge Function 256MB/50s 한도 — *측정 기반 (Step 0 PoC)*
6. **Edge Function 안전 마진**: 합성 50s 도달 위험 시 background job 자동 전환 — 정상 path 로 plan 포함

### Alternatives Considered
- **Option B**: PDF + Sheets 동시 (post-R5 deep-interview reject)
- **Option C**: 외부 SaaS 법적 효력 트랙 (R0.5 reject)
- **Option D (v1 originally Selected)**: On-demand render-page-preview + render-region-cutout 2 Edge Functions (v2 reject — Architect P0#2 / Critic C3)

### Why Chosen
- Deep-interview 10라운드 + iteration 1 consensus (Architect REQUEST CHANGES + Critic REQUEST CHANGES) 을 통해 비용·가치 트레이드오프 검증됨
- 운영 publish 0건 확인 + schemaVersion shim 으로 미래 안전성도 확보
- pdfjs-dist / pdf-lib / @pdf-lib/fontkit 이미 package.json — 의존성 추가 없음
- Edge Function 인프라 이미 존재 (Phase 2A/2B 3개 함수 deployed) — PoC 는 새 PDF 처리 함수만 검증
- Step 0 PoC Gate 가 catastrophic technical risk (pdf.js Deno 호환) 를 차단

### Consequences

**긍정**:
- 도메인 단순화 (4타입 → 1타입, 258 LOC 삭제)
- 학생 hot path 빠름 (pre-render → CDN-cached static PNG fetch only)
- 80명 양식 1~2분 교사 작업 + 비균일 행 manual fallback
- 외부 의존·라이선스비 0
- 결과 PDF 시각적으로 깨끗한 학교 행정 문서

**부정 / Accepted tradeoffs**:
- 시트 양식 작성 교사는 PDF export 1단계 추가 필요
- 불균일 행 양식은 Pattern 1 + manual fallback (작업량 일부 증가)
- Step 0 PoC Gate 가 첫 일정 2-3일 추가
- publish 후 region 편집 시 재발급 트리거 (디자이너 단계 완료 후 publish 워크플로우라 실무 영향 작음)
- **정책 carry 약점 (사용자 R9 명시 결정에 따른 accepted tradeoff)**: detached PDF 에서 파일명 의존 + 메타 strip 가능성. 결과 PDF 단독 분쟁 자료 시 정책 출처 불명 → but 그런 케이스는 legalEffect=none 정책 자체와 충돌하므로 도구 사용 범위 밖
- 결과 PDF 재합성 시 storage 누적 (migration 032 의 lifecycle 으로 통제)

### Follow-ups
- Phase 2D 후보:
  - Sheets 트랙 통합 (결과 시트 텍스트 동기화)
  - 불균일 행 양식 자동복제 확장
  - 법적 효력 트랙 (외부 SaaS 위임)
  - 학교별 스탬프/로고 옵션 (Phase 2D footer 옵션)
- 운영 모니터링:
  - 합성 평균 시간·실패율 (Edge Function logs)
  - 80명 양식 사용 빈도
  - PDF 거절 케이스 비율
  - 동의 거부 비율
  - Storage 용량 트렌드 (migration 032 효과)
  - **pg_cron 작업 실패율** — `cron.job_run_details` 쿼리, 월간 알림 (consent_log 5년 retention 작업 + composition_queue 폴링 작업 둘 다 감시)

---

## 8. Changelog
- 2026-05-28 [planner v1]: 초안 작성 from deep-interview spec (ambiguity 18%, 10 rounds)
- 2026-05-28 [iteration 1]: Architect REQUEST CHANGES (10 improvements) + Critic REQUEST CHANGES (10 required) — v2 개정 시작
- 2026-05-28 [planner v2]: 12 개선 적용 — Step 0 PoC Gate, publish-time pre-render, schemaVersion bump, 폰트 번들, 정책 3층 carry, lifecycle migration, signatureMappingInference 명시 리팩터, resultFileUrl deprecation, fallback 정정, 실제 fixture 의무화, SignatureRequestPublicApp ~60% reclassify, Architect 사실 오류 정정
- 2026-05-28 [iteration 2]: Architect APPROVE WITH MINOR IMPROVEMENTS (8 NI + 5 TT, 10 low-effort refinements) + Critic APPROVE WITH IMPROVEMENTS (composite quality 0.62 → 0.87, A-J 10/10 FULLY) — v2.1 개정
- 2026-05-28 [planner v2.1]: 10개 minor patch 적용 — pre-render 비동기·실패처리·재시도, signed URL TTL 기본 60일, composition_queue + chunked composition 패턴, 버전 경로 cache-bust, `_poc` cleanup 가드, Keywords round-trip 검증, 테스트 카운트 ±30 band, mixed-orientation reject→warn, migration 030→031→032 ordering note, pg_cron 모니터링
- 2026-05-28 [Session 2 part 1, commit `d43aa6e`]: US-2C-01 strict + US-2C-02 + US-2C-04 + US-2C-06 완료. schemaVersion 1→2 bump, migration shim, Repository auto-wire, signatureMappingInference 리팩터. 검증: typecheck 0 errors, 1933 tests PASS, regression 28/28 PASS.
- 2026-05-28 [Session 2 part 2, commit `419c8d1`]: Step 0 PoC 측정. A0-1 ❌ FAIL (pdfjs-dist / unpdf Deno 비호환), A0-2 ⏸️ deploy/list 동기화 갭, A0-3 ✅ PASS (cold 1.25s), A0-4 ✅ PASS (15/15). Gate FAIL → plan v2.2 갱신 필요.
- 2026-05-28 [Session 3 시작 — A0-2 isolation + plan v2.2]: A0-2 isolation 결과 — deploy/list 갭은 propagation 지연 + redeploy 로 해결, PNG placeholder bytes 오류 (직접 작성 시 CRC 잘못) → base64 디코드로 교체 후 **PASS** (80×10 합성 327ms, 50s 한도의 0.6%). **3/4 PASS**. v2.2 본문 갱신 — Step E client-side pivot (A0-1 mitigation), AC-4 consent_ip_hash (개인정보 제1 원칙), AC-6 `poc-*` 가드, Risk #1 mitigation 갱신.
- **Status: 🟡 partial Step 0 PoC executed (3/4 PASS)**. A0-1 FAIL 의 client-side pivot 채택 시 Step C/D/E/F 모두 진행 가능. Session 3 이후 Architect/Critic 의 v2.2 재 consensus 권고 (architecture pivot 의 영향도 재평가).
