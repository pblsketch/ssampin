---
template: design
version: 1.0
feature: chalkboard-subject-backgrounds
date: 2026-04-22
author: pblsketch
project: ssampin
plan: ../../01-plan/features/chalkboard-subject-backgrounds.plan.md
---

# 칠판 교과별 배경 확장 설계서

> **요약**: Plan FR-01~FR-12를 만족시키는 구현 설계. 가장 큰 리스크였던 `pixelEraser × 이미지 오버레이` 충돌을 **렌더 경로 이원화**로 구조적으로 제거한다: 오선지(격자류)는 기존 Fabric `Line` 패턴을 확장하고, 지도 2종은 **Fabric 캔버스 바깥**(컨테이너 `<div>`의 CSS `background-image`)에 렌더한다. 타입·훅·툴바·컨테이너 4파일 수정 + 팝오버 1파일 신규 + 전처리 스크립트 1개 + 공용 PNG 2개.
>
> **Based on Plan**: [chalkboard-subject-backgrounds.plan.md](../../01-plan/features/chalkboard-subject-backgrounds.plan.md)
> **Status**: Draft

---

## 1. Design Overview

### 1.1 Goal

- `GridMode` 확장(6종) + 에셋 상수 맵 도입
- 오선지(`staff`) → Fabric Line 패턴(기존 grid/lines와 동일 경로)
- 한반도·세계 지도(`koreaMap`, `worldMap`) → **CSS background-image** (Fabric 외부)
- 팝오버 선택 UI(`BoardBackgroundPicker`) 신규
- 전처리 스크립트(sharp)로 JPG → 투명 PNG (흰 선 `rgba(255,255,255,0.85)`)
- localStorage 영속화
- 단축키 `G` 동작 재정의

### 1.2 Scope of Change

| 파일 | 변경 | 라인 대략 | 비고 |
|------|------|-----------|------|
| [src/adapters/components/Tools/Chalkboard/types.ts](../../../src/adapters/components/Tools/Chalkboard/types.ts) | 수정 | 30 | `GridMode` 확장 + `BACKGROUND_ASSETS`·`BACKGROUND_LABELS` 추가 |
| [src/adapters/components/Tools/Chalkboard/useChalkCanvas.ts](../../../src/adapters/components/Tools/Chalkboard/useChalkCanvas.ts) | 수정 | 40~72, 168~188 | `createGridObjects()` → staff 추가. `redrawGrid` → `redrawBackground` 이름 유지 가능. `currentMapAsset` 반환 추가 |
| [src/adapters/components/Tools/Chalkboard/ChalkboardToolbar.tsx](../../../src/adapters/components/Tools/Chalkboard/ChalkboardToolbar.tsx) | 수정 | 46~50, 121~125, 213~217 | cycle 로직 제거, `BoardBackgroundPicker` 삽입 |
| src/adapters/components/Tools/Chalkboard/BoardBackgroundPicker.tsx | ✨ 신규 | - | 팝오버 + 썸네일 6개 |
| [src/adapters/components/Tools/ToolChalkboard.tsx](../../../src/adapters/components/Tools/ToolChalkboard.tsx) | 수정 | 18~20, 37~58, 162~164 | `gridMode` 영속화 + 컨테이너 `backgroundImage` 주입 |
| scripts/preprocess-chalkboard-maps.mjs | ✨ 신규 | - | sharp 파이프라인 |
| public/chalkboard/korea-map.png | ✨ 신규 | - | 한반도 전처리 결과 |
| public/chalkboard/world-map.png | ✨ 신규 | - | 세계 전처리 결과 |
| public/chalkboard/README.md | ✨ 신규 | - | 출처·라이선스 표기 |
| package.json | 수정 | devDependencies | `sharp` 추가 |

호출부(`ToolChalkboard` 외 외부)는 변경 없음.

### 1.3 Revised Architectural Decision (vs Plan §6.2)

| 항목 | Plan | Design 확정 | 이유 |
|------|------|------------|------|
| 지도 렌더 경로 | Fabric `FabricImage` (A안) | **CSS `background-image`** (B안) | Plan §5 최상위 리스크(pixelEraser × Image 충돌) 구조적 제거. saveAsImage 자연 제외. 리사이즈 `background-size: contain` 기본 제공. 로드 오류는 `<img>` onError로 처리 가능(아래 §5.3) |
| 오선지 렌더 경로 | 미정 | **Fabric Line (기존 grid 패턴)** | 격자류와 동일 경로 유지 → `excludeFromExport`, `__grid__` 태그, `redrawBackground` 흐름 재사용 |

