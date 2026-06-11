# 서명받기 도구 — 배포 체크리스트 (sigv2)

쌤핀 "서명받기" 도구를 실제 학교 현장에 처음 배포할 때 필요한 단계 모음.

> ⚠️ 이 문서는 sigv2 구조(마이그레이션 035, `sig-*` Edge Functions) 기준입니다.
> 이전 Phase 2C 구조(마이그레이션 029~033, `publish-signature-request` 등)는 폐기되어
> 마이그레이션 036(`drop_abandoned_signature_2c`)으로 정리되었습니다.

---

## 1. 아키텍처 한눈에

```
[교사 데스크톱 앱 (Electron)]
  ToolSignatureRoster ──→ sig-publish ──→ Supabase (signature 세션 + 명단 스냅샷)
        │                                     ↑
        │ QR/링크: https://ssampin.com/sign/{shortLinkCode}
        ▼                                     │
[학생/학부모 휴대폰]
  ssampin.com/sign/* ──(랜딩 redirect, landing/vercel.json)──→ m.ssampin.com/sign/*
  StudentSignatureApp(모바일 번들) ──→ sig-get-public / sig-submit (anon key)
        │
[교사 현황 보드] ──→ sig-status (adminKey, 10초 폴링)
[등록부 생성]   ──→ Google Sheets API(교사 OAuth) + sig-delete-session
```

- **링크 도메인**: 사용자에게 보이는 링크는 `ssampin.com/sign/{code}` —
  랜딩(`landing/vercel.json`의 `redirects`)이 `m.ssampin.com/sign/{code}`로 307 리다이렉트한다.
- **공개 페이지 호스팅**: 별도 사이트가 아니라 **모바일 PWA 번들**(`src/mobile/main.tsx`)이
  `/sign/{code}` 경로를 감지해 `StudentSignatureApp`만 마운트한다.
  루트 `vercel.json`의 `/(.*) → /mobile.html` rewrite 덕분에 어떤 `/sign/...` 경로도 SPA로 진입한다.
- 랜딩 redirect가 없던 시절 베이스 URL을 ssampin.com으로 잡아 404가 났었다 —
  redirect(landing)와 베이스 URL(.env)은 항상 쌍으로 확인할 것.

## 2. Supabase 준비

```bash
npx supabase link --project-ref ddbkyaxvnpaxkbqbpijg
npx supabase db push          # 035_sigv2_signature_schema.sql (+ 036 정리)
```

Edge Functions 5종 배포:

```bash
npx supabase functions deploy sig-publish --no-verify-jwt
npx supabase functions deploy sig-get-public --no-verify-jwt
npx supabase functions deploy sig-submit --no-verify-jwt
npx supabase functions deploy sig-status --no-verify-jwt
npx supabase functions deploy sig-delete-session --no-verify-jwt
```

확인: `npx supabase functions list --project-ref ddbkyaxvnpaxkbqbpijg` 에서 5종 모두 ACTIVE.
(2026-06-05 기준 5종 모두 배포 완료 상태)

## 3. 환경 변수 (.env — 데스크톱 빌드 시점에 박힘)

```bash
VITE_SUPABASE_URL=https://ddbkyaxvnpaxkbqbpijg.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
# 랜딩이 /sign/* 을 m.ssampin.com 으로 리다이렉트 (landing/vercel.json)
VITE_SIGNATURE_PUBLIC_BASE_URL=https://ssampin.com
```

- [ ] 셋 모두 채워짐 (`.env` 누락 시 발급 링크 도메인이 비거나 publish 실패)
- [ ] **v2.0.8 사고 재발 방지**: 빌드 후 산출물에서 값 주입 여부 grep 검증

## 4. 공개 페이지(모바일 번들) 배포

`/sign` 처리 코드는 모바일 번들에 포함되므로, **이 기능이 포함된 커밋이 main에 푸시되어
Vercel(ssampin-mobile 프로젝트, m.ssampin.com)이 재배포된 뒤에야 링크가 동작한다.**

- [ ] 서명받기 코드가 main에 커밋·푸시됨 → Vercel 자동 배포 완료 (모바일 + 랜딩 둘 다)
- [ ] `https://ssampin.com/sign/test123` 접속 시 m.ssampin.com으로 넘어가며
      "세션을 찾을 수 없거나 이미 마감되었습니다" 표시 (잘못된 코드라서 OK)
- [ ] 리다이렉트가 안 되면 랜딩 재배포 누락 — `landing/vercel.json`의 redirects 반영 확인
- [ ] 모바일 교사 앱이 뜨면 m.ssampin.com 번들이 구버전 — 모바일 재배포 확인

## 5. 첫 운영 테스트 시나리오

1. 교사 앱 실행 → 쌤도구 → 서명받기
2. 제목·머리말 입력 → 명단 구성(담임반/수업반/CSV/붙여넣기) → 열 확인
3. 공개 설정(중복 잠금·접근 코드) → "서명 페이지 공개하기"
4. QR을 휴대폰으로 스캔 → 소속/이름 선택 → 서명 → 제출
5. 교사 현황 보드에서 10초 내 완료 표시 확인
6. "구글시트 생성" → 서명 이미지가 `=IMAGE()`로 박힌 등록부 확인
7. "Excel 내보내기" → 서명 PNG 임베드 .xlsx 확인
8. "세션 삭제" → 수집물 삭제 확인

## 6. 1차 정책 가드 (절대 위반 금지)

- ❌ "법적 효력이 있는 전자서명" / "본인인증 완료" 문구 금지
- ❌ raw IP / User-Agent 저장 금지
- ❌ 외부 전자서명 SaaS 호출 금지
- 공통 카피는 `src/signature/signatureLegalCopy.ts` 단일 정의:
  > 이 서명은 행정용 의사 확인용입니다. 자필 서명과 동등한 법적 효력은 보장되지 않습니다.

## 7. 문제 발생 시

| 증상                             | 원인/조치                                                                  |
| -------------------------------- | -------------------------------------------------------------------------- |
| 링크 접속 시 404                 | 랜딩의 `/sign/*` redirect 누락(landing/vercel.json) 또는 랜딩 재배포 안 됨 |
| 링크 접속 시 모바일 교사 앱이 뜸 | m.ssampin.com 번들이 구버전 → main 푸시·Vercel 재배포                      |
| "연결을 준비하지 못했습니다"     | `VITE_SUPABASE_URL/ANON_KEY` 누락 또는 Edge Function 미배포                |
| "세션을 찾을 수 없습니다"        | 잘못된 코드, 삭제된 세션, 또는 sig-get-public 로그 확인                    |
| 서명이 시트에 안 보임            | sig-status 응답의 `signaturePublicUrl` 확인 + 스토리지 public read         |
| Edge Function 500                | Supabase Studio > Edge Functions > Logs                                    |
