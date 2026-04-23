---
template: plan
version: 1.2
feature: realtime-wall
date: 2026-04-21
author: codex
project: ssampin
version_target: TBD
---

# 쌤핀 실시간 담벼락 기획안

> **요약**: `실시간 담벼락`은 외부 URL로 학생이 참여하고, 교사가 실시간으로 내용을 큐레이션하는 수업용 보드다.  
> **핵심 방향**: 학생 입력은 `이름 + 텍스트 + 선택 링크 1개`로 단순화하고, 교사용 레이아웃은 **칸반형 + 자유 배치형**을 기본으로 설계한다.  
> **중요 전제**: Wi-Fi 직결은 지원하지 않고, 외부 URL 공유만 사용한다. 이미지/파일 업로드는 MVP 범위 밖이다.

---

## 1. 제품 정의

### 1.1 이 기능을 어떻게 정의할 것인가

쌤핀의 `실시간 담벼락`은 Padlet의 모든 모드를 복제하는 도구가 아니다.  
쌤핀식 정의는 다음에 가깝다.

- 학생은 외부 URL 또는 QR로 참여한다
- 학생은 텍스트와 링크를 제출한다
- 교사는 제출물을 승인, 숨김, 고정, 이동한다
- 교사는 수업 목적에 따라 레이아웃을 바꿔서 보여준다
- 프로젝터에는 읽기 쉬운 수업용 보드를 띄운다

즉 제품 정체성은 다음과 같다.

**외부 URL 기반 교사 주도형 실시간 담벼락**

### 1.2 이번 수정에서 확정한 전제

- 도구 표시명: `실시간 담벼락`
- 공유 방식: 외부 URL 공유만 사용
- 네트워크 전제: 인터넷 연결 필요
- 학생 입력: 텍스트 필수, 링크 선택
- 첨부 파일: 미지원
- 이미지 업로드: 미지원
- 기본 레이아웃: `칸반형`, `자유 배치형`
- 카드 월 단일 레이아웃 고정: 아님

### 1.3 왜 방향을 바꿨는가

처음 계획은 카드 월 MVP에 가까웠지만, 사용 맥락을 생각하면 다음 요구가 더 강하다.

- 의견을 주제별로 나눠 받는 칸반형 수업
- 학생 의견을 교사가 자유롭게 재배치하며 토론하는 자유 배치형 수업

따라서 MVP의 핵심은 단순 카드 월이 아니라, **공통 게시물 모델 위에 서로 다른 레이아웃을 얹을 수 있는 보드 구조**가 된다.

---

## 2. 레이아웃 전략

### 2.1 MVP에서 포괄하는 레이아웃

#### A. 칸반형

- 컬럼 기반
- 예: `질문`, `아이디어`, `근거`, `정리`
- 교사가 컬럼 이름을 정하거나 기본값을 사용
- 카드는 컬럼 간 이동 가능
- `dnd-kit` 기반 정렬/이동

#### B. 자유 배치형

- 보드 위 임의 좌표에 카드 배치
- 카드 이동, 크기 조절 가능
- 교사는 카드 간 거리, 묶음, 강조 배치를 직접 조정
- `react-rnd` 기반 drag/resize

### 2.2 MVP에서 제외하는 레이아웃

- 타임라인형
- 지도형
- 이미지 캔버스형
- 다중 첨부형 보드
- 댓글/반응 중심 소셜 보드

### 2.3 공통점과 차이

두 레이아웃 모두 공통으로 가진다.

- 같은 학생 제출 모델
- 같은 승인/숨김/고정 정책
- 같은 외부 URL 참여 흐름
- 같은 결과 저장 구조

차이는 배치 메타데이터에만 둔다.

- 칸반형: `columnId`, `order`
- 자유 배치형: `x`, `y`, `w`, `h`, `zIndex`

---

## 3. 오픈소스 선택

### 3.1 결론

권장 조합은 다음과 같다.