---

## 2. Type & Constants Design

### 2.1 `types.ts` 변경안

```typescript
// 의미는 "배경 오버레이"이나 호출부 파급을 피하기 위해 이름은 GridMode 유지
export type GridMode =
  | 'none'
  | 'grid'       // 모눈
  | 'lines'      // 줄선
  | 'staff'      // 오선지 (Fabric Line)
  | 'koreaMap'   // 한반도 지도 (CSS background-image)
  | 'worldMap';  // 세계 지도 (CSS background-image)

export const GRID_MODE_ORDER: readonly GridMode[] = [
  'none', 'grid', 'lines', 'staff', 'koreaMap', 'worldMap',
] as const;

export const GRID_LABELS: Record<GridMode, string> = {
  none: '없음',
  grid: '모눈',
  lines: '줄선',
  staff: '오선지',
  koreaMap: '한반도',
  worldMap: '세계',
};

// 각 모드의 렌더 경로 분류
export type BackgroundRenderKind = 'canvas' | 'cssImage';

export const BACKGROUND_RENDER_KIND: Record<GridMode, BackgroundRenderKind> = {
  none: 'canvas',
  grid: 'canvas',
  lines: 'canvas',
  staff: 'canvas',
  koreaMap: 'cssImage',
  worldMap: 'cssImage',
};

// CSS 경로 에셋 맵 (canvas 경로는 null)
export const BACKGROUND_ASSETS: Record<GridMode, string | null> = {
  none: null,
  grid: null,
  lines: null,
  staff: null,
  koreaMap: '/chalkboard/korea-map.png',
  worldMap: '/chalkboard/world-map.png',
};

// 팝오버용 간단 설명
export const GRID_DESCRIPTIONS: Record<GridMode, string> = {
  none: '배경 없음',
  grid: '수학·도표',
  lines: '필기 줄선',
  staff: '음악·영어',
  koreaMap: '사회·한국사',
  worldMap: '세계사·지리',
};
```

### 2.2 저장 키

- 신규: `chalkboard.gridMode` (`string` — `GridMode` 중 하나). 없으면 `'none'`.
- 파싱: 저장값이 `GRID_MODE_ORDER`에 없으면 `'none'`으로 폴백.

---

## 3. Canvas Rendering Design

### 3.1 `createGridObjects()` — staff 추가

```typescript
function createGridObjects(w: number, h: number, gridMode: GridMode): Line[] {
  // CSS 경로는 Fabric에 그리지 않음
  if (BACKGROUND_RENDER_KIND[gridMode] !== 'canvas') return [];
  if (gridMode === 'none') return [];

  const lines: Line[] = [];
  const baseOpts = {
    stroke: 'rgba(255,255,255,0.12)',
    strokeWidth: 0.5,
    selectable: false,
    evented: false,
    excludeFromExport: true,
  } as const;

  if (gridMode === 'grid') {
    // 기존 로직 유지
  } else if (gridMode === 'lines') {
    // 기존 로직 유지
  } else if (gridMode === 'staff') {
    // 오선지: 5선 한 세트(간격 STAFF_LINE_GAP) + 세트 간 공백(STAFF_SET_GAP)
    const STAFF_LINE_GAP = 12;
    const STAFF_SET_HEIGHT = STAFF_LINE_GAP * 4; // 4간격 = 5선
    const STAFF_SET_GAP = 56;
    const SET_PERIOD = STAFF_SET_HEIGHT + STAFF_SET_GAP;
    const MARGIN_X = 24;
    const opts = { ...baseOpts, stroke: 'rgba(255,255,255,0.35)' } as const;

    let setStart = MARGIN_X; // 위쪽 여백
    while (setStart + STAFF_SET_HEIGHT < h - MARGIN_X) {
      for (let i = 0; i < 5; i++) {
        const y = setStart + i * STAFF_LINE_GAP;
        const l = new Line([MARGIN_X, y, w - MARGIN_X, y], opts);
        markGrid(l);
        lines.push(l);
      }
      setStart += SET_PERIOD;
    }
  }
  return lines;
}
```

