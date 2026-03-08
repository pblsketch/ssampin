# 쌤핀 AI 챗봇 환경변수 설정

## Supabase Edge Functions (서버 사이드)

| 변수 | 설명 | 설정 위치 |
|------|------|-----------|
| `GOOGLE_API_KEY` | Gemini API 키 | Supabase Secrets |
| `ADMIN_API_KEY` | 임베딩 관리 API 인증 키 | Supabase Secrets |
| `DEVELOPER_EMAIL` | 에스컬레이션 알림 이메일 | Supabase Secrets |
| `RESEND_API_KEY` | Resend 이메일 전송 API 키 | Supabase Secrets |

## 임베딩 스크립트 (로컬 / CI)

| 변수 | 설명 | 설정 위치 |
|------|------|-----------|
| `GOOGLE_API_KEY` | Gemini API 키 | `.env` 또는 GitHub Secrets |
| `SUPABASE_URL` | Supabase 프로젝트 URL | `.env` 또는 GitHub Secrets |
| `SUPABASE_SERVICE_ROLE_KEY` | 서비스 역할 키 (⚠️ 공개 금지) | `.env` 또는 GitHub Secrets |

## 랜딩페이지 (Vercel)

| 변수 | 설명 | 설정 위치 |
|------|------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | Vercel Environment Variables |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 클라이언트용 익명 키 | Vercel Environment Variables |

## Electron 앱 (Vite)

| 변수 | 설명 | 설정 위치 |
|------|------|-----------|
| `VITE_SUPABASE_URL` | Supabase 프로젝트 URL | `.env` |
| `VITE_SUPABASE_ANON_KEY` | 클라이언트용 익명 키 | `.env` |

## GitHub Actions (CI/CD)

Repository → Settings → Secrets and variables → Actions:

| Secret 이름 | 값 |
|-------------|-----|
| `GOOGLE_API_KEY` | Google AI Studio API 키 |
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | 서비스 역할 키 |

## 보안 주의사항

- `SERVICE_ROLE_KEY`는 절대 클라이언트에 노출하지 마세요
- `ANON_KEY`만 클라이언트(브라우저/앱)에서 사용합니다
- `.env` 파일은 `.gitignore`에 포함되어 있어야 합니다
- Supabase RLS 정책이 `service_role`만 허용하도록 설정되어 있습니다
