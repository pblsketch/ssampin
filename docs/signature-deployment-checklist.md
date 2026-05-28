# 서명받기 도구 — 배포 체크리스트 (Phase 2C v2)

쌤핀 "서명받기" 도구를 실제 학교 현장에 처음 배포할 때 필요한 단계 모음. 본 문서는 1차 정책(법적 효력 비주장 · 자동 리마인드 없음 · 강한 신원확인 없음)을 따른다.

순서대로 진행하면 교사가 명단을 등록 → 공개 링크 발급 → 학생/학부모가 손글씨 서명 제출 → Supabase에 안전하게 저장되는 end-to-end 흐름이 켜집니다.

---

## 1. 사전 준비

- [ ] Supabase 프로젝트 1개 (서비스 리전: ap-northeast-2 권장)
- [ ] Supabase CLI 로그인 (`npx supabase login`)
- [ ] 공개 페이지를 호스팅할 정적 도메인 1개 (예: `https://sign.ssampin.app`)
  - Vercel/Netlify/Cloudflare Pages 등 무료 티어로 충분
  - `npm run build:student` 산출물 또는 별도 정적 페이지를 올림
- [ ] 본 저장소 클론 + `npm install` 완료

---

## 2. Supabase 마이그레이션 적용

Phase 2C v2 까지 누적 마이그레이션 029 → 033 적용:

| Migration | 추가 자원                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 029       | `signature_requests` / `signature_participants` / `signature_submissions` + `signature-images` private bucket + RLS            |
| 030       | `signature_requests.pdf_template` / `regions` / `region_version` JSONB 컬럼 + `signature-templates` bucket (private, PDF only) |
| 031       | `signature-previews` bucket (public read, 5MB, PNG only) — 학생 hot-path 직접 GET                                              |
| 032       | `signature_submissions.consent_log` JSONB + `consent_ip_hash` TEXT — 4행 동의 표 결과 + IP SHA-256                             |
| 033       | `signature_compositions` 테이블 + `signature-results` bucket (private, 30MB, PDF only) — 합성 PDF 버전 이력                    |

```bash
# 프로젝트 링크
npx supabase link --project-ref <your-ref>

# 029 ~ 033 마이그레이션 적용
npx supabase db push
```

확인:

- [ ] 029 ~ 033 5개 마이그레이션 모두 successfully applied
- [ ] 4 bucket (`signature-images` / `signature-templates` / `signature-previews` / `signature-results`) 생성 — `signature-previews` 만 public read, 나머지 3개는 private
- [ ] `signature_compositions` PK (`request_id`, `version`) 존재
- [ ] `signature_submissions.consent_log_is_array` CHECK 제약 활성화
- [ ] RLS 정책이 service_role 외 직접 read/write 를 차단

---

## 3. Edge Function 배포

Phase 2C v2 까지 누적 6 개 함수 배포:

```bash
npx supabase functions deploy publish-signature-request
npx supabase functions deploy get-signature-request-public
npx supabase functions deploy submit-signature
npx supabase functions deploy validate-pdf-upload
npx supabase functions deploy upload-signature-preview
npx supabase functions deploy compose-signed-pdf
```

배포 후 endpoint 확인:

- [ ] `publish-signature-request` (교사 발급, anon key + adminKey 발급, pdf_template / regions 검증)
- [ ] `get-signature-request-public` (공개 페이지 로드, anon key, PDF 양식 + region preview publicUrls 반환)
- [ ] `submit-signature` (서명 PNG 업로드 + consent_log/consent_ip_hash 저장, anon key)
- [ ] `validate-pdf-upload` (교사 PDF 양식 검증 + signature-templates 업로드, anon key)
- [ ] `upload-signature-preview` (클라이언트 pre-render PNG 업로드, service_role only effective)
- [ ] `compose-signed-pdf` (결과 PDF 합성, Noto Sans KR fetch, signature-results 저장, adminKey 필수)

PoC 함수 (`poc-compose-stress` / `poc-measure-cold` / `poc-render-pdf-page`) 는 배포하지 않는다.