**설계 포인트**:
- `BACKGROUND_RENDER_KIND[gridMode] !== 'canvas'` 가드로 지도 모드에서는 빈 배열 반환 → 기존 `redrawGrid` 로직이 자연스럽게 아무것도 그리지 않음
- 오선지는 격자보다 진하게(`0.35` vs `0.12`) → 5선이 시인 가능

### 3.2 `redrawGrid` 유지

기존 로직 그대로 재사용. canvas 경로 배경만 처리하므로 이름은 변경하지 않는다(호출부 파급 최소). 내부 주석으로 "canvas 경로 배경만 렌더, CSS 경로는 컨테이너가 책임" 명시.

### 3.3 `useChalkCanvas` 반환값 확장

```typescript
return {
  // 기존 …
  gridMode,
  setGridMode,
  currentBackgroundCssUrl: BACKGROUND_ASSETS[gridMode], // ✨ 신규
};
```

`ToolChalkboard`가 이 값을 받아 컨테이너 `<div>`의 `style.backgroundImage`에 주입.

---

## 4. CSS Background Layer (맵 전용)

### 4.1 `ToolChalkboard.tsx` 컨테이너 수정

```tsx
const { /* … */, currentBackgroundCssUrl } = useChalkCanvas({ /* … */ });

const containerStyle: React.CSSProperties = {
  backgroundColor: currentBoardBg,
  cursor: cursorStyle,
  ...(currentBackgroundCssUrl && {
    backgroundImage: `url("${currentBackgroundCssUrl}")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center center',
    backgroundSize: 'contain', // 종횡비 유지하며 최대 피팅
  }),
};

