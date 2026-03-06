# 교사용 즐겨찾기 (북마크 매니저) 기능 계획서

> **작성일**: 2026-03-11
> **대상 버전**: v0.3.x
> **피드백 원문**: "구글의 즐겨찾기 같은 기능 가능할까요? 같은 성격을 가진 사이트끼리 그룹을 만들면 좋을 것 같아요!"

---

## 1. 개요

### 1.1 문제 정의

현재 쌤도구(Tools) 페이지에는 15개의 내장 도구가 그리드로 표시된다.
외부 URL 링크(숲소리, PBL스케치)도 일부 포함되어 있지만, **사용자가 직접 링크를 등록하거나 그룹으로 관리하는 기능이 없다.**

교사들은 수업 준비, 업무 처리, 학생 관리 등에 다양한 웹 사이트를 활용한다:

| 용도 | 대표 사이트 |
|------|-------------|
| 업무 | NEIS, K-에듀파인, 업무관리시스템 |
| 수업 준비 | 에듀넷, EBS, 디지털교과서, 아이스크림 |
| 수업 도구 | 멘티미터, 패들렛, 띵커벨, 캔바 |
| 정보 검색 | 한국교육과정평가원, 교육부 |

이 사이트들을 브라우저 즐겨찾기에 따로 관리하는 것은 번거롭고, 쌤핀 앱 내에서 통합 관리할 수 있다면 워크플로우가 크게 개선된다.

### 1.2 현재 상태

- `ToolsGrid.tsx`: 15개 도구를 하드코딩된 배열(`TOOLS`)로 표시
- 외부 URL은 `externalUrl` 속성으로 `window.electronAPI.openExternal()` 호출
- `ToolWebEmbed.tsx`: webview 기반 웹페이지 임베드 도구 (참고용)
- `useToolPresetStore.ts`: 도구 프리셋 저장 패턴 (Zustand + JSON 파일)
- 사용자 정의 URL 등록/그룹 관리 기능 없음

### 1.3 목표

1. 사용자가 직접 즐겨찾기(URL + 이름 + 아이콘)를 등록/편집/삭제
2. 그룹(폴더)으로 같은 성격의 사이트를 묶어 관리
3. 그룹 내 항목 순서를 드래그앤드롭으로 변경
4. 교사용 기본 프리셋 제공 (자주 쓰는 사이트 미리 등록)
5. 클릭 시 기본 브라우저(외부)로 열기
6. 대시보드 위젯에서 즐겨찾기 바로가기 표시

---

## 2. 기능 상세

### 2.1 데이터 모델

```typescript
// domain/entities/Bookmark.ts

/** 즐겨찾기 아이콘 타입 */
export type BookmarkIconType = 'emoji' | 'favicon';

/** 단일 즐겨찾기 항목 */
export interface Bookmark {
  readonly id: string;            // UUID
  readonly name: string;          // 표시 이름 (예: "NEIS")
  readonly url: string;           // URL (https://...)
  readonly iconType: BookmarkIconType;
  readonly iconValue: string;     // 이모지 문자 또는 파비콘 URL
  readonly groupId: string;       // 소속 그룹 ID
  readonly order: number;         // 그룹 내 정렬 순서
  readonly createdAt: string;     // ISO 8601
  readonly updatedAt: string;     // ISO 8601
}

/** 즐겨찾기 그룹 (폴더) */
export interface BookmarkGroup {
  readonly id: string;            // UUID
  readonly name: string;          // 그룹 이름 (예: "수업 준비")
  readonly emoji: string;         // 그룹 아이콘 이모지
  readonly order: number;         // 그룹 정렬 순서
  readonly collapsed: boolean;    // 접힘/펼침 상태
  readonly createdAt: string;     // ISO 8601
}

/** 전체 즐겨찾기 데이터 (저장 단위) */
export interface BookmarkData {
  readonly groups: readonly BookmarkGroup[];
  readonly bookmarks: readonly Bookmark[];
}
```

### 2.2 UI/UX 설계

#### 배치 위치: A안 채택 — 쌤도구 페이지 하단 확장

