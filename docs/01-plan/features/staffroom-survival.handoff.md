# 핸드오프: 온라인 교무실 생존·계측 4단계 (/ralplan 용)

> 작성 2026-08-31 · 아래 "복사할 프롬프트"를 통째로 새 세션에 붙여 넣는다.
> 파일·줄 번호는 전부 실제 코드에서 확인한 값이다(2026-08-31 기준, `main` `7f71269a`).
>
> **옆핀 작업은 이 문서 범위가 아니다** — `sidepin-privacy-guard.handoff.md` 로 별도 진행 중.

---

## 복사할 프롬프트

````
/oh-my-claudecode:ralplan 온라인 교무실이 "사람이 바뀌어도 살아남게" 만들고, 그 전에 실사용을 숫자로 확인한다.

## 시작 전에 반드시 읽을 것 (순서대로)

1. `docs/01-plan/features/staffroom-survival.handoff.md` — 이 프롬프트의 출처.
   **§"이미 조사된 사실"은 다시 조사하지 말 것.**
2. `docs/01-plan/features/online-staffroom.plan.md` — 694줄, **이 기능의 정본.**
   특히 §3.2.1(읽는 길도 서버를 거친다) · §3.4(무료 등급) · §10.1(관리자가 떠나면 부서가 멈춘다)
3. `CLAUDE.md` — 아키텍처·검증 게이트·비개발자 설명 원칙
4. `docs/architecture-rules.md`, `docs/coding-conventions.md`
5. `git status --short` — 다른 세션 작업 파일은 건드리지 않는다

## 왜 하는가 (두 문장)

교무실은 **부서 자료를 읽는 길까지 "관리자 한 사람의 구글 계정"을 지난다.** 그 사람이 전출하거나
연결이 끊기면 그 부서 자료실 전체가 전원에게 안 열리고, 부서를 지울 수단조차 없다.
그런데 **지금 이 기능이 실제로 쓰이는지 알 방법이 없다** — 집계에도 앱에도 사용 기록이 0건이다.

## ★ 진행 방식 (반드시 지킬 것)

**한 세션에서 한 Phase 만 구현한다.** P0~P3 는 서버 파일 `_shared/staffroomDb.ts` ·
`staffroomAccess.ts` 를 공유하고, 각각 새 마이그레이션 번호를 잡는다. 병렬로 하면 거의 확실히 충돌한다.
계획은 전체를 세우되, **구현은 한 Phase 끝내고 다음 세션으로 넘긴다.**

---

## P0 — 실사용 계측 (가장 먼저, 가장 작다)

계획서 §10.4 는 "M2 까지 만들고 실사용을 확인한 뒤 M3 이후를 결정한다"였는데,
**확인 없이 M4 까지 다 만들고 출시했다.** 지금 부서가 몇 개인지 아무도 모른다.

- 넣을 지표: 부서 수 · 부서당 멤버 수 분포 · 글 수 · 마지막 활동일 · 자료 용량 ·
  **관리자 구글 연결이 끊긴 부서 수**
- **★마지막 항목이 P1·P2 의 긴급도를 재는 숫자다.** 0 이면 급하지 않고, 여러 개면 이미 사고 중이다
- 관리자 대시보드에 탭 하나 추가. 선례가 그대로 있다:
  `landing/src/app/admin/analytics/_sections/ChatbotTab.tsx` + `_lib/data.ts` 의 `loadChatbot`
- **★★개인정보 — 숫자만 올린다.** 부서 이름·선생님 이메일·글 제목을 관리자 대시보드에 띄우면
  **다른 학교 선생님들의 부서 내용을 오너가 들여다보는 구조**가 된다. 절대 하지 않는다.
  집계 함수 단계에서 이름을 아예 안 꺼내도록 만들고, 그 사실을 테스트로 못박는다

---

## P1 — 공동 관리자 (백업 계정)

지금 `staffroom_admin_tokens` 는 **부서당 딱 1행**만 저장한다(`department_id` 가 PRIMARY KEY).
관리자를 여러 명 두고 각자의 구글 연결을 함께 보관해, 한 명이 끊겨도 부서가 계속 돌게 한다.