함수의 환경 변수는 Supabase Studio > Edge Functions > Secrets 에서 설정합니다 (service_role 은 platform 이 자동 주입).

---

## 4. 환경 변수 설정

루트 `.env`에 다음을 채웁니다 (`.env.example` 참고):

```bash
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
VITE_SIGNATURE_PUBLIC_BASE_URL=https://sign.ssampin.app
```

확인:

- [ ] `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 둘 다 채워짐 → `isSupabaseConfigured()` 가 `true`
- [ ] `VITE_SIGNATURE_PUBLIC_BASE_URL` 이 공개 페이지가 실제 호스팅되는 도메인을 가리킴
- [ ] 셋 중 하나라도 비어 있으면 도구는 "오프라인 임시 저장" 모드로 떨어지고 발급/제출이 막힌다는 사실을 운영자가 인지

---

## 5. 공개 페이지(학생/학부모용) 배포

같은 코드베이스의 student 번들이 서명받기 라우트(`/sign/[id]`)를 자동 감지합니다.

```bash
npm run build:student
# 산출물: dist-student/
```

산출물을 정적 호스팅(예: Vercel)에 배포한 뒤 도메인을 `VITE_SIGNATURE_PUBLIC_BASE_URL` 과 일치시킵니다.

확인:

- [ ] `https://sign.ssampin.app/sign/test-id` 접근 시 "연결 준비 중" 화면이 떠야 함 (잘못된 id 라서 OK)
- [ ] 학생 번들 크기가 ~397KB 이하 유지 (`npm run regression-check`)

---

## 6. 첫 운영 테스트 시나리오

서명받기 도구 → 새 양식 등록 흐름:

1. 교사 앱 실행 (`npm run electron:dev`)
2. 서명받기 도구 진입 → Google Sheets 명단 URL 붙여넣기 → "자동 채우기"
3. 명단/매핑/링크 옵션(공통 vs 개별, PIN) 확인 → "초안 저장"
4. "공개 링크 발급" 클릭
5. 발급된 URL 1개를 모바일에서 열기
6. 손글씨 서명 → "서명 제출"
7. 교사 화면에서 "미서명/일부 서명/완료" 상태가 갱신되는지 확인

체크:

- [ ] 공통 모드: 명단에서 본인 선택 → 이름/PIN/서명 → 제출 성공
- [ ] 개별 모드: URL에 token 포함 → 본인이 자동 식별됨 → 이름/PIN/서명 → 제출 성공
- [ ] 잘못된 PIN: "PIN이 일치하지 않습니다" 등 한국어 에러 표시
- [ ] 빈 서명: "이름, 대상자, 손글씨 서명을 모두 입력해 주세요" 가드

---

## 7. 운영 검증 명령

배포 직전 또는 PR merge 직전에:

```bash
npm run test               # 1993 PASS + 10 skipped (2003 total — Phase 2C +78)
npm run typecheck          # 0 errors
npm run regression-check   # 35 PASS (Phase 2C 신규 7 gates 포함)
npm run lint               # 0 errors (pre-existing warnings 만)
npm run build:student      # 학생 번들 ≤ 397KB 유지
npm run build              # 전체 빌드 (web + Electron) PASS
```

모두 통과해야 PR mergeable.

Phase 2C v2 회귀 가드 (regression-grep-check.mjs):

- #29 SignatureMappingTargetType = 'pdf-region' 단일 literal
- #30 compose-signed-pdf setKeywords ['행정용', '법적효력없음'] 메타
- #31 결과 PDF 파일명 패턴 `{title}_쌤핀_행정용_v{n}.pdf`
- #32 PrivacyConsentTable 4행 동의 항목 (4 ID 모두)
- #33 Noto Sans KR 폰트 로드
- #34 compose-signed-pdf 시각 워터마크 drawText 부재
- #35 submit-signature raw IP/UA DB 저장 부재 (해시만)

---

## 8. 1차 정책 가드 (절대 위반 금지)

다음 행동은 본 도구의 1차 릴리스 범위가 아닙니다. 코드/문구에서 다음을 약속하면 안 됩니다:

