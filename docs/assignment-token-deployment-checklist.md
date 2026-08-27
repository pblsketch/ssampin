# 과제수합 교사 토큰 복구 — 배포 체크리스트

2026-08-27 신고("과제수합에서 교사 계정유효기간만료, 재로그인해도 안 됨") 수정본을 실제로 적용할 때
필요한 단계. **앱 빌드만으로는 절반만 적용된다** — Edge Function 하나를 따로 배포해야 한다.

---

## 1. 무엇이 어디에 있나

| 바뀐 것                                                 | 어디서 도나       | 언제 적용되나             |
| ------------------------------------------------------- | ----------------- | ------------------------- |
| 과제수합 열 때 서버 토큰 자동 갱신                      | 앱(데스크톱)      | **앱 빌드/설치하면 적용** |
| [Google 계정 연결하기]가 서버까지 갱신                  | 앱(데스크톱)      | 앱 빌드하면 적용          |
| 다른 구글 계정 감지                                     | 앱(데스크톱)      | 앱 빌드하면 적용          |
| 연결 해제 경고에 과제수합 추가                          | 앱(데스크톱)      | 앱 빌드하면 적용          |
| **구글 일시 장애를 "재로그인 필요"로 잘못 안내하던 것** | **Edge Function** | **함수 배포해야 적용** ⬅  |

배포 안 해도 앱은 정상 동작한다. 다만 구글 쪽이 잠시 먹통일 때 "다시 로그인해주세요"라고
안내할 수 있다(눌러도 해는 없고, 복구 자체는 정상). 다음 릴리즈 때 같이 배포하면 된다.

---

## 2. Edge Function 배포 (딱 한 함수)

```bash
npx supabase functions deploy save-teacher-token --project-ref ddbkyaxvnpaxkbqbpijg --no-verify-jwt
```

- `--no-verify-jwt` 는 이 함수의 기존 설정 그대로다(`supabase/config.toml` 의
  `[functions.save-teacher-token] verify_jwt = false`). **빼면 설정이 바뀌어 호출이 401 로 막힌다.**
- Docker 가 없거나 번들 단계에서 막히면 `--use-api` 를 덧붙인다
  (`npx supabase functions deploy save-teacher-token --project-ref ddbkyaxvnpaxkbqbpijg --no-verify-jwt --use-api`).
- 처음이면 로그인/링크가 먼저 필요하다: `npx supabase login` → `npx supabase link --project-ref ddbkyaxvnpaxkbqbpijg`

### 🚨 절대 같이 하지 말 것

```bash
npx supabase db push   # ❌ 금지
```

마이그레이션 060(상담·설문 익명 접근 차단)이 아직 운영에 적용 전이라, `db push` 를 하면
**의도하지 않게 같이 나간다.** 이번 작업은 DB 변경이 전혀 없으므로 `db push` 는 쓸 일이 없다.

---

> ✅ **2026-08-28 배포 완료** — `save-teacher-token` version **72**, status ACTIVE,
> `verify_jwt: false` 유지 확인. Docker 미실행 경고가 떴지만 CLI 가 API 방식으로 업로드했고
> `index.ts` + `_shared/crypto.ts` + `_shared/cors.ts` 3개가 모두 올라갔다.
> 다른 함수(create-assignment·get-submissions·submit-assignment)는 건드려지지 않았다.

## 3. 배포 확인

```bash
npx supabase functions list --project-ref ddbkyaxvnpaxkbqbpijg
```

`save-teacher-token` 의 VERSION 이 1 올라가고 상태가 ACTIVE 면 성공.

동작 확인(선택) — 잘못된 토큰으로 불러서 401 이 오는지:

```bash
curl -i -X POST "https://ddbkyaxvnpaxkbqbpijg.supabase.co/functions/v1/save-teacher-token" \
  -H "Content-Type: application/json" \
  -H "apikey: <anon-key>" \
  -H "Authorization: Bearer <anon-key>" \
  --data-binary '{"accessToken":"bogus","refreshToken":"bogus","expiresAt":"2026-01-01T00:00:00.000Z"}'
```

- 기대: `401` + `{"error":"인증에 실패했습니다"}` (구글이 토큰을 거절한 경우)
- 구글 쪽 장애면 이제 `502` + "구글 확인이 일시적으로 실패했습니다..." 가 온다 — 이게 이번에 고친 부분.

**2026-08-28 실측**: 인증 헤더 **없이** 위 요청을 보냈더니 `HTTP 401` + `{"error":"인증에 실패했습니다"}`.
게이트웨이 오류(`UNAUTHORIZED_NO_AUTH_HEADER`)가 아니라 **함수 자체 응답**이 온 것이므로
`verify_jwt=false` 가 유지됐다는 뜻이고(배포 플래그를 잘못 주면 여기서 게이트웨이 401 이 온다),
동시에 "구글이 토큰을 거절 → 401" 분기도 정상이라는 뜻이다.

> ⚠️ 502 분기(구글 쪽 일시 장애)는 구글이 401 이 아닌 오류를 줘야 나오므로 **임의로 재현할 수
> 없다.** 배포 여부는 위 401 정상 동작 + 버전 증가로 확인한다.

> ⚠️ Git Bash 에서 한글을 `-d` 로 인라인 전달하면 깨진다. 위처럼 `--data-binary` 를 쓰거나
> 파일로 넘길 것.

---

## 4. 신고하신 선생님께 안내할 말

> 재로그인하신 뒤 **과제수합 화면을 한 번 열어주세요.** 그러면 학생 제출이 다시 됩니다.

(수정본 배포 전이라면: 과제를 아무거나 하나 새로 만들면 같은 효과가 난다 — 과제 생성이
서버 토큰을 갱신하는 유일한 경로였기 때문이다.)

만약 **다른 구글 계정**으로 로그인하셨다면 이제 앱이 이렇게 알려준다:

> 이 과제는 A 계정으로 만들었습니다. 지금은 B 계정으로 로그인되어 있어 학생이 제출할 수
> 없습니다. A 계정으로 다시 연결해주세요.

---

## 5. 남은 한계 (알고 있는 것)

- **v2.4.5 이하에서 만든 과제**에는 만든 계정 정보가 없어 계정 어긋남을 잡아내지 못한다.
  이번 버전 이후 만든 과제부터 적용된다.
- 자동 갱신은 같은 토큰이면 10분에 한 번만 서버를 왕복한다. 토큰이 바뀌면(재로그인·재연결)
  간격과 무관하게 즉시 올린다.
