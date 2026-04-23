---
template: plan
version: 0.1
feature: realtime-wall
sub-feature: v1.13-enhancement
date: 2026-04-23
author: claude
project: ssampin
version_target: v1.13.0
supersedes: realtime-wall-management.plan.md (의 일부)
---

# 쌤핀 실시간 담벼락 v1.13 개선 기획

> **요약**: 가상 FGI(2026-04-23)와 기존 `realtime-wall-management.plan.md`
> 로드맵을 통합하여 v1.13.0 메이저 업데이트 범위를 확정한다. 핵심은
> "담벼락의 **영속성**과 **교사 유연성**" — FGI에서 4/4 참가자가 지목한
> 치명적 결점 해소.

---

## 1. 배경

### 1.1 현재 상태 (단계 1~6 + 후속 부채 청산 완료, feature/realtime-wall 14커밋)

- 4개 레이아웃(kanban/freeform/grid/stream) + 교사 큐레이션 + OG/YouTube
  미리보기 + 좋아요 카운터까지 구축 완료
- 보안 계층 9종 (SSRF 3중 방어 + iframe sandbox + 학생 HTML 격리)
- 도메인 규칙 40 테스트
- **그러나**: 담벼락은 여전히 **1회성 세션**. 종료하면 "지난 결과" 스냅샷
  으로만 남고 재열기·이어쓰기 불가

### 1.2 FGI 핵심 통찰 (가상 인터뷰, 2026-04-23)

패들렛/퀴즈앤/띵커벨 경력자 4명(중·고·초·특목 교사)에게 단계 1~6
완성본 시연 후 수집한 44개 요구 중 MUST 5종:

| # | 요구 | Reach | 근거 |
|---|---|---|---|
| A | **보드 저장·목록·재열기** | 4/4 | "한 번 쓰고 끝"이 패들렛 이탈을 막는 최대 결점 |
| B | **칸반 컬럼 실행 중 편집** | 3/4 | "토론 중 '결론' 컬럼 추가 필요했는데 막혀" |
| C | **승인 정책 옵션** (수동/자동/필터) | 3/4 | 45명 대규모는 자동, 초등은 수동 — 세션별 다름 |
| D | **보드 복제** | 3/4 | "올해 잘 된 토론을 내년 복제해서 재사용" |
| E | **`likes` → `teacherHearts` 필드 리네임** (아이콘은 하트 유지) | 2/4 | 필드명이 학생 참여 지표로 오해 유발. 아이콘(하트)은 교사 직관·FGI 참가자 취향으로 유지 |

### 1.3 기존 realtime-wall-management 계획과의 관계

- 기존 M1(프리셋) → v1.12.x 유지 (별 트랙)
- 기존 M2(자동저장·재개) → **이번 v1.13.0에 흡수**, MUST-A에 포함
- 기존 M3(보드 엔티티화) → **이번 v1.13.0 MUST-A로 조기 승격** + FGI 확장
  사항(복제·편집·정책) 동시 처리

**메모리 업데이트 예정**: `project_bulletin_management_plan.md`의 M1/M2/M3
우선순위를 이 문서로 대체.

---

## 2. 제품 정의 변경

### 2.1 기존 정의 (단계 1~6)

> "외부 URL 기반 교사 주도형 실시간 담벼락. 1회성 세션 + 스냅샷 저장."

### 2.2 v1.13 이후 정의

> "**교사가 학기 내내 재사용하는 담벼락 인스턴스**. 생성·저장·재열기·
> 복제가 가능한 **영속 엔티티**로 격상. 세션별 승인 정책 + 실행 중 구성
> 변경으로 수업 상황 대응."

**전환 기준**:
- 담벼락 생성 = **영속 WallBoard 엔티티 생성** (이전: 1회성 세션 설정)
- 담벼락 열기 = **기존 WallBoard의 라이브 세션 시작** (이전: 새 세션)
- 담벼락 닫기 = **세션 종료 + 상태 보존** (이전: 결과 스냅샷만)

### 2.3 유지되는 원칙

- 학생 HTML 절대 노출 금지(다른 카드·OG·YouTube·좋아요) — 단계 5 fix 정책
- 교사 큐레이션 중심 (자동 승인은 옵션, 기본값은 수동)
- 이미지·영상·음성 업로드 금지 (링크 미리보기만)
- 오프라인 로컬 저장 기본

---

## 3. MUST 5종 상세

### 3.1 [A] 보드 영속화 — 저장·목록·재열기

#### FGI 인용
> **P1 (중2 국어)**: "올해 1학기 담벼락 15개 운영했는데 5개는 수행평가
> 누적 자료로 계속 씁니다. 쌤핀은 다시 못 열어요."
>
> **P2 (고등 사회)**: "한 번 만들면 끝이 아니라 학기 내내 살아있는 공간
> 이어야 해요."