- **칸반형**: 기존 `dnd-kit` 유지
- **자유 배치형**: `react-rnd` 신규 도입
- **보조 후보**: `fabric`는 후속 고급 기능용

### 3.2 채택 이유

#### `dnd-kit` 채택

쌤핀에는 이미 `@dnd-kit/core`, `@dnd-kit/sortable`가 들어 있고, 실제 칸반 구현 흔적도 있다.

- `package.json`에 이미 포함
- [KanbanView.tsx](/E:/github/ssampin/src/adapters/components/Todo/views/KanbanView.tsx:7)에서 사용 중

공식 리포 기준 장점:

- lists, grids, multiple containers 지원
- React 친화적
- MIT 라이선스

판단:

- 칸반형 게시판의 컬럼 간 이동과 정렬에는 가장 적합
- 새 의존성 없이 시작 가능

#### `react-rnd` 채택

자유 배치형은 “진짜 캔버스 엔진”보다 “카드 DOM 컴포넌트를 직접 끌고 놓는” 방식이 MVP에 더 맞다.

공식 리포 기준 장점:

- draggable + resizable React 컴포넌트
- React 카드 UI에 바로 입히기 쉬움
- MIT 라이선스

판단:

- 자유 배치형 게시판 MVP에 가장 짧은 경로
- 학생 제출 카드를 그대로 재사용하기 좋음

### 3.3 보조 후보

#### `fabric`

쌤핀에는 이미 `fabric`가 설치돼 있고, 칠판 도구에서 사용 중이다.

- `package.json`에 이미 포함
- [useChalkCanvas.ts](/E:/github/ssampin/src/adapters/components/Tools/Chalkboard/useChalkCanvas.ts:2)에서 사용 중

판단:

- 나중에 “배경판 위 자유 배치”, “연결선”, “필기 레이어”가 필요하면 유용
- 하지만 현재 요구인 텍스트+링크 게시판의 기본 엔진으로는 과함

### 3.4 이번에 채택하지 않는 후보

#### `react-grid-layout`

- 강점: 반응형 grid, 저장/복원, 위젯형 레이아웃
- 한계: 자유 배치보다는 대시보드/격자형에 가까움

판단:

- 칸반형에는 과하고, 자유 배치형에는 덜 자연스러움
- 현재 우선순위에서는 보류

#### `gridstack.js`

- 강점: 드래그/리사이즈/저장/복원에 강함
- 한계: 대시보드 위젯 성격이 더 강함

판단:

- 게시판보다 “위젯 보드” 쪽 감성이 강해 MVP와 거리가 있다

#### `Excalidraw`

- 강점: 화이트보드/실시간 협업 확장에 적합
- 한계: 텍스트 카드 게시판 기본 엔진으로는 무겁다

판단:

- 자유 필기/도형/화살표가 들어가는 2차 확장용으로만 검토

#### `tldraw`

- 기본 후보에서 제외
- 이유: 라이선스 검토 비용과 제품 배포 리스크가 있다

---

## 4. 현재 리포 기준 재사용 자산

| 영역 | 재사용 후보 | 수준 | 메모 |
|------|-------------|------|------|
| 외부 공유 | `src/infrastructure/supabase/LiveSessionClient.ts` | 높음 | 터널/외부 접근 흐름 활용 가능 |
| 짧은 주소 | `src/infrastructure/supabase/ShortLinkClient.ts` | 높음 | 공유 UX 그대로 재사용 가능 |
| QR | `qrcode` + 기존 초대 UX | 높음 | 새 도구에도 동일하게 필요 |
| 실시간 세션 패턴 | `electron/ipc/liveMultiSurvey.ts` | 높음 | 세션 시작/종료/참여자/브로드캐스트 구조 참고 |
| 교사 제어 UI | `TeacherControlPanel.tsx` | 중간 | 전체 복붙보다 공유 모달 패턴 추출이 적합 |
| 칸반 DnD 경험 | [KanbanView.tsx](/E:/github/ssampin/src/adapters/components/Todo/views/KanbanView.tsx:1) | 높음 | `dnd-kit` 재사용 근거 |
| 카드 비주얼 | `FeedbackWallView.tsx`, `FeedbackWallCard.tsx` | 중간 | 카드 스타일 출발점 |
| 캔버스 경험 | [useChalkCanvas.ts](/E:/github/ssampin/src/adapters/components/Tools/Chalkboard/useChalkCanvas.ts:1) | 중간 | 자유 배치 고급화 시 참고 |