return (
  <div className="relative flex-1 rounded-xl border-4 border-amber-800/60 shadow-inner overflow-hidden"
       style={containerStyle}>
    <canvas ref={canvasElRef} className="absolute inset-0" />
    {/* … */}
  </div>
);
```

**설계 포인트**:
- `backgroundSize: 'contain'` — 이미지 종횡비 유지, 짧은 축에 꽉 채움
- `backgroundPosition: 'center'` — 중앙 정렬
- `backgroundColor`는 동시에 살아 있음 → 이미지 투명 영역에는 칠판 색이 보임
- Fabric canvas는 `absolute inset-0 + backgroundColor: 'transparent'`(이미 그럼)이므로 CSS 배경이 canvas 아래에서 보임

### 4.2 로드 실패 폴백 (FR-12)

CSS background-image는 onError 훅이 없으므로 **프리로드 프로빙** 패턴 사용:

```typescript
// ToolChalkboard.tsx 내부
useEffect(() => {
  if (!currentBackgroundCssUrl) return;
  const img = new Image();
  img.onerror = () => {
    console.warn('[chalkboard] background asset failed to load:', currentBackgroundCssUrl);
    showToast('지도 배경을 불러오지 못했어요. 배경을 없음으로 되돌릴게요.');
    setGridMode('none');
  };
  img.src = currentBackgroundCssUrl;
}, [currentBackgroundCssUrl, setGridMode]);
```

Toast는 기존 쌤핀 공용 Toast 시스템 사용([src/adapters/components/common](../../../src/adapters/components/common)).

---

## 5. Popover UI — `BoardBackgroundPicker`

### 5.1 위치·스타일

- 기존 `EraserControl` / `PenSizeControl`의 `createPortal + fixed + z-10000` 패턴 그대로 복제
- 트리거 버튼은 `ChalkboardToolbar`의 기존 "격자" 버튼 자리 대체
- 팝오버 크기: 280×260 (2열 × 3행 썸네일 + 힌트 한 줄)

### 5.2 썸네일 카드 6개 레이아웃

```
┌──────────────────────────────────────┐
│ 배경                                 │
│ ┌────────┬────────┬────────┐         │
│ │ 없음   │ 모눈   │ 줄선   │         │
│ │ (빈)   │ (···)  │ (═══)  │         │
│ ├────────┼────────┼────────┤         │
│ │ 오선지 │ 한반도 │ 세계   │         │
│ │ (5선)  │ 🇰🇷   │ 🌏    │         │
│ └────────┴────────┴────────┘         │
│ 💡 어두운 칠판색에서 가장 선명해요    │  ← 지도 hover/선택 시에만 노출
└──────────────────────────────────────┘
```

**썸네일 구현**:
- `none`: 빈 프레임
- `grid` / `lines` / `staff`: 인라인 SVG 미니어처 (24×24 이내, 3~5 라인)
- `koreaMap` / `worldMap`: 실제 PNG 썸네일 (같은 에셋 재사용, `max-height: 40px`) + 컨트라스트를 위해 어두운 회색 배경

**선택 상태**:
- 활성 카드: `ring-2 ring-amber-400 bg-amber-50`
- 비활성: `bg-gray-50 hover:bg-gray-100`

**힌트**(FR: Plan 결정 A+C):
- `koreaMap` 또는 `worldMap` 선택됐거나 hover 중이면 팝오버 하단에 `💡 어두운 칠판색에서 가장 선명해요` 1줄
- 그 외엔 숨김

### 5.3 Props 시그니처

```typescript
interface BoardBackgroundPickerProps {
  gridMode: GridMode;
  onGridModeChange: (mode: GridMode) => void;
}
```

### 5.4 키보드 & 단축키 (FR-11)

- **`G`**: 팝오버가 닫혀 있으면 **열기**. 열려 있으면 **다음 옵션**으로 이동 (`GRID_MODE_ORDER` 순환)
- 팝오버 내부: `Tab`/`Shift+Tab` 기본 포커스 이동, `Enter`/`Space`로 선택, `Escape`로 닫기 (기존 팝오버 관행)
- 단축키 구현 위치: `ToolChalkboard.tsx` shortcuts 배열의 `g` 핸들러를 아래로 변경

```typescript
{ key: 'g', label: '배경', description: '배경 전환', handler: () => {
    if (pickerOpenRef.current) {
      // 팝오버 열려 있으면 → 다음 옵션
      const idx = GRID_MODE_ORDER.indexOf(gridMode);
      setGridMode(GRID_MODE_ORDER[(idx + 1) % GRID_MODE_ORDER.length]!);
    } else {
      setPickerOpen(true); // 팝오버 열기
    }
  }
},
```

팝오버 open 상태를 `ToolChalkboard` → `ChalkboardToolbar` → `BoardBackgroundPicker`로 controlled prop 1개 추가. 또는 `BoardBackgroundPicker` 내부에 `ref` 노출하여 부모가 open 제어. 간단함을 위해 controlled 방식 채택.

---

## 6. Preprocessing Script — `scripts/preprocess-chalkboard-maps.mjs`

### 6.1 파이프라인

입력: `docs/전국.jpg`, `docs/세계지도.jpg` (국토지리정보원 공공누리 제1유형)
출력: `public/chalkboard/korea-map.png`, `public/chalkboard/world-map.png`

```
JPG 원본 (흰 배경 + 검정 선)
  ↓  1. 리사이즈: 세계는 max 1800×2400, 한반도는 max 1400×2000 (긴 변 기준)
  ↓  2. 밝기 반전 (negate): 검은 선 → 밝은 선, 흰 배경 → 검은 배경
  ↓  3. 그레이스케일(greyscale)
  ↓  4. 임계값 기반 알파 마스크:
  ↓     - 밝은 픽셀(선)만 남기고 어두운 픽셀(원래 배경)은 알파 0
  ↓     - 선 부분의 알파는 일괄 0.85로 스케일 (rgba(255,255,255,0.85) 효과)
  ↓  5. 라운드 소프트닝 (모스키토 노이즈 제거): 가벼운 blur (σ=0.3~0.5)
  ↓  6. PNG 저장 (palette: true, compressionLevel: 9)
  ↓  7. 크기 체크: 한반도 ≤ 300KB, 세계 ≤ 500KB (초과 시 경고, 수동 해상도 조정)
```

### 6.2 sharp 구체 호출

```javascript
import sharp from 'sharp';

async function preprocess({ input, output, maxW, maxH }) {
  const pipeline = sharp(input)
    .resize({ width: maxW, height: maxH, fit: 'inside', withoutEnlargement: true })
    .greyscale()
    .negate({ alpha: false })
    .threshold(64)           // 선/배경 이진화 (임계값은 실 이미지로 튜닝)
    .blur(0.4);              // 경계 softening

  // threshold 후: 선 = 흰색(255), 배경 = 검정(0).
  // 흰색을 불투명 흰색으로, 검정을 투명으로 변환.
  const raw = await pipeline.raw().toBuffer({ resolveWithObject: true });
  const { data, info } = raw;
  const pixelCount = info.width * info.height;
  const rgba = Buffer.alloc(pixelCount * 4);
  for (let i = 0; i < pixelCount; i++) {
    const gray = data[i]!;
    const alpha = Math.round((gray / 255) * 255 * 0.85); // 0.85 스케일
    rgba[i * 4 + 0] = 255;
    rgba[i * 4 + 1] = 255;
    rgba[i * 4 + 2] = 255;
    rgba[i * 4 + 3] = alpha;
  }

  await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9, palette: false })
    .toFile(output);
}

