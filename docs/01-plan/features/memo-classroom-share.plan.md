# 메모 교실 공유 (memo-classroom-share) — Plan v0.3

> 작성: 2026-06-11 · 상태: 저장소 아키텍처 변경 확정 → Design v0.2 진행
>
> **확정된 결정 (2026-06-11)**
>
> - 이미지 첨부 메모도 v1부터 공유
> - 교실 페이지 디자인: **미니멀 그리드**
> - **저장소: Supabase → 선생님 개인 Google Drive로 변경** (정보 유출 우려, 사용자 결정)
>   - 수용한 트레이드오프: 실시간 푸시 → 5~10초 폴링 / 구글 로그인 필수(기존 동기화 재사용) / 학교 워크스페이스 계정의 링크 공유 차단 → 개인 계정 안내 / 이미지는 Drive 파일 방식
>   - 기존 `drive.file` 스코프로 충분 — **구글 OAuth 재심사 불필요** (GoogleOAuthClient.ts:62 확인)
> - 본 문서의 §3~§4 Supabase 아키텍처 서술은 v0.2 시점 기록이며, **최신 아키텍처는 Design v0.2가 단일 진실**

## 1. 한 줄 요약

교사가 쌤핀 메모(포스트잇)를 골라 "교실 보드"로 묶으면, 고정 링크 페이지에서 학생들이 실시간으로 읽을 수 있다. 전자칠판에 웹앱(아이콘)으로 설치 가능, 라이트/다크 지원, 새 메모 등장 시 알림음.

## 2. 요구사항 (사용자 시나리오 기준)

| #   | 요구사항                                      | 충족 방식                                                      |
| --- | --------------------------------------------- | -------------------------------------------------------------- |
| R1  | 특정 포스트잇을 링크로 외부 공유              | 포스트잇 단위 선택 → 공유 보드에 추가                          |
| R2  | 교사가 메모 수정 시 링크 페이지에 실시간 반영 | Supabase Realtime 구독 (+ 30초 폴링 폴백)                      |
| R3  | 자주 보고 싶은 예쁜 디자인, 라이트/다크 모두  | 코르크보드/포스트잇 디자인, 테마 토글 + OS 설정 추종           |
| R4  | 링크 페이지는 읽기 전용                       | RLS로 익명은 SELECT만. 쓰기는 교사 앱의 비밀 키로만            |
| R5  | 한 링크에 여러 포스트잇                       | 보드 1 : 포스트잇 N 구조                                       |
| R6  | 추가/수정 시 알림음 (선택)                    | 변경 이벤트 수신 시 차임 + 해당 포스트잇 하이라이트 애니메이션 |
| R7  | 전자칠판에 바탕화면 아이콘/웹앱 설치          | 보드별 동적 PWA manifest → Chrome/Edge "앱 설치"               |

## 3. 기술 타당성 결론: **가능** — 기존 인프라 2종 중 Supabase 경로 재사용

### 검토한 두 가지 방식

**A안. Cloudflare 터널 방식 (실시간 담벼락·협업보드 방식) — 기각**

- `electron/ipc/tunnel.ts`의 Quick Tunnel은 실행할 때마다 `https://랜덤.trycloudflare.com` 으로 주소가 바뀜
- → 전자칠판에 아이콘으로 설치해두는 R7과 정면 충돌
- → 교사 앱을 끄면 페이지가 즉시 죽음 (교실 상시 게시 시나리오에 부적합)

**B안. Supabase + ssampin.com 방식 (설문 `/check/[id]`·상담 `/booking/[id]` 방식) — 채택**

- 고정 URL (`ssampin.com/memo/{boardId}`) → 아이콘 설치 가능
- 교사 앱이 꺼져 있어도 마지막 내용이 계속 표시됨
- Supabase Realtime으로 즉시 반영 (무료 플랜 동시접속 200, 교실 1대 = 연결 1개로 충분)
- 랜딩(Next.js/Vercel)에 이미 같은 패턴의 공개 페이지·Edge Function 다수 존재

## 4. 아키텍처