### 4.1 바로 재사용하면 안 되는 부분

- `ToolMultiSurvey.tsx` 안에 게시판 분기를 계속 덧붙이는 방식
- `TeacherControlPanel` 전체를 설문 단계 모델째로 끌고 오는 방식
- `FeedbackWall`의 로컬 UI 상태를 moderation source of truth로 보는 방식
- `collab-board`를 게시판 MVP의 주 기반으로 삼는 방식

---

## 5. 아키텍처 초안

### 5.1 핵심 원칙

- 학생 제출 모델은 하나로 유지한다
- 레이아웃은 게시물 본문이 아니라 별도 배치 정보로 분리한다
- 교사 moderation 상태는 UI 로컬 상태가 아니라 세션 상태에 둔다
- 세션 런타임은 기존 live tool 패턴을 따르되, 게시판 도메인은 분리한다

### 5.2 상위 구조

#### Session Layer

- 세션 시작/종료
- 외부 URL/짧은 주소/QR 생성
- 학생 제출 수신
- 교사 액션 브로드캐스트

#### Board Domain Layer

- 게시물
- 보드 레이아웃 모드
- moderation 상태
- 레이아웃별 배치 메타데이터

#### Teacher UI Layer

- 대기실
- 승인 대기열
- 칸반형 보드
- 자유 배치형 보드
- 프로젝터 보기

#### Result Persistence Layer

- 종료 시 결과 저장
- 저장된 세션 복기
- 레이아웃 상태 복원

### 5.3 데이터 모델 초안

```ts
type RealtimeWallLayoutMode = 'kanban' | 'freeform';
type RealtimeWallPostStatus = 'pending' | 'approved' | 'hidden';

type BulletinKanbanPosition = {
  columnId: string;
  order: number;
};

type BulletinFreeformPosition = {
  x: number;
  y: number;
  w: number;
  h: number;
  zIndex: number;
};

type RealtimeWallPost = {
  id: string;
  sessionId: string;
  nickname: string;
  text: string;
  linkUrl?: string;
  status: RealtimeWallPostStatus;
  pinned: boolean;
  submittedAt: number;
  kanban?: BulletinKanbanPosition;
  freeform?: BulletinFreeformPosition;
};

type RealtimeWallBoard = {
  sessionId: string;
  layoutMode: RealtimeWallLayoutMode;
  columns: Array<{ id: string; title: string; order: number }>;
  posts: RealtimeWallPost[];
};
```

### 5.4 상태 분리 원칙

학생 제출 데이터와 레이아웃 상태를 분리해서 저장한다.

- 학생 제출 의미 데이터: `nickname`, `text`, `linkUrl`, `submittedAt`
- moderation 데이터: `status`, `pinned`
- 레이아웃 데이터: `kanban`, `freeform`

이 분리를 해두면 나중에 같은 세션을 칸반형과 자유 배치형으로 전환하기 쉬워진다.

### 5.5 추천 파일 구성

#### 새 파일