#### 기능 범위
1. **WallBoard 엔티티**: 메타(title/layoutMode/columns/approvalMode) +
   현재 posts 배열을 영속 저장
2. **목록 화면**: 생성일·수정일·카드수·레이아웃 아이콘 그리드
3. **재열기**: 기존 WallBoard를 열면 이전 posts가 복원된 상태에서 새 세션
   시작. 새로 들어온 학생 제출은 기존 posts 뒤에 append
4. **이름 변경·삭제·보관**(archive): 목록에서 우클릭/메뉴
5. **저장 경로**: `userData/data/wallBoards/{id}.json` 보드별 분리 + 통합
   메타 `userData/data/wall-boards-index.json`
6. **자동 저장**: 30초 interval + 변경 debounce 3초 + before-quit 동기
   저장 (collab-board 패턴 재사용)

#### 비범위
- 폴더/태그 → v1.13.1 (SHOULD)
- 풀텍스트 검색 → v1.13.1
- 다중 보드 동시 라이브 (tunnel 싱글턴 제약 유지)

### 3.2 [B] 칸반 컬럼 실행 중 편집

#### FGI 인용
> **P1**: "국어 시간에 '주장-근거-반박' 3컬럼 시작했는데 애들이 '결론'
> 빠졌다고 해서 추가하고 싶은데 방법이 없어요. 패들렛은 됩니다."
>
> **P4**: "컬럼 삭제도 필요. 안에 카드 있으면 다른 컬럼으로 옮기거나
> 묶어서 숨김 처리."

#### 기능 범위
1. 라이브 보드 상단에 **"컬럼 편집"** 버튼 (kanban 모드 한정)
2. 모달 또는 인라인:
   - 컬럼 이름 변경
   - 컬럼 추가 (하한 2, 상한 6 유지)
   - 컬럼 순서 변경 (드래그)
   - 컬럼 삭제 — 안의 approved 카드는 3가지 선택:
     * 다른 컬럼으로 이동(교사 선택)
     * hidden 상태로 대량 전환
     * 삭제(영구)
3. 실시간 반영 — 보드에서 즉시 시각화
4. **도메인 규칙 신설**:
   - `addWallColumn(columns, posts, title)` → `{columns, posts}`
   - `renameWallColumn(columns, columnId, newTitle)` → columns
   - `reorderWallColumns(columns, fromIndex, toIndex)` → columns
   - `removeWallColumn(columns, posts, columnId, strategy)` → `{columns, posts}`
     where `strategy: 'move-to' | 'hide' | 'delete'`

#### 비범위
- freeform/grid/stream에서 "컬럼" 개념 없음 → kanban 전용
- 컬럼 색상 지정은 v1.14.x

### 3.3 [C] 승인 정책 옵션

#### FGI 인용
> **P2 (고등 사회, 45명)**: "대기열에서 승인 일일이 누르는 게 수업 흐름
> 을 끊어요. 초반에 가볍게 진행할 땐 자동 승인 모드."
>
> **P3 (초등 3학년)**: "초등은 확실히 승인제 유지가 낫긴 한데, 부적절
> 키워드 필터 있으면 승인 부담이 줄어요."

#### 기능 범위
1. **WallBoard.approvalMode 필드**:
   - `'manual'` (기본값, 기존 동작)
   - `'auto'` — 학생 제출 즉시 approved 상태로 생성. 대기열 UI 축소
   - `'filter'` — 키워드 필터 통과는 auto, 걸린 건 manual (선택 기능,
     v1.13.0는 `'manual'` + `'auto'`만 구현. `'filter'`는 v1.13.2로)
2. **CreateView/EditSettings**에서 라디오 선택:
   - "승인 필요 (기본)" / "자동 승인 (빠른 진행용)"
3. **라이브 중 정책 전환**: 언제든 변경 가능. 이미 pending인 카드는
   전환 시점에 일괄 approve
4. **도메인 규칙**:
   - `createPendingRealtimeWallPost` → `createWallPost(input, existingPosts, columns, approvalMode)`
     approvalMode가 'auto'면 status='approved'로 생성
   - 기존 approveRealtimeWallPost 로직 내부 재사용

#### 비범위
- `'filter'` 모드의 키워드 사전은 v1.13.2 별 구현 (한국어 욕설·개인정보)

### 3.4 [D] 보드 복제

#### FGI 인용
> **P4**: "올해 잘 된 토론 담벼락을 내년 그 단원 수업 때 복제해서 이름
> 만 바꿔 재사용."
>
> **P3**: "3학년 1반·2반·3반 담벼락이 비슷한데 반별 복제 + 이름 일괄
> 바꾸기."