```
[쌤핀 Electron 앱]                         [Supabase]                [교실 전자칠판]
 메모 페이지                                 memo_share_boards         ssampin.com/memo/{id}
  └ 포스트잇 선택 → "교실에 공유"            memo_share_items           ├ 초기 로드: 공개 읽기
     ├ 보드 생성 (Edge Fn) ──────────────▶  Edge Functions:            ├ Realtime 구독: 변경 즉시 반영
     ├ 메모 수정 시 debounce 자동 push ───▶   memo-board-create        ├ 알림음 + 하이라이트
     └ 공유 중지 → 서버에서 삭제             memo-board-update         └ PWA 설치 (동적 manifest)
                                             memo-board-delete
                                             (쓰기는 write_key 검증)
```

### 데이터 모델 (신규 테이블 2개)

- `memo_share_boards`: id(추측 불가 난수), title, theme_default, write_key_hash, created_at, updated_at
- `memo_share_items`: id, board_id, content, color, font_size, rotation, sort_order, updated_at
  - 로컬 Memo의 **스냅샷 복사본** (로컬 원본과 id 매핑은 Electron 쪽 store가 보관)

### 보안 / 개인정보

- 링크 ID는 추측 불가능한 난수 (기존 단축링크 `/s/` 재사용 가능)
- RLS: 익명은 읽기만. 쓰기는 보드 생성 시 발급된 write_key를 아는 교사 앱만 (상담 adminKey 패턴 재사용)
- 메모에 학생 개인정보가 있을 수 있으므로: 포스트잇 단위 **명시적 선택**만 공유 + 메모 페이지에 "공유 중" 배지 + 공유 시 경고 문구 1회
- 공유 중지 시 서버 데이터 즉시 삭제

## 5. 알려진 제약 (정직하게)

1. **인터넷 필요** — 쌤핀은 오프라인 원칙이지만, 설문/상담/서명처럼 옵트인 온라인 기능으로 분류
2. **알림음 첫 1회 터치 필요** — 브라우저 자동재생 정책상 페이지에서 한 번은 화면을 터치해야 소리 허용됨. "🔔 소리 켜기" 버튼으로 해결하고 설정은 기억(localStorage). PWA 설치형도 동일
3. **이미지 첨부 메모** — ~~v2로 분리 권장~~ → **사용자 결정으로 v1 포함**. 메모 이미지는 이미 긴 변 800px 이하로 리사이즈되어 저장되므로(50~200KB) Supabase Storage 업로드 부담 적음. 서명 기능의 Storage 버킷 패턴(migration 030/031/034) 재사용
4. 전자칠판이 매우 구형 브라우저면 PWA 설치 불가 → 일반 브라우저 전체화면으로 폴백 안내

## 6. 구현 단계

| Phase | 내용                                                                                    | 산출물                                  |
| ----- | --------------------------------------------------------------------------------------- | --------------------------------------- |
| 1     | Supabase 스키마 + RLS + Edge Functions 3종                                              | migration 037~, functions/memo-board-\* |
| 2     | 교실 페이지 (landing `/memo/[id]`) — 디자인·실시간·알림음·라이트/다크                   | frontend-design 에이전트 협업 필수      |
| 3     | PWA 설치 — 보드별 동적 manifest + service worker                                        | `/memo/[id]/manifest.webmanifest`       |
| 4     | Electron 공유 관리 UI — 포스트잇 선택, 보드 관리 모달, 링크/QR, debounce 동기화 usecase | domain/usecases/adapters 신규           |
| 5     | 검증 게이트 4종 + 실기기(전자칠판/태블릿) 수동 검증                                     | tsc/lint/vitest/regression              |

## 7. 결정 사항

- [x] 이미지 첨부 메모 v1 포함 — Supabase Storage (2026-06-11 사용자 확정)
- [x] 디자인 방향 — 미니멀 그리드 (2026-06-11 사용자 확정)
- [ ] 보드 제목/꾸미기(배경 테마) 범위 — v1은 제목만, 테마는 라이트/다크로 한정 (Design에서 상세화)
- [ ] 릴리즈 버전 배정 (v2.2.0 후보?)