- `electron/ipc/realtimeWall.ts`
- `electron/ipc/realtimeWallHTML.ts`
- `src/adapters/components/Tools/ToolRealtimeWall.tsx`
- `src/adapters/components/Tools/RealtimeWall/RealtimeWallShell.tsx`
- `src/adapters/components/Tools/RealtimeWall/RealtimeWallQueue.tsx`
- `src/adapters/components/Tools/RealtimeWall/RealtimeWallKanbanBoard.tsx`
- `src/adapters/components/Tools/RealtimeWall/RealtimeWallFreeformBoard.tsx`
- `src/adapters/components/Tools/RealtimeWall/RealtimeWallCard.tsx`
- `src/adapters/components/Tools/RealtimeWall/RealtimeWallShareModal.tsx`

#### 수정 파일

- `src/App.tsx`
- `src/adapters/components/Tools/ToolsGrid.tsx`
- `electron/preload.ts`
- `src/global.d.ts`
- `src/domain/entities/ToolResult.ts`
- 결과 저장/조회와 연결된 adapter store 또는 result viewer

---

## 6. 구현 전략

### 6.1 현실적인 구현 경로

처음부터 `collab-board`처럼 큰 협업 엔진으로 가지 않는다.  
MVP는 다음 조합이 가장 현실적이다.

- 세션/공유: `liveMultiSurvey` 패턴
- 칸반형 이동: `dnd-kit`
- 자유 배치형 drag/resize: `react-rnd`
- 카드 스타일: `FeedbackWall` 계열 참조

### 6.2 레이아웃 전환 전략

초기 버전에서는 교사가 세션 시작 시 기본 레이아웃을 선택하는 방식이 안전하다.

- 옵션 1: `칸반형`
- 옵션 2: `자유 배치형`

세션 도중 완전한 양방향 전환은 후순위로 둔다.  
이유는 두 레이아웃의 배치 메타데이터가 달라서 UX와 저장 규칙이 먼저 안정돼야 하기 때문이다.

### 6.3 프로젝터 뷰 전략

- 칸반형: 컬럼 수를 제한하고 가로 스크롤 또는 축약 레이아웃 제공
- 자유 배치형: 읽기 전용 캔버스 보드
- 교사용 편집 UI와 프로젝터 뷰는 분리

---

## 7. 실제 구현 우선순위

### P0. 공통 런타임과 도메인 골격

먼저 해야 할 것:

- 전용 IPC 엔트리 `realtimeWall.ts` 생성
- 학생 제출 모델 정의
- moderation 상태 정의
- 결과 저장 타입 추가
- 외부 URL/짧은 주소/QR 공유 흐름 연결

이 단계가 끝나야 나머지 레이아웃 구현이 흔들리지 않는다.

### P1. 칸반형 MVP

가장 먼저 완성할 화면은 칸반형이다.

이유:

- 기존 `dnd-kit` 재사용이 가능하다
- 컬럼 기반 정리는 수업 활용도가 높다
- 승인 대기열과 공개 보드 구분이 자연스럽다

작업:

- 기본 컬럼 모델
- 승인 대기열 -> 컬럼 배치
- 카드 이동/정렬
- 고정 상태 표시
- 프로젝터 보기

### P2. 자유 배치형 MVP

칸반형이 안정된 뒤 자유 배치형을 붙인다.

이유:

- 카드 drag/resize가 추가되면 UX 복잡도가 바로 올라간다
- 먼저 공통 게시물/세션/저장 구조를 검증하는 편이 안전하다

작업:

- `react-rnd` 도입
- 카드 위치/크기 상태 저장
- 자유 배치 편집 UI
- 읽기 전용 프로젝터 뷰

### P3. 저장/복기 완성

- 세션 종료 후 결과 저장
- 저장된 칸반형 복기
- 저장된 자유 배치형 복기
- 레이아웃 복원 검증

### P4. 후속 확장

- 태그/필터
- 컬럼 템플릿
- 레이아웃 잠금
- 세션 시작 전 레이아웃 설정 UI
- 칸반형 <-> 자유 배치형 변환 규칙

---

## 8. Scope

### 8.1 In Scope

- 새 도구 `실시간 담벼락`
- 외부 URL 공유
- 학생 텍스트 + 링크 제출
- 승인 대기열
- 승인/숨김/고정
- 칸반형 보드
- 자유 배치형 보드
- 프로젝터용 보기
- 결과 저장과 복기

