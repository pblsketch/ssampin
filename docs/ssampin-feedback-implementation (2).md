# 쌤핀(Ssampin) 피드백 반영 구현 계획서

> 작성일: 2026-03-02
> 피드백 출처: 중고등 교사 사용자

---

## 📋 피드백 요약

| # | 피드백 | 심각도 | 해결 방향 |
|---|--------|--------|-----------|
| 1 | Windows 다운로드 시 SmartScreen 보안 경고 | 🔴 높음 | 랜딩 페이지 FAQ 안내 추가 (당장 무료 해결) |
| 2 | 초등에 맞춰진 인터페이스가 중고등에 불편 | 🟠 중-높 | 위젯 기반 모듈러 대시보드 구현 |
| 3 | 교사 주간시간표(월~금)가 한눈에 안 보임 | 🟠 중-높 | 교사 주간시간표 위젯 추가 |
| 4 | 비담임에게 불필요한 자리배치 표시 | 🟡 중간 | 역할별 위젯 자동 표시/숨김 |
| 5 | 대시보드 커스터마이징 요청 | 🟢 개선 | 위젯 토글 + 드래그앤드롭 |

---

## 🗺️ 전체 구현 로드맵

```
[Phase 1 - 즉시 적용] 1~2일
└─ 랜딩 페이지 SmartScreen FAQ 아코디언 추가

[Phase 2 - 위젯 시스템 기반] 1~2주
├─ 위젯 레지스트리 시스템 구축
├─ 기존 대시보드 요소를 독립 위젯으로 리팩토링
├─ 위젯별 표시/숨김 토글 (설정 패널)
├─ 학교급/역할별 기본 프리셋 4종
└─ 교사 주간시간표 위젯 신규 개발

[Phase 3 - 드래그앤드롭] 1~2주
├─ 위젯 순서 드래그앤드롭
└─ 편집 모드 UI

[Phase 4 - 고급 기능] 1~2개월 (선택)
├─ 위젯 크기 조절 그리드
├─ 컨텍스트 감지 자동 전환
└─ 레이아웃 공유 기능
```

---

# Part 1: 랜딩 페이지 SmartScreen FAQ

## 구현 프롬프트

```markdown
# 랜딩 페이지 다운로드 섹션에 FAQ 아코디언 추가

## 목표
Windows 다운로드 버튼 바로 아래에, Windows SmartScreen 보안 경고에 대한 
안내 FAQ를 접이식(아코디언) 형태로 추가합니다.

## 위치
- 기존 Windows 다운로드 버튼 바로 아래
- 다른 다운로드 버튼(Mac 등)이 있다면 그 아래가 아닌, Windows 버튼 직후

## FAQ 내용

### 접힌 상태 (기본)
⚠️ 다운로드 시 보안 경고가 뜨나요?

- 클릭/탭 시 아래 내용이 펼쳐짐
- 화살표(▶/▼) 또는 +/- 아이콘으로 접힘 상태 표시

### 펼친 상태

⚠️ 다운로드 시 "일반적으로 다운로드되지 않습니다" 경고가 떠요

걱정 마세요! 쌤핀은 안전한 프로그램입니다.

Windows가 아직 많이 다운로드되지 않은 새로운 프로그램에 대해 
보안 경고를 표시하는 것으로, 악성 프로그램이라는 의미가 아닙니다.

해결 방법:
1. "추가 정보"를 클릭합니다
2. "실행" 버튼을 클릭합니다
3. 정상적으로 설치가 진행됩니다

이 경고는 Microsoft의 코드 서명 인증이 적용되기 전까지 표시될 수 있으며, 
사용자가 늘어나면 자연스럽게 사라집니다.

## UI/UX 요구사항

### 스타일
- 배경: 연한 노란색(#FFF8E1) 또는 연한 회색 배경으로 구분
- 왼쪽에 ⚠️ 아이콘 표시
- 폰트 크기: 본문보다 약간 작게 (0.9em 정도)
- 최대 너비: 다운로드 버튼 영역과 동일하게 맞춤
- 둥근 모서리 (border-radius: 8px)

### 동작
- 기본 상태: 접힘 (제목만 보임)
- 클릭 시 부드럽게 펼침 (max-height 트랜지션 또는 애니메이션)
- 다시 클릭 시 접힘
- JavaScript 없이도 내용이 접근 가능해야 함 (details/summary 태그 활용 권장)

### 해결 방법 단계 강조
- 각 단계를 시각적으로 구분 (숫자 원형 배지 또는 볼드)
- "추가 정보"와 "실행"은 굵게(bold) 또는 인라인 코드 스타일로 강조
- 선택적으로 각 단계 옆에 간단한 아이콘 또는 화살표

### 반응형
- 모바일에서도 자연스럽게 표시
- 터치 영역 충분히 확보 (최소 44px 높이)

## 접근성
- details/summary 사용 시 네이티브 접근성 확보
- 커스텀 구현 시 aria-expanded, aria-controls 속성 추가
- 키보드(Enter/Space)로 토글 가능

## 구현 방식 (선호 순서)
1. HTML <details><summary> 태그 활용 (가장 간단, JS 불필요)
2. 프레임워크 아코디언 컴포넌트 (React라면 Disclosure/Accordion)
3. 커스텀 CSS + JS 토글

## 참고: HTML details/summary 기본 구조

<details class="download-faq">
  <summary>
    <span class="faq-icon">⚠️</span>
    다운로드 시 보안 경고가 뜨나요?
  </summary>
  <div class="faq-content">
    <p>걱정 마세요! 쌤핀은 안전한 프로그램입니다.</p>
    <p>Windows가 아직 많이 다운로드되지 않은 새로운 프로그램에 대해 
    보안 경고를 표시하는 것으로, 악성 프로그램이라는 의미가 아닙니다.</p>
    <h4>해결 방법:</h4>
    <ol>
      <li><strong>"추가 정보"</strong>를 클릭합니다</li>
      <li><strong>"실행"</strong> 버튼을 클릭합니다</li>
      <li>정상적으로 설치가 진행됩니다</li>
    </ol>
    <p class="faq-note">
      💡 이 경고는 Microsoft의 코드 서명 인증이 적용되기 전까지 
      표시될 수 있으며, 사용자가 늘어나면 자연스럽게 사라집니다.
    </p>
  </div>
</details>

## 중요
- 기존 랜딩 페이지 디자인 시스템(색상, 폰트, 간격)과 일관성 유지
- 다운로드 버튼의 주목도를 떨어뜨리지 않도록 FAQ는 시각적으로 부차적이어야 함
- FAQ가 너무 길어 보이지 않도록 접힌 상태가 기본
```