await preprocess({
  input: 'docs/전국.jpg',
  output: 'public/chalkboard/korea-map.png',
  maxW: 1400, maxH: 2000,
});

await preprocess({
  input: 'docs/세계지도.jpg',
  output: 'public/chalkboard/world-map.png',
  maxW: 1800, maxH: 2400,
});
```

### 6.3 임계값 튜닝 절차 (Design 단계에서 수행)

1. `scripts/preprocess-chalkboard-maps.mjs --threshold=64` 로 우선 생성
2. 생성된 PNG를 초록 칠판 색(`#2d5a27`) 배경에 올려 Chrome에서 시각 검수
3. 너무 두꺼움/가늘음 → `--threshold=80` 또는 `--threshold=50` 재생성
4. 최종 threshold를 스크립트에 하드코딩 후 커밋

### 6.4 의존성 추가

```bash
npm install --save-dev sharp
```

sharp는 plat별 prebuilt binary 자동 다운로드. macOS/Windows 모두 지원.

---

## 7. `BoardBackgroundPicker` Component Contract

```typescript
// BoardBackgroundPicker.tsx — 신규 파일, 약 180~220줄 예상
import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  GRID_MODE_ORDER, GRID_LABELS, GRID_DESCRIPTIONS,
  BACKGROUND_RENDER_KIND, BACKGROUND_ASSETS,
} from './types';
import type { GridMode } from './types';

interface BoardBackgroundPickerProps {
  gridMode: GridMode;
  onGridModeChange: (mode: GridMode) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BoardBackgroundPicker({
  gridMode, onGridModeChange, open, onOpenChange,
}: BoardBackgroundPickerProps) { /* … EraserControl 패턴 복제 */ }

function BackgroundThumbnail({ mode }: { mode: GridMode }) {
  // 각 모드별 미니 미리보기 렌더 분기 (SVG 또는 <img>)
}
```

썸네일 SVG 상수는 `Chalkboard/thumbnails.tsx`에 분리할지 여부는 Do 단계 판단에 맡김.

---

## 8. Test Matrix (수동 검증)

Plan §4.1의 시나리오 10개에 각 FR 매핑:

| # | 시나리오 | 관련 FR |
|---|---------|--------|
| 1 | 팝오버에서 6개 모드 차례 선택 → 각 오버레이 정상 | FR-01, FR-02, FR-03, FR-04 |
| 2 | 오선지 위에 분필 판서 → 판서가 오선 위에 올라감 | FR-02, FR-05 |
| 3 | 검정/남색 칠판에서 지도 선 시인성 | FR-03, FR-04 (전처리 알파 0.85) |
| 4 | 창 리사이즈 시 지도 재피팅 | FR-09 (CSS `background-size: contain`) |
| 5 | 모드 전환 시 이전 오버레이 잔존 없음 | FR-06 |
| 6 | 판서 유지하며 모드 전환 | FR-06 + 기존 Fabric 객체 보존 |
| 7 | `Ctrl+S` 저장 이미지에 오버레이 없음 | FR-08 (Fabric: excludeFromExport / CSS: 캔버스 밖) |
| 8 | 페이지 추가/이동 시 모드 유지 | FR-07 |
| 9 | 새로고침 후 모드 복원 | FR-10 |
| 10 | 에셋 파일명 변경 → 폴백 + 토스트 | FR-12 |
| 11 | **가장 중요**: 지도 모드에서 `pixelEraser` 드래그 → **지도 지워지지 않음** | 아키텍처 핵심 (§1.3 revision) |
| 12 | 단축키 `G` 동작 (닫힘→열림, 열림→다음) | FR-11 |

---

## 9. Edge Cases

