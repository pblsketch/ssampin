# 대시보드 테마 시스템 계획서

> **작성일**: 2026-07-09
> **대상 버전**: v0.4.x
> **피드백 출처**: 준일님 — "카드 색상까지 고려한 대시보드(위젯) 테마를 몇 가지 만들면 좋겠다"

---

## 1. 개요

### 1.1 문제 정의

현재 쌤핀은 **다크(기본) + 라이트** 두 가지 테마만 지원하며, 이마저도 CSS 변수 오버라이드(`theme-light`, `theme-dark` 클래스)로 간단하게 구현되어 있다. 사용자가 카드 색상, 강조색 등을 세밀하게 커스텀할 수 없고, 분위기에 맞는 프리셋 테마 선택지가 없다.

### 1.2 현재 상태

| 항목 | 상태 |
|------|------|
| `Settings.theme` | `'light' \| 'dark' \| 'system'` — 3가지 옵션 |
| `index.css` `:root` | 다크 테마 변수 기본값 (sp-bg, sp-card 등 8개 토큰) |
| `.theme-light` | 라이트 테마 CSS 변수 오버라이드 |
| `.theme-dark` | 다크 테마 CSS 변수 오버라이드 (기본과 거의 동일) |
| `tailwind.config` | `sp-*` 컬러를 CSS 변수에서 참조 |
| `WidgetSettings` | `cardOpacity`, `transparent`, `opacity` 설정 있음 |
| 위젯 모드 | `--sp-widget-rgb` CSS 변수로 위젯 배경 제어 |

### 1.3 핵심 원칙

1. **CSS 변수 기반** — 기존 sp-* 토큰 시스템 확장, Tailwind 설정 변경 불필요
2. **프리셋 + 커스텀** — 미리 정의된 테마 선택 + 고급 사용자를 위한 커스텀 색상
3. **위젯 모드 반영** — 대시보드와 위젯 모두 동일 테마 적용
4. **라이브 프리뷰** — 테마 선택 시 즉시 미리보기

---

## 2. 기능 상세

### 2.1 프리셋 테마 정의 (7개)

| 테마 ID | 이름 | sp-bg | sp-surface | sp-card | sp-border | sp-accent | sp-text | sp-muted | 비고 |
|---------|------|-------|-----------|---------|-----------|-----------|---------|---------|------|
| `dark` | 다크 (기본) | #0a0e17 | #131a2b | #1a2332 | #2a3548 | #3b82f6 | #e2e8f0 | #94a3b8 | 현재 기본값 |
| `light` | 라이트 | #e0e2e6 | #d7d9de | #e6e7eb | #b0b5bf | #2563eb | #0f172a | #64748b | 현재 라이트 테마 |
| `pastel` | 파스텔 | #faf5ff | #f3e8ff | #ede4f5 | #d8b4fe | #a855f7 | #3b0764 | #7c3aed | 부드러운 보라 톤 |
| `navy` | 네이비 | #0c1929 | #132241 | #1a2d50 | #2a4066 | #60a5fa | #dbeafe | #93c5fd | 깊은 남색 |
| `forest` | 포레스트 | #0a1a0f | #112318 | #1a3322 | #2a5435 | #4ade80 | #dcfce7 | #86efac | 녹색 자연 |
| `sunset` | 선셋 | #1a0e0a | #2d1810 | #3d2218 | #5c3a2a | #f97316 | #fff7ed | #fdba74 | 따뜻한 석양 |
| `mono` | 모노 | #111111 | #1a1a1a | #222222 | #3a3a3a | #ffffff | #e5e5e5 | #a3a3a3 | 흑백 미니멀 |

### 2.2 데이터 모델

```typescript
// domain/entities/DashboardTheme.ts

export type PresetThemeId = 'dark' | 'light' | 'pastel' | 'navy' | 'forest' | 'sunset' | 'mono';

export interface ThemeColors {
  readonly bg: string;        // sp-bg
  readonly surface: string;   // sp-surface
  readonly card: string;      // sp-card
  readonly border: string;    // sp-border
  readonly accent: string;    // sp-accent
  readonly highlight: string; // sp-highlight
  readonly text: string;      // sp-text
  readonly muted: string;     // sp-muted
}

export interface DashboardTheme {
  readonly id: PresetThemeId | 'custom';
  readonly name: string;
  readonly colors: ThemeColors;
}
```

### 2.3 Settings 확장

```typescript
// Settings 엔티티에 추가
export interface Settings {
  // ... 기존 필드들 ...
  readonly dashboardTheme?: {
    readonly presetId: PresetThemeId | 'custom';
    readonly customColors?: ThemeColors;
  };
}
```