---

# Part 2: 위젯 기반 모듈러 대시보드

## 아키텍처 설계

```
[대시보드 구조]

DashboardPage
├── DashboardHeader (편집 모드 토글, 위젯 추가 버튼)
├── WidgetGrid (위젯 컨테이너)
│   ├── WidgetCard (개별 위젯 래퍼)
│   │   ├── WidgetHeader (제목, 최소화/숨김 버튼)
│   │   └── WidgetContent (실제 위젯 컴포넌트)
│   ├── WidgetCard ...
│   └── AddWidgetPlaceholder (+ 위젯 추가)
└── WidgetSettingsDrawer (위젯 표시/숨김 토글 패널)
```

## 데이터 모델

```typescript
// 위젯 정의 (시스템)
interface WidgetDefinition {
  id: string;                    // 'weekly-timetable', 'today-class', 'seating' 등
  name: string;                  // '교사 주간시간표'
  icon: string;                  // '📅'
  description: string;           // 설명
  category: 'timetable' | 'class' | 'admin' | 'info';
  defaultSize: { w: number; h: number };  // 기본 크기
  minSize: { w: number; h: number };
  availableFor: {
    schoolLevel: ('elementary' | 'middle' | 'high')[];
    role: ('homeroom' | 'subject' | 'admin')[];
  };
  component: React.ComponentType;  // 실제 렌더링 컴포넌트
}

// 사용자 대시보드 설정 (저장)
interface DashboardConfig {
  userId: string;
  widgets: WidgetInstance[];
  lastModified: string;
}

interface WidgetInstance {
  widgetId: string;              // WidgetDefinition.id 참조
  visible: boolean;
  order: number;                 // 표시 순서
  size: { w: number; h: number };
  position?: { x: number; y: number };  // Phase 4용
}
```

## 위젯 목록

| ID | 이름 | 카테고리 | 기본 대상 |
|----|------|---------|----------|
| weekly-timetable | 교사 주간시간표 | timetable | 중고등 전체 |
| today-class | 오늘 수업 | timetable | 전체 |
| class-timetable | 학급 시간표 | timetable | 초등 담임 |
| seating | 자리배치 | class | 담임만 |
| attendance | 출결 현황 | class | 담임만 |
| meal | 급식 메뉴 | info | 전체 |
| grades | 성적 현황 | admin | 중고등 |
| tasks | 업무 목록 | admin | 보직교사 |