#### 기능 범위
1. **목록 화면에서 "복제" 메뉴 항목**
2. **복제 동작**:
   - 새 WallBoardId 생성
   - 메타(title+"(복제)", layoutMode, columns, approvalMode) 그대로
   - **posts는 복사하지 않음** — 빈 보드로 시작 (이전 수업 학생 데이터
     재사용 방지, PIPA)
   - likes/linkPreview 등 post 관련 상태 초기화
3. **도메인 규칙**: `cloneWallBoard(source): WallBoard` — posts 비움,
   id/createdAt/updatedAt 재생성, title에 "(복제)" 접미
4. **반별 일괄 복제**(선택): 하나의 원본에서 N개 생성 + 제목 접미에
   "1반/2반/3반" 일괄 지정 → **v1.13.1로 연기**(MUST에서는 단일 복제만)

#### 비범위
- posts 포함 복제 (수업 컨셉과 맞지 않음)
- 템플릿 export/import(.ssampin) → COULD로 연기

### 3.5 [E] `likes` → `teacherHearts` 필드 리네임 (아이콘 하트 유지)

#### FGI 인용
> **P4**: "좋아요 하트 UI가 학생이 누르는 것처럼 보여요. '교사 추천'
> 의미로 읽히지 않아요."
>
> **P1**: "의미가 안 맞아요."

#### 사용자 확정 (Open Question #5, 2026-04-23)
- **아이콘은 하트 유지** — 교사 직관에 가장 익숙, FGI 후 사용자 선택
- **카운트 방식 유지** — 한 카드에 여러 번 눌러 강조 누적 가능
- **핵심 수정**: 엔티티 필드명만 교사 소유임을 명시 (`teacherHearts`).
  UI 라벨도 "교사 하트"로 명시화해 "학생 좋아요"와 의미 구분
- 결과: 코드 부채(의미 불명확) 해소 + UI 시각 변화 **최소** + 정책
  문구(학생 HTML 미노출) 그대로 유지

#### 기능 범위
1. **엔티티 필드 리네임**: `RealtimeWallPost.likes?` → `RealtimeWallPost.teacherHearts?`
   (number, 0~999)
2. **도메인 규칙 리네임**: `likeRealtimeWallPost` → `heartRealtimeWallPost` /
   `REALTIME_WALL_MAX_LIKES` → `REALTIME_WALL_MAX_HEARTS`
3. **UI 아이콘**: `favorite` **유지** (변경 없음)
4. **라벨**: 버튼 tooltip "좋아요" → "**교사 하트**" (교사 소유 의미 명시)
5. **색상**: rose 계열 **유지** (변경 없음)
6. **Props**: `onLike` → `onHeart`
7. **마이그레이션**: Repository 로더에 `likes` → `teacherHearts` fallback

