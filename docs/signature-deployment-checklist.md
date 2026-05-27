# 서명받기 도구 — 배포 체크리스트 (Phase 2B)

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

서명받기 도구는 `signature_requests` 테이블, `signature_submissions` 테이블, `signature-uploads` private bucket, 그리고 RLS 정책을 필요로 합니다.

```bash
# 프로젝트 링크
npx supabase link --project-ref <your-ref>

# 029 마이그레이션 적용 (RLS + private bucket)
npx supabase db push
```

확인:

- [ ] `signature_requests` 테이블 존재
- [ ] `signature_submissions` 테이블 존재
- [ ] Storage > `signature-uploads` 버킷이 `private` 으로 생성됨
- [ ] RLS 정책이 service_role 외 직접 read/write를 차단함

---

## 3. Edge Function 배포

세 개의 함수를 모두 배포합니다.

```bash
npx supabase functions deploy publish-signature-request
npx supabase functions deploy get-signature-request-public
npx supabase functions deploy submit-signature
```

배포 후 함수별 endpoint를 확인:

- [ ] `https://<ref>.supabase.co/functions/v1/publish-signature-request` (교사 발급, anon key 인증 + adminKey 발급)
- [ ] `https://<ref>.supabase.co/functions/v1/get-signature-request-public` (공개 페이지 로드, anon key)
- [ ] `https://<ref>.supabase.co/functions/v1/submit-signature` (제출 + PNG 업로드, anon key)

함수의 환경 변수는 Supabase Studio > Edge Functions > Secrets 에서 설정합니다 (service_role은 platform이 자동 주입).

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
npm run test           # 통합 + 단위 (전부 통과)
npm run typecheck      # 0 errors
npm run regression-check  # 30+ PASS (캔버스 + 핵심 카피 가드)
npm run lint           # 0 errors
npm run build:student  # 학생 번들 빌드 + 사이즈 확인
npm run build          # 전체 빌드
```

모두 통과해야 PR mergeable.

---

## 8. 1차 정책 가드 (절대 위반 금지)

다음 행동은 본 도구의 1차 릴리스 범위가 아닙니다. 코드/문구에서 다음을 약속하면 안 됩니다:

- ❌ "법적 효력이 있는 전자서명"
- ❌ "자동 리마인드 발송"
- ❌ "본인인증/신원확인 완료"
- ❌ Google Sheets 셀에 서명 이미지가 항상 자동 삽입됨 (공개 URL인 경우에만 IMAGE 공식 사용 가능 — Phase 2C)

회귀 가드: `npm run regression-check` 가 위 문구의 존재/부재를 검증합니다.

---

## 9. Phase 2C 로 미루어진 항목

- Google Docs/Sheets 결과 파일 자동 반영 (`apply-signature-to-google` Edge Function)
- OAuth scope 확장 (drive.file + documents + spreadsheets)
- 학부모-학생 이중 서명 흐름의 UI 폴리시

위 항목은 본 체크리스트 범위 밖이며, 본 문서를 따라 배포해도 도구의 핵심 가치 (명단 등록 → 링크 발급 → 손글씨 서명 수집)는 완전히 동작합니다.

---

## 10. 문제 발생 시

- Edge Function 응답이 500 → Supabase Studio > Edge Functions > Logs
- 학생이 "연결 준비 중" 에서 멈춤 → `VITE_SUPABASE_URL/ANON_KEY` 확인, RLS 정책 확인
- 발급된 링크가 빈 도메인 → `VITE_SIGNATURE_PUBLIC_BASE_URL` 미설정
- 서명 PNG 가 업로드 안 됨 → `signature-uploads` bucket이 private 인지, RLS가 service_role 통과를 허용하는지

각 케이스별 상세는 `docs/troubleshoot-guide.md` 참고.
