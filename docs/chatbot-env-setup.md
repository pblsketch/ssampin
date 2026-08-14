# 쌤핀 AI 챗봇 환경변수 설정

## 어떤 모델이 무슨 일을 하나

| 역할                                       | 모델                               | 비고                                                   |
| ------------------------------------------ | ---------------------------------- | ------------------------------------------------------ |
| 답변 생성 (최종 답변 · HyDE · 문서 재정렬) | 업스테이지 **Solar Pro 3**         | 실패하면 자동으로 Gemini 로 폴백                       |
| 임베딩 (질문·문서를 검색용 벡터로 변환)    | **gemini-embedding-001** (768차원) | 문서 테이블이 `vector(768)` 로 고정돼 있어 Gemini 유지 |

즉 `GOOGLE_API_KEY`는 **계속 필요**합니다(임베딩 + 폴백). 다만 답변 생성이 업스테이지로 넘어가면서 Gemini 호출량은 크게 줄어듭니다.

## Supabase Edge Functions (서버 사이드)

| 변수               | 설명                                            | 필수 | 설정 위치        |
| ------------------ | ----------------------------------------------- | ---- | ---------------- |
| `UPSTAGE_API_KEY`  | 업스테이지 API 키 (답변 생성)                   | 권장 | Supabase Secrets |
| `UPSTAGE_MODEL`    | 답변 생성 모델. 기본 `solar-pro3`               | 선택 | Supabase Secrets |
| `UPSTAGE_BASE_URL` | 기본 `https://api.upstage.ai/v1`                | 선택 | Supabase Secrets |
| `GOOGLE_API_KEY`   | Gemini API 키 (임베딩 + 폴백)                   | ✅   | Supabase Secrets |
| `GEMINI_MODEL`     | 폴백 모델. 기본 `gemini-3.1-flash-lite-preview` | 선택 | Supabase Secrets |
| `ADMIN_API_KEY`    | 임베딩 관리 API 인증 키                         | ✅   | Supabase Secrets |
| `DEVELOPER_EMAIL`  | 에스컬레이션 알림 이메일                        | ✅   | Supabase Secrets |
| `RESEND_API_KEY`   | Resend 이메일 전송 API 키                       | ✅   | Supabase Secrets |

### 업스테이지 키 등록 / 모델 교체

```bash
npx supabase secrets set UPSTAGE_API_KEY=up_xxxxxxxx
npx supabase secrets set UPSTAGE_MODEL=solar-pro4   # 모델만 바꾸고 싶을 때
npx supabase functions deploy ssampin-chat --use-api
```

`UPSTAGE_API_KEY`를 지우면 코드 변경 없이 예전처럼 Gemini 단독으로 돌아갑니다.

> 무료 사용 기간: 2027-03-31 (Upstage x AWS AI initiative program — Solar-Pro / Document-Parse)

## 임베딩 스크립트 (로컬 / CI)

| 변수                        | 설명                          | 설정 위치                  |
| --------------------------- | ----------------------------- | -------------------------- |
| `GOOGLE_API_KEY`            | Gemini API 키                 | `.env` 또는 GitHub Secrets |
| `SUPABASE_URL`              | Supabase 프로젝트 URL         | `.env` 또는 GitHub Secrets |
| `SUPABASE_SERVICE_ROLE_KEY` | 서비스 역할 키 (⚠️ 공개 금지) | `.env` 또는 GitHub Secrets |

## 랜딩페이지 (Vercel)

| 변수                            | 설명                  | 설정 위치                    |
| ------------------------------- | --------------------- | ---------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Supabase 프로젝트 URL | Vercel Environment Variables |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 클라이언트용 익명 키  | Vercel Environment Variables |

## Electron 앱 (Vite)

| 변수                     | 설명                  | 설정 위치 |
| ------------------------ | --------------------- | --------- |
| `VITE_SUPABASE_URL`      | Supabase 프로젝트 URL | `.env`    |
| `VITE_SUPABASE_ANON_KEY` | 클라이언트용 익명 키  | `.env`    |

## GitHub Actions (CI/CD)

Repository → Settings → Secrets and variables → Actions:

| Secret 이름                 | 값                         |
| --------------------------- | -------------------------- |
| `GOOGLE_API_KEY`            | Google AI Studio API 키    |
| `SUPABASE_URL`              | `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | 서비스 역할 키             |

## 보안 주의사항

- `SERVICE_ROLE_KEY`는 절대 클라이언트에 노출하지 마세요
- `ANON_KEY`만 클라이언트(브라우저/앱)에서 사용합니다
- `.env` 파일은 `.gitignore`에 포함되어 있어야 합니다
- Supabase RLS 정책이 `service_role`만 허용하도록 설정되어 있습니다