- **길목이 한 곳뿐이라 고칠 자리가 좁다** — 12개 서버 함수가 전부
  `adminAccessToken(db, departmentId)`(`_shared/staffroomDrive.ts:105`) 하나를 지난다.
  여기서 폴백하면 전부 혜택을 본다
- 설계 결정 필요: 기본키를 `(department_id, admin_email)` 로 바꿀지, 백업 행을 따로 둘지.
  **정한 이유를 ADR 로 남긴다**

### ★★ P1 을 계획에 넣기 전에 실측 1회 (필수 게이트)

**공동 관리자가 원리적으로 안 될 수도 있다.** 반드시 먼저 확인한다.

쌤핀의 구글 권한은 `drive.file` 하나뿐인데, 이건 **"이 앱이 이 사용자를 위해 만든 파일"에만**
닿는 권한이다. 계획서 §3.2.1 이 이미 같은 이유로 "멤버는 관리자 드라이브 파일을 자기 권한으로
못 읽는다"고 못박았다. **공동 관리자 B 도 같은 벽에 부딪힐 수 있다** —
파일을 만든 건 A 의 계정이지 B 의 계정이 아니기 때문이다.

실측할 것: **A 계정으로 올린 부서 파일을, B 계정 토큰으로 읽을 수 있는가?**
(A 가 `grantReader` 로 B 에게 권한을 준 뒤에도 되는지까지 확인한다)

- **된다** → P1 을 그대로 진행. 이미 쌓인 자료까지 살아난다
- **안 된다** → P1 의 값이 **"앞으로 올라올 자료는 계속 쌓인다"로 줄어든다.**
  이미 쌓인 A 의 자료를 살리려면 **P2(파일을 실제로 옮기기)가 유일한 답**이 된다.
  그러면 **P1 을 건너뛰고 P2 를 먼저 하는 게 맞을 수 있다.** 계획에서 순서를 다시 판단하고
  근거를 남긴다

★ 이 실측 없이 P1 을 계획에 넣지 말 것. 이번 조사의 가장 중요한 미해결 지점이다.

---

## P2 — 관리자 넘겨주기 + 부서 삭제

`staffroom-departments` 의 동작이 지금 **만들기·목록·조회 3개뿐**이다. 지우는 기능조차 없어서
잘못 만든 부서가 영원히 남는다.

- **부서 폴더는 하나다** — `staffroom_departments.drive_folder_id`
  (`_shared/staffroomDrive.ts:243-267`). 넘겨주기 = 이 폴더를 새 관리자 드라이브로 옮기는 일
- **조사 먼저**: `drive.file` 아래에서 A→B 로 폴더를 넘길 수 있는가.
  후보 세 가지를 비교하고 근거를 남긴다 — ① 소유권 이전 ② B 에게 권한 준 뒤 B 가 복사
  ③ 앱이 A 로 내려받아 B 로 다시 올리기(전송량 때문에 최후 수단)
- 이미 있는 부품: `grantReader`(:333) · `revokePermission`(:357) · `trashDriveFile`(:374)
- **오너 확정 결정 (계획서 §2, 바꾸지 말 것)**:
  - 부서 삭제 시 드라이브 자료 동시 삭제는 **선택**(기본은 남기기)
  - 멤버 내보낼 때 그 사람 파일 정리도 **선택**(기본은 남기기)
- 관리자 토큰이 끊겼을 때 멤버에게 안내하는 문구는 이미 있다
  (`LibraryView.tsx:319` · `GalleryView.tsx:133`). **조용히 빈 화면을 만들지 않는다**는 규칙 유지

---

## P3 — 자료 통째로 내려받기

"언제든 들고 나갈 수 있다"가 있어야 학교가 안심하고 쓴다. 지금은 파일을 하나씩만 받을 수 있다.

- **★서버에서 압축 파일을 만들면 안 된다.** 계획서 §3.4 의 핵심 제약이다 —
  쌤핀 Supabase 는 무료 등급이고 **파일 본체가 서버를 통과하면 200MB 짜리 25번에 월 5GB 가 끝난다.**
  챗봇·상담·과제·서명·실시간 게시판이 같은 전송량을 나눠 쓴다