쌤도구 페이지(`ToolsGrid.tsx`)의 기존 도구 그리드 아래에 **"내 즐겨찾기"** 섹션을 추가한다.
쌤도구의 자연스러운 확장이며, 별도 사이드바 메뉴를 추가하지 않아 네비게이션 복잡도를 줄인다.

```
쌤도구 페이지
├── 헤더 ("🔧 쌤도구")
├── 내장 도구 그리드 (15개 — 기존 그대로)
├── ─────── 구분선 ───────
└── ⭐ 내 즐겨찾기 (신규 섹션)
    ├── 헤더 ("⭐ 내 즐겨찾기" + [그룹 추가] + [즐겨찾기 추가])
    ├── 📚 수업 준비 (그룹 — 접기/펼치기)
    │   ├── 📖 에듀넷    → https://www.edunet.net
    │   ├── 📺 EBS       → https://www.ebs.co.kr
    │   └── 📱 디지털교과서 → https://dtbook.edunet.net
    ├── 💼 업무 (그룹)
    │   ├── 🏫 NEIS      → https://neis.go.kr
    │   └── 💰 K-에듀파인 → https://edufine.go.kr
    └── 🛠️ 수업 도구 (그룹)
        ├── 📊 멘티미터   → https://www.mentimeter.com
        └── 📌 패들렛     → https://padlet.com
```

#### 와이어프레임: 메인 뷰 (즐겨찾기 섹션)

```
┌──────────────────────────────────────────────────────────────┐
│  ⭐ 내 즐겨찾기                    [+ 그룹 추가] [+ 추가]   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  📚 수업 준비                          [✏️ 편집] [▼ 접기]    │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐                     │
│  │  📖  │  │  📺  │  │  📱  │  │  🎓  │                     │
│  │에듀넷│  │ EBS  │  │디지털│  │아이스 │                     │
│  │  ↗   │  │  ↗   │  │교과서│  │크림  │                     │
│  │      │  │      │  │  ↗   │  │  ↗   │                     │
│  └──────┘  └──────┘  └──────┘  └──────┘                     │
│                                                              │
│  💼 업무                               [✏️ 편집] [▼ 접기]    │
│  ┌──────┐  ┌──────┐  ┌──────┐                                │
│  │  🏫  │  │  💰  │  │  📋  │                                │
│  │ NEIS │  │에듀  │  │업무  │                                │
│  │  ↗   │  │파인  │  │관리  │                                │
│  │      │  │  ↗   │  │  ↗   │                                │
│  └──────┘  └──────┘  └──────┘                                │
│                                                              │
│  🛠️ 수업 도구                          [✏️ 편집] [▼ 접기]    │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐                     │
│  │  📊  │  │  📌  │  │  🔔  │  │  🎨  │                     │
│  │멘티  │  │패들렛│  │띵커벨│  │ 캔바 │                     │
│  │미터  │  │  ↗   │  │  ↗   │  │  ↗   │                     │
│  │  ↗   │  │      │  │      │  │      │                     │
│  └──────┘  └──────┘  └──────┘  └──────┘                     │
│                                                              │
│  ┌──────────────────────────────┐                            │
│  │  ＋ 즐겨찾기 추가 (빈 카드)   │                            │
│  └──────────────────────────────┘                            │
└──────────────────────────────────────────────────────────────┘
```

#### 와이어프레임: 즐겨찾기 추가/편집 모달

```
┌──────────────────────────────────────────┐
│  ⭐ 즐겨찾기 추가                  [✕]  │
├──────────────────────────────────────────┤
│                                          │
│  이름 *                                  │
│  ┌────────────────────────────────────┐  │
│  │ NEIS                               │  │
│  └────────────────────────────────────┘  │
│                                          │
│  URL *                                   │
│  ┌────────────────────────────────────┐  │
│  │ https://neis.go.kr                 │  │
│  └────────────────────────────────────┘  │
│                                          │
│  아이콘                                  │
│  ┌─────────────────────────────┐         │
│  │ [🏫] ← 선택된 이모지        │         │
│  │ [이모지 선택] [파비콘 자동]  │         │
│  └─────────────────────────────┘         │
│                                          │
│  그룹                                    │
│  ┌────────────────────────────────────┐  │
│  │ 💼 업무              ▼            │  │
│  └────────────────────────────────────┘  │
│                                          │
│                    [취소]  [💾 저장]      │
└──────────────────────────────────────────┘
```