#### 비범위
- 학생이 하트 누르는 모드는 Y(WON'T) — 단계 5 fix 정책 위반
- 별/북마크 아이콘 도입 — 사용자 반대

---

## 4. 우선순위·의존성

```
A (보드 영속화) ─── 핵심 기반
   │
   ├─── B (컬럼 편집) — 독립 가능
   ├─── C (승인 정책) — WallBoard.approvalMode 필드 필요
   ├─── D (복제) — WallBoard 엔티티 필요
   │
   E (별/추천 리네임) — A와 독립, 먼저 해도 됨
```

**구현 순서 제안**:
1. **E (리네임)** — 가장 작고, A/B/C/D 작업에 앞서 부채 청소
2. **A (영속화)** — 엔티티 + Repository + 목록 UI + 재열기 플로우
3. **C (승인 정책)** — A 완료 후 approvalMode 필드 추가
4. **B (컬럼 편집)** — 독립이지만 A 완료 후 라이브 UI에 통합하기 쉬움
5. **D (복제)** — A 완료 후 자연스러운 확장

각 단계마다 기존 병렬 리뷰 프로토콜 (code-reviewer-low + bkit:code-analyzer)
적용.

---

## 5. 비범위 (v1.13.0 배제, 후속 버전)

### v1.13.1 (후속 1차)
- 폴더/태그 (F)
- 풀텍스트 검색 (F)
- PDF/PNG 내보내기 (G)
- 학생별 모아보기 + CSV export (H)
- 반별 일괄 복제 (D 확장)

### v1.13.2 (후속 2차)
- 프레젠테이션 모드 (I)
- 익명화 모드 (J)
- PIN 4자리 접속 (M)
- 키보드 단축키 (N)
- 키워드 필터 승인 모드 (C 확장)
- 카드 수동 재정렬 grid/stream (K)

### v1.14+ (COULD)
- 학생 뷰 "다른 카드 보기" 교사 토글 (O) — **정책 변경 PDCA 필수**
- 카드 그룹 묶음·라벨 (P)
- 템플릿 export/import (Q)
- AI 요약 (R)
- 쌤핀 노트 연계 (T)

### 영구 WON'T
- 학생이 별 누르기 (Y)
- 학생 카드 스타일 수동 편집 (Z)

---

## 6. 위험·가정

### 6.1 데이터 모델 마이그레이션 리스크
- WallBoard 엔티티 신설 시 **기존 PastResults**(`RealtimeWallResultData`)
  와 공존 필요. 해결: 이전 스냅샷은 읽기 전용, 새 기능은 WallBoard만
- likes → teacherHearts 필드명 변경은 WIP 릴리즈 전이라 마이그레이션
  부담 없음. 단 dev QA에서 저장한 로컬 데이터는 재생성

### 6.2 라이브 세션 vs 영속 엔티티 분리
- 현재는 세션 시작 = 보드 생성. 분리 후 세션이 여러 번 재실행 가능한데
  **posts의 submittedAt이 혼란**될 수 있음. 해결: post에 `sessionId?`
  (optional) 추가해 세션별 구분 또는 submittedAt 그대로 두되 라이브
  세션 UI에서 "이전 세션 / 현재 세션" 구분선 표시

### 6.3 tunnel 싱글턴 제약
- 여러 WallBoard 저장은 가능하지만 **동시 라이브 세션은 여전히 1개만**
  (쌤핀 전체 5개 라이브 도구와 상호배타). 이 제약은 v1.13.0에서도 유지.
  UI에 명시 필요

### 6.4 가상 FGI의 한계
- 실제 교사 인터뷰가 아니라 **AI 시뮬레이션**. 실제 니즈 검증 필요
- **검증 계획**: v1.13.0 구현 완료 후 BETA 기간에 Google Form 배포 →
  실제 교사 10~20명 응답 수집 → v1.13.1/2 우선순위 재조정

---

## 7. 성공 지표

### 정량
- WallBoard 평균 재사용 횟수 ≥ 3회/월 (단순 1회 세션 대비)
- 복제 기능 사용 비율 ≥ 교사당 1회/학기
- 승인 모드 사용 분포 수집 (manual : auto 비율)
- 보드 생성 → 라이브 시작까지 시간 ≤ 이전 세션의 80% (재사용 효과)

### 정성
- 패들렛 등 경쟁 도구 전환율
- "왜 이 쌤도구를 안 쓰는가?" 응답에서 "저장이 안 돼서" 답변 제거

---

## 8. Open Questions (2026-04-23 사용자 확정 완료)

1. **보드 목록의 썸네일**: ✅ **실제 카드 mini-preview 렌더** (v1.13.0
   scope 포함). 레이아웃별 렌더 방식 — kanban은 컬럼 헤더+카드 개수,
   freeform은 썸네일 캡처, grid/stream은 상위 3장 축소판. 구현 위치:
   `WallBoardListView` 내 `WallBoardThumbnail` 서브컴포넌트.

2. **재열기 시 학생 URL**: ✅ **고정 short-code 유지**. 교사가 학기 내내
   학생에게 동일 코드로 공지할 수 있어 UX 우선. 보안 보조: 보드 "보관"
   시 자동 만료, "재활성화" 시 새 코드 발급. 이건 v1.13.0에 포함
   (WallBoard.shortCode?: string 필드 신설, Supabase LiveSessionClient
   의 reuseExistingCode 옵션 확장).

3. **승인 모드 라이브 전환 시 기존 pending 카드**: 기본 확인 대화 +
   일괄 승인 (§4.3 기본안 채택).

4. **복제 시 title 포맷**: ✅ **한국어 "(복제)"** (쌤핀 기존 UI 관례
   없음, 한국어 원칙).

5. **하트 카운트 vs 바이너리**: ✅ **카운트 유지 + 하트 아이콘 유지**.
   필드명만 `likes → teacherHearts`로 의미 명료화 (§3.5 재정의).

6. **likes → teacherHearts 마이그레이션**: 1회 릴리즈 임시 fallback
   레이어 (§2.5 동일 원칙).

---

## 9. 다음 단계

1. **이 plan 문서 커밋** + 메모리 `project_bulletin_management_plan.md`
   업데이트 (v1.13.0 scope 반영)
2. **design 문서 작성**: `docs/02-design/features/realtime-wall-v1.13-enhancement.design.md`
   - 엔티티 정의 (WallBoard, IWallBoardRepository)
   - 도메인 규칙 시그니처 전체
   - UI 화면 구성 (BoardListView, BoardEditSettings, ColumnEditor)
   - IPC 채널 목록 (기존 + 신규)
   - 마이그레이션 절차
   - 테스트 전략
3. **design-validator 에이전트로 설계서 검증**
4. **Open Questions #1~#6 사용자 확정**
5. 구현 착수 (E → A → C → B → D 순)