- → **앱(Electron)이 파일을 하나씩 받아 사용자 PC 에서 묶는다.** 서버는 권한만 준다
- 재사용: `electron/lib/zipStore.ts` — `buildStoreZip` · `dedupeFilenames` · `sanitizeFilename`.
  **백업 기능이 이미 쓰고 있는 검증된 부품이다**(`electron/main.ts:87` 에서 import)
- 현재 내려받기 경로: `staffroom-library` 의 `download`(:509) — 멤버 지메일에 권한만 주고
  파일은 구글→선생님 직행. 이 방식을 그대로 이어 쓴다

---

## P4 — 학년도 인수인계 (이 핸드오프 범위 밖, 다음 단위)

계획서가 **"이 기능의 최대 차별점"** 으로 지목한 항목이다. 2월에 부서가 바뀔 때
"작년 담당 자료 통째로 다음 담당자에게"가 된다.

- **P2 의 뼈대(파일 옮기기)를 그대로 쓴다. P2 없이 시작하지 말 것**
- 재사용: `src/adapters/repositories/archiveSyncGateway.ts` · `src/domain/rules/academicCalendar.ts`
- **시기가 정해진 작업이다** — 2월 인사이동에 맞추려면 12~1월 출시. 역산해서 계획에 적어 둔다
- 이번 계획에서는 **범위와 시기만 적고 구현은 하지 않는다**

---

## 이미 조사된 사실 (다시 조사하지 말 것 — 전부 실측 확인)

### 운영 위험 — 여기서 사고가 난다
- **★`supabase db push` 를 쓰지 말 것.** `060` 마이그레이션이 **일부러 안 올린 채 대기 중**이다
  (`PROGRESS.md:234` — "새 앱이 충분히 퍼진 뒤 적용"). 통째로 올리면 060 이 같이 나간다.
  **개별 적용은 Management API + `migration repair`** 로 한다
- 마이그레이션 최신 번호는 **062**. 다음은 **063**. Phase 마다 하나씩 잡는다.
  **두 세션이 동시에 같은 번호를 잡으면 하나는 통째로 버려야 한다**
- 교무실 서버 함수 **12종 전부**가 `_shared/staffroomDb.ts` · `staffroomAccess.ts` 를 공유한다
- Edge Function 배포 후에는 **인증 헤더 없이 호출해 401 이 나는지 확인**하는 게 이 저장소 관례다
- 암호화 키는 `STAFFROOM_ENCRYPTION_KEY`(ADR-062, 과제 기능의 `ENCRYPTION_KEY` 와 분리).
  **Supabase 시크릿을 CLI 로 넣으면 여러 줄이 첫 줄만 저장된다 — JSON API + sha256 대조로 확인**

### 교무실 현재 상태
- v2.4.4(2026-08-24)부터 **실험실 기능(ADR-070)** 으로 출시. `settings.staffRoomEnabled` 기본 꺼짐
  (`src/adapters/components/Layout/Sidebar.tsx:213-218`)
- 규모: 화면 ~7,900줄 · 스토어 ~2,000줄 · 서버 함수 12종 ~5,900줄 · 마이그레이션 `049`~`056`
- **M1~M4 완료** (부서·초대·멤버 / 게시판·읽음·필독·멘션·임시저장 / 자료실·검색·버전·용량 /
  토론방·갤러리·회의록·배너·일정·업무). 서식 편집기·말머리·첨부(`053`~`056`)까지
- **M5 미착수**: 실시간 구독 코드 **0건** · 옆핀 연동 0건 · 문서 확인 서명 0건 · 부서 서식함 없음.
  `050_staffroom_board.sql:151` 주석에 "알림은 M5" 라고 적혀 있다
- **M6 미착수**: 넘겨주기 없음 · 부서 삭제 없음 · 통째로 내려받기 없음 · 인수인계 없음
- 모바일 없음 (`src/mobile` 아래 교무실 파일 0건)
- **계측 0건**: `061_analytics_rollups.sql` 에도 앱 코드에도 교무실 사용 기록이 없다