#### 와이어프레임: 그룹 추가 모달

```
┌──────────────────────────────────────────┐
│  📁 그룹 추가                      [✕]  │
├──────────────────────────────────────────┤
│                                          │
│  그룹 이름 *                             │
│  ┌────────────────────────────────────┐  │
│  │ 수업 도구                          │  │
│  └────────────────────────────────────┘  │
│                                          │
│  아이콘 이모지                           │
│  ┌─────────────────────────────┐         │
│  │ [🛠️] ← 선택된 이모지        │         │
│  │                              │         │
│  │ 📚 💼 🛠️ 📝 🎓 🏫 📖 💡   │         │
│  │ 🔬 🎨 🎵 ⚽ 🌍 💻 📊 🔗   │         │
│  └─────────────────────────────┘         │
│                                          │
│                    [취소]  [💾 저장]      │
└──────────────────────────────────────────┘
```

#### 와이어프레임: 편집 모드 (그룹 내)

```
┌──────────────────────────────────────────────────────────────┐
│  📚 수업 준비 (편집 모드)                  [완료] [🗑️ 삭제]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ ⠿ │ 📖 에듀넷  │ edunet.net        │ [✏️] [🗑️]    │    │
│  │ ⠿ │ 📺 EBS     │ ebs.co.kr         │ [✏️] [🗑️]    │    │
│  │ ⠿ │ 📱 디지털  │ dtbook.edunet.net │ [✏️] [🗑️]    │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  ⠿ = 드래그 핸들 (순서 변경)                                 │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 2.3 인터랙션 설계

| 동작 | 결과 |
|------|------|
| 즐겨찾기 카드 클릭 | 외부 브라우저에서 URL 열기 (`openExternal`) |
| 즐겨찾기 카드 우클릭 | 컨텍스트 메뉴 (편집 / 삭제 / 브라우저에서 열기) |
| 그룹 헤더 접기/펼치기 | 그룹 내 카드 토글 (collapsed 상태 저장) |
| 그룹 "편집" 버튼 | 편집 모드 진입 — 드래그 핸들 표시, 삭제/수정 버튼 노출 |
| 드래그앤드롭 (편집 모드) | 그룹 내 항목 순서 변경 |
| 그룹 간 드래그앤드롭 | 그룹 순서 변경 (그룹 헤더를 드래그) |
| "+" 빈 카드 클릭 | 즐겨찾기 추가 모달 열기 |
| 파비콘 자동 버튼 | URL에서 파비콘 추출 시도 → 실패 시 이모지 폴백 |

### 2.4 파비콘 자동 가져오기

```
1. URL 입력 → origin 추출 (예: https://neis.go.kr)
2. https://www.google.com/s2/favicons?domain={origin}&sz=64 시도
3. 성공 → iconType: 'favicon', iconValue: 파비콘 URL
4. 실패 → 이모지 선택 폴백 (iconType: 'emoji')
```

> **참고**: Electron 환경에서는 Google Favicon API가 안정적으로 동작한다.
> 오프라인 시에는 캐시된 파비콘 사용, 없으면 이모지 폴백.

---

## 3. 기본 프리셋 (교사용 사이트)

첫 실행 시 또는 "기본 즐겨찾기 추가" 버튼으로 아래 프리셋을 일괄 등록:

### 3.1 업무 그룹 (💼)

| # | 이름 | URL | 이모지 |
|---|------|-----|--------|
| 1 | NEIS (나이스) | https://neis.go.kr | 🏫 |
| 2 | K-에듀파인 | https://edufine.go.kr | 💰 |
| 3 | 업무관리시스템 | https://gw.sen.go.kr | 📋 |
| 4 | 정부24 | https://www.gov.kr | 🏛️ |

### 3.2 수업 준비 그룹 (📚)

| # | 이름 | URL | 이모지 |
|---|------|-----|--------|
| 5 | 에듀넷 | https://www.edunet.net | 📖 |
| 6 | EBS | https://www.ebs.co.kr | 📺 |
| 7 | 디지털교과서 | https://dtbook.edunet.net | 📱 |
| 8 | 한국교육과정평가원 | https://www.kice.re.kr | 🎓 |
| 9 | 학교알리미 | https://www.schoolinfo.go.kr | 🔍 |

### 3.3 수업 도구 그룹 (🛠️)

| # | 이름 | URL | 이모지 |
|---|------|-----|--------|
| 10 | 멘티미터 | https://www.mentimeter.com | 📊 |
| 11 | 패들렛 | https://padlet.com | 📌 |
| 12 | 띵커벨 | https://www.tkbell.co.kr | 🔔 |
| 13 | 캔바 | https://www.canva.com | 🎨 |
| 14 | 미리캔버스 | https://www.miricanvas.com | 🖼️ |

### 3.4 AI·에듀테크 그룹 (🤖)

| # | 이름 | URL | 이모지 |
|---|------|-----|--------|
| 15 | 뤼튼 | https://wrtn.ai | 🤖 |
| 16 | ChatGPT | https://chat.openai.com | 💬 |
| 17 | 클래스팅 | https://www.classting.com | 👩‍🏫 |

> 프리셋은 `domain/rules/bookmarkRules.ts`에 순수 데이터로 정의하고,
> 사용자가 이미 즐겨찾기를 가지고 있으면 중복 추가하지 않는다.

---

## 4. 대시보드 위젯: 즐겨찾기 바로가기

### 4.1 위젯 정의

```typescript
// widgets/items/Bookmarks.tsx

{
  id: 'bookmarks',
  name: '즐겨찾기',
  icon: '⭐',
  description: '자주 사용하는 사이트 바로가기',
  category: 'info',
  defaultSize: { w: 1, h: 3 },
  minSize: { w: 1, h: 2 },
  availableFor: {
    schoolLevel: ['elementary', 'middle', 'high'],
    role: ['homeroom', 'subject', 'admin'],
  },
  component: BookmarksWidget,
  navigateTo: 'tools',
  navigateLabel: '즐겨찾기 전체 보기',
}
```

### 4.2 위젯 UI

```
┌────────────────────────────┐
│  ⭐ 즐겨찾기               │
├────────────────────────────┤
│  🏫 NEIS                   │
│  📖 에듀넷                 │
│  📺 EBS                    │
│  💰 K-에듀파인             │
│  📊 멘티미터               │
│  ···                       │
├────────────────────────────┤
│  즐겨찾기 전체 보기 →       │
└────────────────────────────┘
```

- 최대 8개 항목 표시 (전체 그룹에서 order 순으로)
- 클릭 시 외부 브라우저로 열기
- "전체 보기" 클릭 시 쌤도구 페이지로 이동

---

## 5. 구현 단계 (Phase)

### Phase 1: 데이터 모델 + 저장소 + 기본 CRUD (핵심 골격)

**domain 레이어:**
- `domain/entities/Bookmark.ts` — 엔티티 타입 정의
- `domain/repositories/IBookmarkRepository.ts` — 포트 (인터페이스)
- `domain/rules/bookmarkRules.ts` — 순수 함수 (정렬, 유효성 검증, 기본 프리셋 데이터)

**usecases:**
- `usecases/bookmark/ManageBookmarks.ts` — 즐겨찾기 CRUD + 그룹 CRUD + 순서 변경 + 프리셋 초기화

**adapters:**
- `adapters/repositories/JsonBookmarkRepository.ts` — JSON 저장소 구현
- `adapters/stores/useBookmarkStore.ts` — Zustand 스토어
- `adapters/di/container.ts` — DI 등록 추가

### Phase 2: 쌤도구 페이지 UI — 즐겨찾기 섹션

**UI 컴포넌트:**
- `adapters/components/Tools/BookmarkSection.tsx` — 즐겨찾기 전체 섹션 (그룹 목록 + 카드 그리드)
- `adapters/components/Tools/BookmarkGroupCard.tsx` — 그룹 헤더 + 카드 그리드 (접기/펼치기)
- `adapters/components/Tools/BookmarkCard.tsx` — 단일 즐겨찾기 카드
- `adapters/components/Tools/BookmarkFormModal.tsx` — 즐겨찾기 추가/편집 모달
- `adapters/components/Tools/BookmarkGroupModal.tsx` — 그룹 추가/편집 모달
- `adapters/components/Tools/EmojiPicker.tsx` — 이모지 선택 컴포넌트 (교육 관련 이모지 큐레이션)

**기존 파일 수정:**
- `adapters/components/Tools/ToolsGrid.tsx` — 하단에 BookmarkSection 삽입

### Phase 3: 드래그앤드롭 + 편집 모드

- 그룹 내 즐겨찾기 항목 드래그앤드롭 순서 변경
- 그룹 간 순서 변경 (그룹 헤더 드래그)
- 편집 모드 UI (삭제 버튼, 드래그 핸들 표시)
- 컨텍스트 메뉴 (우클릭 → 편집/삭제)

### Phase 4: 대시보드 위젯 + UX 개선

**위젯:**
- `widgets/items/Bookmarks.tsx` — 대시보드 즐겨찾기 위젯
- `widgets/registry.ts` — 위젯 등록

**UX 개선:**
- 파비콘 자동 가져오기 (Google Favicon API)
- 빈 상태 UI ("아직 즐겨찾기가 없습니다. 기본 즐겨찾기를 추가해보세요!")
- 기본 프리셋 일괄 추가 버튼
- 토스트 알림 (추가/삭제/편집 완료)

---

## 6. 파일 변경 목록

### 신규 파일 (12개)

| 파일 | 레이어 | 설명 |
|------|--------|------|
| `src/domain/entities/Bookmark.ts` | domain | 엔티티 타입 (Bookmark, BookmarkGroup, BookmarkData) |
| `src/domain/repositories/IBookmarkRepository.ts` | domain | Repository 인터페이스 (포트) |
| `src/domain/rules/bookmarkRules.ts` | domain | 순수 함수 (정렬, 검증, 기본 프리셋 데이터) |
| `src/usecases/bookmark/ManageBookmarks.ts` | usecases | CRUD + 순서 변경 + 프리셋 초기화 |
| `src/adapters/repositories/JsonBookmarkRepository.ts` | adapters | JSON 저장소 구현 |
| `src/adapters/stores/useBookmarkStore.ts` | adapters | Zustand 스토어 |
| `src/adapters/components/Tools/BookmarkSection.tsx` | adapters | 즐겨찾기 전체 섹션 |
| `src/adapters/components/Tools/BookmarkGroupCard.tsx` | adapters | 그룹 헤더 + 카드 그리드 |
| `src/adapters/components/Tools/BookmarkCard.tsx` | adapters | 단일 즐겨찾기 카드 |
| `src/adapters/components/Tools/BookmarkFormModal.tsx` | adapters | 추가/편집 모달 |
| `src/adapters/components/Tools/BookmarkGroupModal.tsx` | adapters | 그룹 추가/편집 모달 |
| `src/widgets/items/Bookmarks.tsx` | widgets | 대시보드 즐겨찾기 위젯 |

### 수정 파일 (5개)

| 파일 | 변경 내용 |
|------|-----------|
| `src/domain/entities/index.ts` | Bookmark 타입 re-export 추가 |
| `src/domain/repositories/index.ts` | IBookmarkRepository re-export 추가 |
| `src/adapters/di/container.ts` | bookmarkRepository DI 등록 |
| `src/adapters/components/Tools/ToolsGrid.tsx` | 하단에 BookmarkSection 삽입 |
| `src/widgets/registry.ts` | Bookmarks 위젯 등록 |

---

## 7. 데이터 저장

### 7.1 파일 구조

```
data/
├── bookmarks.json     ← 신규 (즐겨찾기 + 그룹)
└── ...
```

### 7.2 bookmarks.json 스키마

```json
{
  "groups": [
    {
      "id": "g-001",
      "name": "업무",
      "emoji": "💼",
      "order": 0,
      "collapsed": false,
      "createdAt": "2026-03-11T00:00:00.000Z"
    },
    {
      "id": "g-002",
      "name": "수업 준비",
      "emoji": "📚",
      "order": 1,
      "collapsed": false,
      "createdAt": "2026-03-11T00:00:00.000Z"
    }
  ],
  "bookmarks": [
    {
      "id": "b-001",
      "name": "NEIS",
      "url": "https://neis.go.kr",
      "iconType": "emoji",
      "iconValue": "🏫",
      "groupId": "g-001",
      "order": 0,
      "createdAt": "2026-03-11T00:00:00.000Z",
      "updatedAt": "2026-03-11T00:00:00.000Z"
    }
  ]
}
```

---

## 8. 테스트 시나리오

| # | 시나리오 | 예상 결과 |
|---|---------|-----------|
| 1 | 즐겨찾기 0개 상태 | 빈 상태 UI + "기본 즐겨찾기 추가" 버튼 표시 |
| 2 | 기본 프리셋 추가 버튼 클릭 | 4개 그룹 + 17개 사이트 일괄 등록 |
| 3 | 이미 즐겨찾기 있을 때 프리셋 추가 | 중복 URL 스킵, 새 항목만 추가 |
| 4 | 즐겨찾기 추가 (이름 + URL + 이모지) | 해당 그룹 마지막에 추가, 카드 즉시 표시 |
| 5 | URL 유효성 검증 | http/https 아닌 URL → 에러 표시 |
| 6 | 즐겨찾기 카드 클릭 | 외부 브라우저에서 URL 열기 |
| 7 | 그룹 접기/펼치기 | collapsed 상태 저장, 새로고침 후에도 유지 |
| 8 | 드래그앤드롭 순서 변경 | 순서 변경 후 즉시 저장 |
| 9 | 즐겨찾기 편집 | 이름/URL/아이콘/그룹 변경 가능 |
| 10 | 즐겨찾기 삭제 | 확인 후 삭제, 토스트 알림 |
| 11 | 그룹 삭제 | 그룹 내 즐겨찾기도 함께 삭제 (확인 모달) |
| 12 | 파비콘 자동 가져오기 | URL 입력 시 파비콘 로드 → 실패 시 이모지 폴백 |
| 13 | 대시보드 위젯 | 즐겨찾기 최대 8개 표시, 클릭 시 외부 브라우저 열기 |
| 14 | 오프라인 상태 | 즐겨찾기 CRUD 정상 동작 (로컬 저장) |
| 15 | 앱 재시작 후 | 저장된 즐겨찾기 + 그룹 복원 |

---

## 9. 리스크 및 대안

| 리스크 | 대안 |
|--------|------|
| 파비콘 로드 실패 (CORS/오프라인) | Google Favicon API 사용 + 이모지 폴백 |
| 드래그앤드롭 구현 복잡도 | Phase 3으로 분리, HTML5 Drag API 사용 (라이브러리 미추가) |
| 즐겨찾기 수가 매우 많아질 때 | 그룹별 접기로 대응, 검색 기능은 v2에서 고려 |
| 외부 URL 보안 우려 | `openExternal`로 외부 브라우저에서만 열기 (webview 사용 안 함) |
| 프리셋 URL 변경 (사이트 주소 변경) | 프리셋은 초기 데이터일 뿐, 사용자가 자유롭게 수정 가능 |

---

## 부록: 디자인 시스템 참고

현재 쌤핀 디자인 토큰:
- 배경: `sp-bg` (#0a0e17)
- 카드: `sp-card` (#1a2332)
- 테두리: `sp-border` (#2a3548)
- 강조: `sp-accent` (#3b82f6)
- 하이라이트: `sp-highlight` (#f59e0b)
- 텍스트: `sp-text` (#e2e8f0)
- 흐린 텍스트: `sp-muted` (#94a3b8)

즐겨찾기 카드 스타일은 기존 `ToolsGrid` 카드 패턴을 따른다:
- `bg-sp-card rounded-2xl p-6 border border-transparent hover:border-blue-500/30 hover:scale-[1.02]`
- 외부 링크 아이콘: `open_in_new` (Material Symbols)