- `dashboardTheme` 가 없으면 기존 `theme` 필드의 light/dark/system으로 폴백
- `dashboardTheme.presetId` 가 `'custom'` 이면 `customColors` 사용

### 2.4 UI/UX 설계

#### 설정 페이지: 테마 선택 섹션

기존 "테마" 드롭다운을 **테마 프리뷰 그리드**로 교체:

```
┌──────────────────────────────────────────────────┐
│  🎨 대시보드 테마                                 │
│                                                  │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐             │
│  │ 다크 │ │라이트│ │파스텔│ │네이비│             │
│  │ ████ │ │ ████ │ │ ████ │ │ ████ │             │
│  │ ██ ▐ │ │ ██ ▐ │ │ ██ ▐ │ │ ██ ▐ │             │
│  │  ✓   │ │      │ │      │ │      │             │
│  └──────┘ └──────┘ └──────┘ └──────┘             │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐             │
│  │포레스│ │ 선셋 │ │ 모노 │ │커스텀│             │
│  │ ████ │ │ ████ │ │ ████ │ │  🎨  │             │
│  │ ██ ▐ │ │ ██ ▐ │ │ ██ ▐ │ │  +   │             │
│  └──────┘ └──────┘ └──────┘ └──────┘             │
│                                                  │
│  💡 위젯 모드에서도 동일한 테마가 적용됩니다.      │
└──────────────────────────────────────────────────┘
```

#### 프리뷰 카드 (`ThemePreviewCard`)

각 테마를 나타내는 미니 카드:
- 배경색: `theme.colors.bg`
- 카드 영역: `theme.colors.card` 미니 직사각형
- 강조 바: `theme.colors.accent` 얇은 선
- 텍스트 샘플: `theme.colors.text` + `theme.colors.muted`
- 선택 시 체크마크(✓) + `ring-2 ring-sp-accent`

#### 커스텀 색상 패널

"커스텀" 카드 클릭 시 펼쳐지는 패널:

```
┌──────────────────────────────────────────────────┐
│  🎨 커스텀 색상                                   │
│                                                  │
│  배경색      [████████] #0a0e17   [🔄 기본값]    │
│  카드색      [████████] #1a2332                   │
│  강조색      [████████] #3b82f6                   │
│  텍스트색    [████████] #e2e8f0                   │
│  서피스색    [████████] #131a2b                   │
│  테두리색    [████████] #2a3548                   │
│  보조텍스트  [████████] #94a3b8                   │
│                                                  │
│         [프리셋으로 돌아가기]  [💾 적용]          │
└──────────────────────────────────────────────────┘
```

- 각 색상에 `<input type="color">` + HEX 텍스트 입력
- 변경 즉시 라이브 프리뷰 (CSS 변수 실시간 업데이트)
- "기본값" 버튼으로 개별 색상 리셋

### 2.5 테마 적용 메커니즘

현재 방식(`theme-light`, `theme-dark` 클래스)을 **CSS 변수 직접 주입** 방식으로 확장:

```typescript
// adapters/hooks/useThemeApplier.ts

function useThemeApplier(): void {
  const { settings } = useSettingsStore();
  
  useEffect(() => {
    const theme = resolveTheme(settings);
    const root = document.documentElement;
    
    root.style.setProperty('--sp-bg', theme.colors.bg);
    root.style.setProperty('--sp-surface', theme.colors.surface);
    root.style.setProperty('--sp-card-base', theme.colors.card);
    root.style.setProperty('--sp-border', theme.colors.border);
    root.style.setProperty('--sp-accent', theme.colors.accent);
    root.style.setProperty('--sp-text', theme.colors.text);
    root.style.setProperty('--sp-muted', theme.colors.muted);
    
    // 위젯 RGB 계산 (투명 배경용)
    const rgb = hexToRgb(theme.colors.bg);
    root.style.setProperty('--sp-widget-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
  }, [settings.dashboardTheme, settings.theme]);
}
```

---

## 3. 구현 단계

### Phase 1: 테마 데이터 모델 + 프리셋 정의

1. `domain/entities/DashboardTheme.ts` — 테마 타입 + 프리셋 정의
2. `domain/entities/Settings.ts` — `dashboardTheme` 필드 추가
3. `adapters/stores/useSettingsStore.ts` — DEFAULT_SETTINGS에 dashboardTheme 추가

### Phase 2: 테마 적용 훅