### 관리자 토큰 구조 (P1·P2 의 핵심)
- `supabase/migrations/049_staffroom_core.sql:123-132` — `staffroom_admin_tokens`,
  `department_id` 가 **PRIMARY KEY** → 부서당 1행
- `_shared/staffroomDrive.ts:105` — `adminAccessToken(db, departmentId)`.
  **모든 읽기·쓰기가 이 함수를 지난다**(만료 시 갱신·재저장까지 여기서)
- `:42,47` — `ADMIN_TOKEN_BROKEN_MESSAGE` · `ADMIN_TOKEN_MISSING_MESSAGE`
- `:243-267` — `ensureDepartmentFolder`. 부서 폴더는 **개설자 드라이브 안에 하나**
- 있는 부품: `grantReader`(:333) · `revokePermission`(:357) · `trashDriveFile`(:374) ·
  `driveQuota`(:408) · `createUploadSession`(:285)

### 서버 동작 목록 (지금 있는 것)
- `staffroom-departments`: **create · list · get** (삭제·넘겨주기 없음)
- `staffroom-members`: list · setMyName · setRole · remove
- `staffroom-library`: list · uploadSession · commit · previewSession · commitPreview ·
  download · delete · versions · previews · searchPosts
- `staffroom-posts`: list · get · create · update · setRequired · delete · readers
- `staffroom-rooms`: 모듈 CRUD · 배너 · 토론 · 회의록
- `staffroom-departments` 의 `list` 는 **부서별 안 읽은 글 수를 이미 함께 돌려준다**(:203-206).
  DB 함수 `staffroom_unread_counts` 가 숫자만 센다

### 재사용할 자산
- `electron/lib/zipStore.ts` — 압축 파일 만들기(백업 기능이 이미 사용)
- `src/adapters/repositories/archiveSyncGateway.ts` · `src/domain/rules/academicCalendar.ts` — P4 용
- `landing/src/app/admin/analytics/_sections/ChatbotTab.tsx` + `_lib/data.ts` — P0 의 탭 선례

## 반드시 지킬 것

1. **한 세션에 한 Phase.** 계획은 전체, 구현은 하나
2. `domain/` 레이어는 외부 의존성 import 절대 금지 · `any` 금지 · UI 텍스트 전부 한국어
3. 하드코딩 HEX 금지(`sp-*` 토큰) · 직각 금지(`rounded-*` Tailwind 기본 키만, `rounded-sp-*` 금지)
4. **UI 를 새로 만들 때는 프론트엔드 디자인 전문 에이전트와 함께 작업한다**(단독 진행 금지)
5. **부서 간 격리(RLS)를 코드보다 먼저 본다.** 새 표·새 조회를 넣을 때마다 부서로 좁혔는지 확인한다.
   기존 격리 테스트가 `src/infrastructure/supabase/__tests__/staffroom*Isolation.meta.test.ts` 에 있다
6. **새 구글 권한(scope)을 추가하지 않는다.** `drive.file` 그대로다. 추가하면 OAuth 재심사 대상
7. **커밋은 반드시 경로를 지정한다**: `git commit -m "..." -- <path>`
8. **Edit 도구가 `src` 소스를 CRLF 로 뒤집는 일이 있다.** 편집 후 `git diff --numstat` 으로 확인
9. 사용자 행동·설정·문제 해결이 바뀌면 **같은 작업 단위에서 `/docs` 사용자 가이드를 갱신**한다
   (`landing/src/content/docs.ts`, `features/staffroom`). 릴리즈 전 `cd landing && npm run docs:check && npm run build`