| 상황 | 처리 |
|------|------|
| 페이지 A에서 `koreaMap` 선택 → 페이지 추가 `+` → 페이지 B | `gridMode`는 `useChalkCanvas` 훅 state로 페이지와 독립. 모든 페이지에 동일 배경 적용. **의도적**: 교사가 수업 중 배경을 자주 안 바꾸므로 OK |
| Undo가 배경 변경도 포함하는가? | **아니오**. 배경은 Fabric 히스토리(`pushSnapshot`) 바깥. 기존 grid와 동일 |
| Undo 후 판서가 사라지면서 지도가 다시 보여야 하는가? | CSS 배경은 항상 살아 있으므로 이슈 없음. Fabric 경로 오선지는 `redrawGrid` 보장 |
| 빈 에셋 URL로 브라우저가 fetch 시 에러 발생 | `BACKGROUND_ASSETS[mode] === null` 체크로 style 주입 자체 생략 |
| 에셋 로드 중 모드 재전환 | CSS는 브라우저가 자동 취소. 이전 `Image.onerror` 핸들러는 `useEffect` cleanup으로 제거 (§4.2) |
| localStorage에 구버전 값 `'grid'`가 그대로 있음 | 유효값이므로 그대로 사용. 타입 유니온 확장은 **상위 호환** |
| localStorage에 알 수 없는 값 | `GRID_MODE_ORDER.includes` 체크 후 폴백 `'none'` |

---

## 10. Performance & Asset Budget

| 항목 | 목표 | 측정 |
|------|------|------|
| 한반도 PNG | ≤ 300KB | `ls -lh public/chalkboard/` |
| 세계 PNG | ≤ 500KB | 동상 |
| 첫 로드 지연 | ≤ 150ms (로컬 정적) | DevTools Network |
| 모드 전환 렌더 | ≤ 16ms | DevTools Performance |
| 메모리 누수 | 100회 전환 후 안정 | Heap snapshot diff |

---

## 11. Implementation Order (for `/pdca do`)

1. **의존성 & 전처리**
   1. `npm install --save-dev sharp`
   2. `scripts/preprocess-chalkboard-maps.mjs` 작성
   3. threshold 튜닝 → `public/chalkboard/{korea,world}-map.png` 생성
   4. `public/chalkboard/README.md` 작성(출처·라이선스)
2. **타입 확장**
   5. `types.ts`에 `GridMode` + 5개 상수 맵 + `GRID_MODE_ORDER`
3. **캔버스 경로**
   6. `useChalkCanvas.ts`의 `createGridObjects`에 `staff` 케이스 + `BACKGROUND_RENDER_KIND` 가드
   7. 훅 반환값에 `currentBackgroundCssUrl` 추가
4. **CSS 경로**
   8. `ToolChalkboard.tsx` 컨테이너 style 조립 + 프리로드 프로빙
   9. `localStorage` `chalkboard.gridMode` 영속화 코드
5. **UI**
   10. `BoardBackgroundPicker.tsx` 신규
   11. 썸네일 SVG 6개 + 힌트 한 줄
   12. `ChalkboardToolbar.tsx` 에서 기존 cycle 버튼을 Picker로 교체
6. **단축키**
   13. `ToolChalkboard.tsx`의 `g` 핸들러 재정의 + `pickerOpen` state
7. **검증**
   14. 수동 체크리스트 12개(§8) 전부 통과
   15. `npx tsc --noEmit`, `npm run build`

각 스텝 완료 시 커밋 권장(세트 1 = 커밋 1).

---

## 12. Open Questions (Do 단계에서 확정)

1. 지도 PNG 썸네일을 팝오버에서 원본 에셋 그대로 쓸지, 미리 32×32 축소본을 따로 만들지 — 에셋 1개당 수백 KB를 팝오버 DOM에 매번 로드하면 UX 부담. **축소본 권장**(전처리 스크립트에 `-thumb.png` 동시 산출).
2. `pickerOpen` 상태를 `ToolChalkboard`와 `ChalkboardToolbar` 중 어느 쪽에서 소유할지 — 단축키가 `ToolChalkboard`에서 처리되므로 상위 소유가 자연스러움.
3. 오선지 선·세트 간격(`STAFF_LINE_GAP=12`, `STAFF_SET_GAP=56`) 실물 판서 시 체감 확인 필요.

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-22 | 초기 Design 작성. Plan §6.2 지도 렌더 경로를 Fabric(A) → CSS(B)로 revision | pblsketch |