## 기본 프리셋

```json
{
  "elementary-homeroom": ["class-timetable", "seating", "attendance", "meal"],
  "elementary-subject": ["class-timetable", "today-class", "meal"],
  "middle-homeroom": ["weekly-timetable", "today-class", "seating", "attendance", "meal"],
  "middle-subject": ["weekly-timetable", "today-class", "meal", "grades"],
  "high-homeroom": ["weekly-timetable", "today-class", "seating", "attendance", "grades", "meal"],
  "high-subject": ["weekly-timetable", "today-class", "grades", "meal"],
  "admin": ["weekly-timetable", "today-class", "tasks", "meal"]
}
```

## 파일 구조

```
src/
├── widgets/
│   ├── registry.ts              # 위젯 등록/조회
│   ├── types.ts                 # WidgetDefinition, DashboardConfig 타입
│   ├── presets.ts               # 학교급/역할별 기본 프리셋
│   ├── useDashboardConfig.ts    # 설정 읽기/쓰기 훅
│   ├── components/
│   │   ├── WidgetCard.tsx       # 공통 카드 래퍼
│   │   ├── WidgetGrid.tsx       # 위젯 그리드 컨테이너
│   │   ├── WidgetSettings.tsx   # 설정 드로어 (토글 목록)
│   │   ├── AddWidgetButton.tsx  # 위젯 추가 버튼
│   │   └── DashboardHeader.tsx  # 대시보드 헤더
│   └── items/
│       ├── WeeklyTimetable.tsx  # 교사 주간시간표
│       ├── TodayClass.tsx       # 오늘 수업
│       ├── ClassTimetable.tsx   # 학급 시간표
│       ├── Seating.tsx          # 자리배치
│       ├── Attendance.tsx       # 출결 현황
│       ├── Meal.tsx             # 급식
│       ├── Grades.tsx           # 성적
│       └── Tasks.tsx            # 업무 목록
└── pages/
    └── Dashboard.tsx            # 리팩토링된 대시보드 페이지
```

---

## 구현 프롬프트 1: 위젯 시스템 기반 구조 생성

```markdown
# 쌤핀 대시보드 위젯 시스템 구현

## 목표
현재 고정된 대시보드를 위젯 기반 모듈러 대시보드로 리팩토링합니다.
교사가 자신의 학교급(초/중/고)과 역할(담임/비담임/보직)에 따라
대시보드에 표시할 위젯을 자유롭게 선택할 수 있어야 합니다.

## 요구사항

### 1. 위젯 레지스트리 시스템
- `src/widgets/registry.ts`에 모든 위젯을 중앙 등록
- 각 위젯은 다음 메타데이터를 가짐:
  - id (고유 식별자)
  - name (한글 표시명)
  - icon (이모지 또는 아이콘)
  - description (설명)
  - category ('timetable' | 'class' | 'admin' | 'info')
  - availableFor (학교급, 역할별 표시 조건)
  - defaultSize, minSize
  - component (React 컴포넌트)

### 2. 위젯 목록 (8개)
| ID | 이름 | 카테고리 | 기본 대상 |
|----|------|---------|----------|
| weekly-timetable | 교사 주간시간표 | timetable | 중고등 전체 |
| today-class | 오늘 수업 | timetable | 전체 |
| class-timetable | 학급 시간표 | timetable | 초등 담임 |
| seating | 자리배치 | class | 담임만 |
| attendance | 출결 현황 | class | 담임만 |
| meal | 급식 메뉴 | info | 전체 |
| grades | 성적 현황 | admin | 중고등 |
| tasks | 업무 목록 | admin | 보직교사 |

### 3. DashboardConfig (사용자 설정)
- 사용자별 위젯 구성을 로컬(또는 DB)에 저장
- 첫 방문 시 학교급/역할에 따라 기본 프리셋 자동 적용
- 설정 변경 시 즉시 저장 (auto-save)

### 4. UI 구성
- 대시보드 우측 상단에 ⚙️ "대시보드 설정" 버튼
- 클릭 시 사이드 드로어(또는 모달)에 위젯 목록 + 토글 스위치 표시
- 위젯 카드: 통일된 래퍼 (제목 바, 최소화 버튼, 숨김 버튼)
- 숨김 시 부드러운 페이드아웃 애니메이션

### 5. 기본 프리셋
{
  "elementary-homeroom": ["class-timetable", "seating", "attendance", "meal"],
  "middle-homeroom": ["weekly-timetable", "today-class", "seating", "attendance", "meal"],
  "middle-subject": ["weekly-timetable", "today-class", "meal", "grades"],
  "admin": ["weekly-timetable", "today-class", "tasks", "meal"]
}

### 6. 기술 제약
- React + TypeScript
- 상태 관리: 기존 프로젝트의 상태 관리 방식 따름
- 스타일: 기존 프로젝트의 CSS 방식 따름
- 저장: localStorage (Phase 1), 추후 서버 동기화

## 중요
- 기존 대시보드의 각 섹션을 위젯으로 분리하는 것이므로, 기존 로직을 최대한 재사용
- 위젯 내부 로직은 건드리지 않고 래퍼만 추가하는 방식으로 진행
- 첫 방문 감지 로직 포함 (localStorage에 config 없으면 → 프리셋 적용)
```