10. **관리자 토큰을 여러 개 보관하게 되면 개인정보처리방침 제11조를 다시 본다**(P1)
11. 새 회귀 검사는 `scripts/regression-grep-check.mjs` 에 **REGRESSION #65** 부터.
    새 ADR 은 **ADR-078** 부터(현재 최신 #64 / ADR-077)

## 하지 말 것

- **P1 실측(A 파일을 B 토큰으로 읽을 수 있는가) 없이 P1 을 계획에 넣기**
- `supabase db push`
- 두 Phase 를 한 세션에서 동시에 구현하기
- P0 에서 부서 이름·이메일·글 제목을 관리자 대시보드에 올리기
- P3 에서 서버가 압축 파일을 만들게 하기
- P4(학년도 인수인계)를 이번에 구현하기 — 범위와 시기만 적는다
- 새 브랜치·worktree·PR 생성 (사용자가 요청할 때만)
- 계획에 없는 기능 추가. 특히 **활동 포인트·랭킹·출석도장은 프로젝트 금지 규칙이다**
- 코드만 보고 "됐다" 선언하기

## 완료 기준 (검증 게이트 — 하나라도 빠지면 완료 아님)

```bash
npx tsc --noEmit          # 에러 0
npm run lint              # 통과
npm run test              # 통과 (electron 코드를 보는 유일한 게이트)
npm run regression-check  # 통과
```

- 위 4종 결과를 **실행한 명령과 핵심 출력까지** 함께 보고한다. "통과했습니다"만 쓰지 않는다
- **게이트 4종이 전부 초록인 채로 살아 있던 결함 전력이 여러 번 있다.** 실기기 확인을 함께 한다:
  - P0: 관리자 대시보드에서 숫자가 실제로 뜨는가 / **이름이 하나도 안 보이는가**
  - P1: 관리자 A 연결을 끊고도 부서가 열리는가
  - P2: 넘겨준 뒤 새 관리자로 자료실이 열리는가 / 부서 삭제 후 드라이브가 의도대로 되는가
  - P3: 받은 압축 파일이 실제로 열리고 한글 파일명이 안 깨지는가
- 끝나면 `PROGRESS.md` 갱신, 새 결정이 있으면 `DECISIONS.md` 에 ADR 추가

## 막히면

추측해서 진행하지 말고 사용자에게 묻는다. 사용자는 코딩을 모르는 프로젝트 오너이므로,
기술 용어를 쓸 때는 쉬운 한국어 설명을 한 문장 안에 함께 붙인다.
````

---

## 프롬프트에 넣지 않았지만 알아두면 좋은 것

### 이번 조사에서 새로 드러난 것

**공동 관리자(P1)가 원리적으로 안 될 수 있다.**
처음에는 "승계보다 값싸고 효과 큰 1차 방어"로 추천했는데, 구글 권한 구조를 다시 보니
**`drive.file` 은 계정별 권한**이라 B 의 토큰으로 A 가 만든 파일을 못 읽을 가능성이 있다.
계획서 §3.2.1 이 멤버에 대해 이미 같은 결론을 내렸고, 공동 관리자도 같은 벽일 수 있다.

그래서 P1 앞에 **실측 게이트**를 붙였다. 결과에 따라 P1·P2 의 순서가 바뀐다.
안 되면 **P2(파일을 실제로 옮기기)가 유일한 답**이 되고, P1 의 값은
"앞으로 올라올 자료는 계속 쌓인다"로 줄어든다.

### 순서를 이렇게 잡은 이유

- **P0 이 가장 먼저인 건 작아서가 아니라, "관리자 연결이 끊긴 부서 수"가 P1·P2 의 긴급도를
  재는 유일한 숫자이기 때문이다.** 0 이면 천천히 해도 되고, 여러 개면 이미 사고 중이다
- P3(내려받기)은 P1·P2 가 실패해도 **자료를 들고 나갈 수 있게 하는 탈출구**다.
  넘겨주기가 어렵다는 결론이 나오면 **P3 의 우선순위를 올리는 게 맞다**

### 이 문서 범위 밖 (별도 단위)

- **M5 나머지** — 윈도우 알림 · 문서 확인 서명 · 부서 서식함
- **옆핀 연동(D)** — `sidepin-privacy-guard.handoff.md` 로 진행 중
- **모바일 교무실** — 계획서 §8-D 에서 의도적으로 뒤로 미룬 항목