### 8.2 Out of Scope

- 이미지 업로드
- 파일 업로드
- 댓글/반응
- 학생 계정/로그인
- 화이트보드 필기
- 도형/연결선
- 타임라인/지도 레이아웃
- 다중 사용자 동시 자유 편집 충돌 해결 고도화

---

## 9. 리스크와 대응

### 9.1 제품 리스크

- 인터넷 의존성 때문에 수업 시작 실패 리스크가 있다
  - 대응: 세션 시작 전 연결 상태 안내, 실패/재시도 UX 명확화

- 칸반형과 자유 배치형을 동시에 잡으면 MVP가 늘어질 수 있다
  - 대응: 공통 런타임 먼저, 칸반형 선완성 후 자유 배치형 순서 고정

### 9.2 기술 리스크

- `ToolMultiSurvey.tsx`에 분기를 계속 추가하면 유지보수가 나빠진다
  - 대응: 전용 IPC와 전용 tool component로 시작

- 자유 배치형 상태를 로컬 컴포넌트 state로만 두면 저장/복기에서 깨진다
  - 대응: `x/y/w/h/zIndex`를 세션 상태에 저장

- 레이아웃 전환을 너무 빨리 넣으면 상태 변환 규칙이 꼬인다
  - 대응: 초기에는 세션 시작 시 레이아웃 선택만 허용

---

## 10. Red Flags

다음 패턴이 보이면 방향이 틀어진 것이다.

- `ToolMultiSurvey.tsx` 안에 게시판 분기를 계속 덧붙이고 있다
- 칸반형과 자유 배치형이 서로 다른 게시물 모델을 따로 쓰고 있다
- 자유 배치형 위치 상태가 React `useState`에만 있고 저장 구조에는 없다
- `react-grid-layout`이나 `gridstack.js`로 자유 배치형을 억지로 구현하고 있다
- `fabric`를 MVP 기본 엔진으로 넣어서 텍스트 카드 게시판이 캔버스 앱처럼 커지고 있다
- 이미지/파일 업로드 요구를 다시 MVP에 끼워 넣고 있다

---

## 11. 성공 기준

- 교사가 1분 안에 세션을 시작하고 QR을 띄울 수 있다
- 학생 30명 내외가 외부 URL로 접속해 게시물을 제출할 수 있다
- 칸반형에서 승인/이동/고정이 수업 중 끊기지 않는다
- 자유 배치형에서 카드 이동/크기 조절 후 상태가 유지된다
- 종료된 세션을 다시 열면 레이아웃까지 복원된다
- 칸반형과 자유 배치형 모두 동일한 게시물 모델을 공유한다

---

## 12. 이름 정렬 기준

- 도구 표시명: `실시간 담벼락`
- feature slug: `realtime-wall`
- 권장 컴포넌트 접두사: `RealtimeWall`
- 권장 ToolResultType: `realtime-wall`

---

## 13. 참고 소스

공식/원저장소 기준으로 확인한 소스:

- [dnd-kit](https://github.com/clauderic/dnd-kit)
- [react-rnd](https://github.com/bokuweb/react-rnd)
- [react-grid-layout](https://github.com/react-grid-layout/react-grid-layout)
- [gridstack.js 공식 사이트](https://gridstackjs.com/)
- [gridstack.js GitHub](https://github.com/gridstack/gridstack.js)
- [Excalidraw](https://github.com/excalidraw/excalidraw)
- [tldraw license](https://tldraw.dev/community/license)

---

## 14. 한 줄 결론

`실시간 담벼락`의 현실적인 MVP는 **외부 URL 기반 텍스트+링크 게시판** 위에, **칸반형은 기존 `dnd-kit`로**, **자유 배치형은 `react-rnd`로** 얹는 구조가 가장 적합하다.