1. `adapters/hooks/useThemeApplier.ts` — CSS 변수 주입 + 시스템 다크모드 감지
2. `App.tsx` — useThemeApplier() 호출 추가
3. 기존 `index.css`의 `.theme-light`, `.theme-dark` 클래스 → 폴백으로 유지 (제거 안 함)

### Phase 3: 설정 UI

1. `adapters/components/Settings/ThemeSection.tsx` — 테마 선택 UI (신규)
2. `adapters/components/Settings/ThemePreviewCard.tsx` — 미니 프리뷰 카드 (신규)
3. `SettingsPage.tsx` — 기존 테마 드롭다운을 ThemeSection으로 교체

### Phase 4: 커스텀 색상

1. `adapters/components/Settings/CustomThemePanel.tsx` — 커스텀 색상 편집기 (신규)
2. ThemeSection에 커스텀 옵션 통합

---

## 4. 파일 변경 목록

### 신규 파일 (5개)

| 파일 | 레이어 | 설명 |
|------|--------|------|
| `src/domain/entities/DashboardTheme.ts` | domain | 테마 타입 + 7개 프리셋 정의 |
| `src/adapters/hooks/useThemeApplier.ts` | adapters | CSS 변수 주입 훅 |
| `src/adapters/components/Settings/ThemeSection.tsx` | adapters | 테마 선택 그리드 UI |
| `src/adapters/components/Settings/ThemePreviewCard.tsx` | adapters | 미니 프리뷰 카드 |
| `src/adapters/components/Settings/CustomThemePanel.tsx` | adapters | 커스텀 색상 편집기 |

### 수정 파일 (4개)

| 파일 | 변경 내용 |
|------|-----------|
| `src/domain/entities/Settings.ts` | `dashboardTheme` optional 필드 추가 |
| `src/adapters/stores/useSettingsStore.ts` | DEFAULT_SETTINGS에 dashboardTheme 기본값, 마이그레이션 |
| `src/adapters/components/Settings/SettingsPage.tsx` | 기존 테마 섹션을 ThemeSection 컴포넌트로 교체 |
| `src/App.tsx` | useThemeApplier() 호출 추가 |

---

## 5. 테스트 시나리오

| # | 시나리오 | 예상 결과 |
|---|---------|-----------|
| 1 | 기본 상태 (dashboardTheme 없음) | 기존 다크 테마 유지 |
| 2 | 프리셋 "라이트" 선택 | 라이트 색상으로 전환 |
| 3 | 프리셋 "파스텔" 선택 | 파스텔 보라 색상 적용 |
| 4 | 테마 변경 후 앱 재시작 | 저장된 테마 유지 |
| 5 | 위젯 모드에서 테마 확인 | 대시보드와 동일 테마 적용 |
| 6 | 커스텀 색상 변경 | 실시간 프리뷰 + 저장 |
| 7 | 커스텀 → 프리셋 전환 | 프리셋 색상으로 복원 |
| 8 | system 테마 + 시스템 다크모드 | 시스템 설정 따라 적용 |
| 9 | 프리뷰 카드 선택 시 체크마크 | 현재 테마에 ✓ 표시 |
| 10 | 모든 프리셋 테마 순회 | 각 테마 색상 정상 적용 |
| 11 | cardOpacity 설정과 테마 조합 | 두 설정 모두 반영 |

---

## 6. 리스크 및 대안

| 리스크 | 대안 |
|--------|------|
| CSS 변수 직접 주입 시 깜빡임 | useLayoutEffect 사용하여 렌더 전 적용 |
| 기존 theme-light/dark 클래스와 충돌 | 새 시스템이 CSS 변수를 직접 설정하므로 클래스 기반은 폴백으로만 유지 |
| 커스텀 색상에서 가독성 나쁜 조합 | 텍스트/배경 대비 비율 경고 표시 (선택사항) |
| 위젯 투명 모드에서 테마 충돌 | --sp-widget-rgb를 테마 bg 기반으로 자동 계산 |

---

## 부록: 디자인 참고

### 프리뷰 카드 레이아웃

```
┌─────────────────────┐
│  ████████████████████│  ← bg 색상 배경
│  ┌────────────────┐ │
│  │ ██████ ████    │ │  ← card 위에 text + muted 샘플
│  │ ▮▮▮▮▮▮▮▮▮▮▮▮  │ │  ← accent 바
│  └────────────────┘ │
│        테마이름       │  ← text 색상
│                     │
│         ✓           │  ← 선택 시 accent 체크마크
└─────────────────────┘
```

- 카드 크기: `w-[130px] h-[100px]` (모바일 대응)
- 선택 링: `ring-2 ring-offset-2 ring-sp-accent`
- 호버: `scale-105 transition-transform`