---

## 구현 프롬프트 2: 드래그앤드롭 순서 변경 추가

```markdown
# 대시보드 위젯 드래그앤드롭 순서 변경

## 목표
위젯 토글 시스템이 구현된 상태에서, 사용자가 위젯 순서를 
드래그앤드롭으로 변경할 수 있는 기능을 추가합니다.

## 요구사항

### 1. 편집 모드
- 대시보드 헤더에 "편집" 토글 버튼 추가
- 편집 모드 ON 시:
  - 각 위젯 카드 상단에 드래그 핸들(⋮⋮) 표시
  - 카드에 미세한 떨림(wobble) 애니메이션 (iOS 홈화면 스타일)
  - 숨김/표시 버튼이 카드 위에 오버레이로 표시
- 편집 모드 OFF 시:
  - 핸들 숨김, 일반 대시보드로 복귀
  - 변경사항 자동 저장

### 2. 드래그앤드롭
- 라이브러리: `@dnd-kit/core` + `@dnd-kit/sortable` 사용
- 드래그 시 원본 위치에 점선 placeholder 표시
- 드롭 시 부드러운 위치 전환 애니메이션 (300ms)
- 순서 변경 후 DashboardConfig.widgets[].order 업데이트 및 저장

### 3. 모바일 대응
- 터치 드래그 지원
- 길게 누르기(long press)로 편집 모드 진입 가능

### 4. 접근성
- 키보드 방향키로 위젯 순서 이동 가능
- aria-label로 현재 위치 안내 ("교사 주간시간표, 1번째 위치, 총 5개 중")

## 구현 파일
- `src/widgets/components/WidgetGrid.tsx` 수정 (DnD 컨텍스트 래핑)
- `src/widgets/components/WidgetCard.tsx` 수정 (드래그 핸들 추가)
- `src/widgets/components/DashboardHeader.tsx` 수정 (편집 모드 토글)
- `src/widgets/useDashboardConfig.ts` 수정 (reorder 함수 추가)
```

---

# 부록: 프롬프트 사용 순서

## 권장 순서

```
1단계: 랜딩 페이지 FAQ (Part 1 프롬프트)
  → 가장 빠르게 적용 가능, 사용자 이탈 방지

2단계: 위젯 시스템 기반 구조 (프롬프트 1)
  → 대시보드 리팩토링의 핵심, 반드시 먼저

3단계: 드래그앤드롭 (프롬프트 2)
  → 위젯 시스템 위에 얹는 기능
```

> 💡 **온보딩 프로파일링은 제외**: 쌤핀이 이미 회원가입/프로필에서 학교급·역할 정보를 
> 보유하고 있다면, 해당 데이터를 활용해 프리셋을 자동 적용하면 됨. 
> 별도 온보딩 모달은 불필요.

## 프롬프트 사용법
1. 쌤핀 프로젝트 폴더에서 Claude Code 또는 Cursor 실행
2. 위 프롬프트를 순서대로 입력
3. 각 프롬프트 실행 후 코드 리뷰 및 테스트
4. 다음 프롬프트 진행

## 주의사항
- 프롬프트는 React + TypeScript 기준으로 작성됨
- 쌤핀의 실제 기술 스택에 따라 프롬프트 내 기술 제약 부분을 수정
- 기존 코드 구조를 AI가 먼저 파악하도록, 프롬프트 앞에 "먼저 현재 프로젝트 구조를 분석해줘"를 추가하면 좋음