- ❌ "법적 효력이 있는 전자서명"
- ❌ "자동 리마인드 발송"
- ❌ "본인인증/신원확인 완료"
- ❌ 합성 결과 PDF 본문에 시각 워터마크/배너 추가 (행정용 표시는 `setKeywords/setProducer` 메타만)
- ❌ raw client IP / User-Agent / 강한 식별자를 DB 에 저장 (SHA-256 해시 `ip_hash`/`consent_ip_hash`/`user_agent_hash` 만 허용)
- ❌ 외부 SaaS (Adobe Sign, DocuSign, HelloSign 등) 호출

3 위치 공통 카피 (`src/signature/signatureLegalCopy.ts` 단일 정의):

> 이 서명은 행정용 의사 확인용입니다. 자필 서명과 동등한 법적 효력은 보장되지 않습니다.

회귀 가드: `npm run regression-check` 가 위 문구의 존재/부재를 자동 검증합니다.

---

## 9. Phase 2C 완료 사항 + 후속 (G007 / Phase 3) 로 미루어진 항목

Phase 2C v2 완료 (US-2C-08 ~ US-2C-15):

- 교사 PDF 양식 업로드 + `SignatureRegionDesigner` 좌표 기반 region 매핑
- 클라이언트 사이드 pre-render (`prerenderTemplatePreviews` + `upload-signature-preview`) — 학생 hot-path Edge Function 0회
- 학생 PDF 페이지 PNG 미리보기 + 내 칸 확대 토글 + 4행 동의 표 (`PrivacyConsentTable`)
- 결과 PDF 합성 (`compose-signed-pdf` + Noto Sans KR + 시각 워터마크 부재)
- `useSignatureRequestStore.getResultUrl` 헬퍼 (ComposedPdf 우선, resultFileUrl fallback)
- 3 위치 legal disclaimer 공통 카피 + 7 회귀 가드

G007 (US-2C-16) 후속 작업:

- migration 034 — Storage lifecycle (signature-templates 1년 auto-purge / signature-results 최신 2 버전 / consent_log 5년 retention pg_cron / signature-images 5년)
- `scripts/measure-storage-capacity.mjs` — 80×10×3×100 < 500MB 검증
- pg_cron 작업 실패율 모니터링 + ai-slop-cleaner + code-review

Phase 3 (별도 ralplan):

- 학부모-학생 이중 서명 흐름의 UI 폴리시
- 결과 PDF Long-term retention (5년 후 자동 압축 archive 등)
- (참고) Google Docs/Sheets 자동 반영 흐름은 Phase 2C 에서 PDF 오버레이로 대체됨

---

## 10. 문제 발생 시

- Edge Function 응답이 500 → Supabase Studio > Edge Functions > Logs
- 학생이 "연결 준비 중" 에서 멈춤 → `VITE_SUPABASE_URL/ANON_KEY` 확인, RLS 정책 확인
- 발급된 링크가 빈 도메인 → `VITE_SIGNATURE_PUBLIC_BASE_URL` 미설정
- 서명 PNG 가 업로드 안 됨 → `signature-images` bucket 이 private 인지, RLS 가 service_role 통과를 허용하는지
- PDF 양식 업로드 실패 → `signature-templates` bucket 10MB / PDF only 한도 + `validate-pdf-upload` Edge Function 로그
- 학생 페이지 페이지 PNG 가 안 보임 → `signature-previews` bucket public read 활성 + 교사 publish 시 `prerenderTemplatePreviews` 가 완료됐는지 (브라우저 콘솔 progress 확인)
- 결과 PDF 합성 실패 → `compose-signed-pdf` Edge Function 로그 + Noto Sans KR fetch 가 GitHub raw 에서 차단되지 않았는지
- 결과 PDF 한글 글자가 □ (tofu) 로 보임 → Edge Function 콜드 스타트 시 폰트 캐시 미스 — 1회 재시도로 회복

각 케이스별 상세는 `docs/troubleshoot-guide.md` 참고.
