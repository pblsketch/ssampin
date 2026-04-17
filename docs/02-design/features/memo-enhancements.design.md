---
template: design
version: 1.2
feature: memo-enhancements
date: 2026-04-17
author: pblsketch
project: ssampin
version_target: v1.11.0
depends_on:
  - docs/01-plan/features/memo-font-size.plan.md
  - docs/01-plan/features/memo-image-attachment.plan.md
---

# 메모 강화(글자 크기 + 이미지 첨부) 통합 설계서

> 두 Plan 문서([memo-font-size](../../01-plan/features/memo-font-size.plan.md), [memo-image-attachment](../../01-plan/features/memo-image-attachment.plan.md))를 하나의 Design으로 통합한다. 동일한 `Memo` 엔티티를 수정하므로 단일 마이그레이션으로 처리해 스키마 진화 리스크를 최소화한다.

---

## 0. 통합 이유

| 항목 | 분리 구현 | **통합 구현 (선택)** |
|-----|----------|---------------------|
| `Memo` 엔티티 수정 | 2회 (`fontSize` → `image`) | 1회 (두 필드 동시 추가) |
| Repository 마이그레이션 로직 | 2회 분리 | 1회 공통 |
| `useMemoStore` 액션 추가 | 각각 PR | 1개 PR |
| 툴바 UI 재배치 | 2차례 레이아웃 변경 | 1번에 확정 |
| 버전 배포 | v1.11.0 + v1.12.0 | **v1.11.0 단일** |
| Gap 분석 매치율 | 두 피처 분리 산정 | 단일 피처로 집계 |
| 리스크 | 중간 버전에서 스키마 반쯤 적용 | **단일 릴리즈, 명확** |

→ **통합 구현 선택**. 두 요구는 같은 피드백에서 동시에 나왔고 스키마 변경 포인트가 동일하다.

---

## 1. Architecture Overview

### 1.1 Touchpoints

| 레이어 | 파일 | 변경 유형 | 근거 |
|--------|------|----------|------|
| domain | [src/domain/entities/Memo.ts](../../../src/domain/entities/Memo.ts) | **수정** — `fontSize`, `image?` 필드 추가 | 엔티티 확장 |
| domain | `src/domain/valueObjects/MemoFontSize.ts` | **신규** — `MemoFontSize` 타입 + 상수 | valueObject 패턴 |
| domain | `src/domain/valueObjects/MemoImage.ts` | **신규** — `MemoImage` 인터페이스 + 제한 상수 | valueObject 패턴 |
| domain | [src/domain/rules/memoRules.ts](../../../src/domain/rules/memoRules.ts) | **수정** — 기본값 상수, 폰트 크기 CSS 매핑 추가 | 렌더링 규칙 확장 |
| domain | `src/domain/utils/imageResize.ts` | **신규** — 순수 리사이즈 함수 (Canvas 2D) | 도메인 유틸 |
| domain | [src/domain/rules/shareRules.ts](../../../src/domain/rules/shareRules.ts) | **수정** — 공유 포맷 v2 지원 (이미지 포함) | 공유 호환성 |
| usecases | [src/usecases/memo/ManageMemos.ts](../../../src/usecases/memo/ManageMemos.ts) | **수정** — `updateFontSize`, `attachImage`, `detachImage` | 유스케이스 메서드 추가 |
| adapters | [src/adapters/repositories/JsonMemoRepository.ts](../../../src/adapters/repositories/JsonMemoRepository.ts) | **수정** — 로드 시 기본값 주입 | 하위호환 마이그레이션 |
| adapters | [src/adapters/stores/useMemoStore.ts](../../../src/adapters/stores/useMemoStore.ts) | **수정** — 3개 액션 + 마이그레이션 확장 | 상태 관리 |
| adapters | [src/adapters/components/Memo/MemoCard.tsx](../../../src/adapters/components/Memo/MemoCard.tsx) | **수정** — 폰트 크기 적용, 썸네일 렌더 | 카드 뷰 |
| adapters | [src/adapters/components/Memo/MemoDetailPopup.tsx](../../../src/adapters/components/Memo/MemoDetailPopup.tsx) | **수정** — 폰트 크기 + 원본 이미지 뷰어 | 상세 뷰 |
| adapters | [src/adapters/components/Memo/MemoRichEditor.tsx](../../../src/adapters/components/Memo/MemoRichEditor.tsx) | **수정** — 이미지 붙여넣기 핸들러 + 폰트 크기 style | 편집기 |
| adapters | [src/adapters/components/Memo/MemoFormatToolbar.tsx](../../../src/adapters/components/Memo/MemoFormatToolbar.tsx) | **수정** — 크기 증감 + 이미지 추가 버튼 | 툴바 확장 |
| adapters | [src/adapters/components/Memo/MemoFormattedText.tsx](../../../src/adapters/components/Memo/MemoFormattedText.tsx) | **수정** — `fontSize` props 수용 | 렌더 컴포넌트 |
| adapters | `src/adapters/components/Memo/MemoImageAttachment.tsx` | **신규** — 썸네일 + 뷰어 + 제거 버튼 | UI 컴포넌트 분리 |
| adapters | `src/adapters/components/Memo/MemoImageViewer.tsx` | **신규** — 원본 크기 모달 뷰어 | UI 컴포넌트 분리 |

### 1.2 Dependency Rule 검증

```
MemoFormatToolbar (adapters)
  ↓ uses
useMemoStore.updateFontSize / attachImage (adapters)
  ↓ calls
ManageMemos (usecases)
  ↓ uses
Memo, MemoFontSize, MemoImage (domain/entities, valueObjects)
  + resizeImageToDataUrl (domain/utils)
  + parseInlineMarkdown (domain/rules)

JsonMemoRepository (adapters)
  ↓ implements
IMemoRepository (domain/repositories)
  ↓ uses
IStoragePort (domain/ports)
  ← ElectronStorageAdapter / IndexedDBStorageAdapter (infrastructure)
```

- ✅ usecases → domain만 import
- ✅ adapters → domain + usecases
- ✅ domain/utils는 브라우저 표준 API(Canvas 2D)만 사용 — 외부 패키지 의존 없음
- ✅ infrastructure는 DI 컨테이너를 통해서만 연결

---

## 2. Domain Layer

### 2.1 Value Object: `MemoFontSize`

**파일**: `src/domain/valueObjects/MemoFontSize.ts` (신규)

```ts
export type MemoFontSize = 'sm' | 'base' | 'lg' | 'xl';

export const MEMO_FONT_SIZES: readonly MemoFontSize[] = ['sm', 'base', 'lg', 'xl'] as const;

export const DEFAULT_MEMO_FONT_SIZE: MemoFontSize = 'base';

/** Tailwind 클래스 매핑 */
export const MEMO_FONT_SIZE_CLASS: Record<MemoFontSize, string> = {
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
};

/** 한국어 라벨 (UI 표시용) */
export const MEMO_FONT_SIZE_LABEL: Record<MemoFontSize, string> = {
  sm: '작게',
  base: '기본',
  lg: '크게',
  xl: '아주 크게',
};

export function clampFontSizeStep(current: MemoFontSize, delta: 1 | -1): MemoFontSize {
  const idx = MEMO_FONT_SIZES.indexOf(current);
  const nextIdx = Math.max(0, Math.min(MEMO_FONT_SIZES.length - 1, idx + delta));
  return MEMO_FONT_SIZES[nextIdx]!;
}
```

### 2.2 Value Object: `MemoImage`

**파일**: `src/domain/valueObjects/MemoImage.ts` (신규)

```ts
export interface MemoImage {
  readonly dataUrl: string;      // base64 dataURL (data:image/png;base64,...)
  readonly fileName: string;
  readonly mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  readonly width: number;        // px (리사이즈 후)
  readonly height: number;       // px
  readonly originalSize: number; // bytes (원본 크기, 참고용)
}

export const MEMO_IMAGE_LIMITS = {
  MAX_SIZE_BYTES: 5 * 1024 * 1024,  // 5MB (원본)
  MAX_DIMENSION: 800,                // 긴 변 최대 800px로 리사이즈
  THUMBNAIL_HEIGHT: 120,             // MemoCard에서 표시할 높이
  ALLOWED_MIME: ['image/png', 'image/jpeg', 'image/webp'] as const,
} as const;

export type AllowedMemoImageMime = typeof MEMO_IMAGE_LIMITS.ALLOWED_MIME[number];

export function isAllowedMemoImageMime(mime: string): mime is AllowedMemoImageMime {
  return (MEMO_IMAGE_LIMITS.ALLOWED_MIME as readonly string[]).includes(mime);
}
```

### 2.3 Entity: `Memo` 확장

**파일**: [src/domain/entities/Memo.ts](../../../src/domain/entities/Memo.ts) (수정)

```ts
import type { MemoColor } from '../valueObjects/MemoColor';
import type { MemoFontSize } from '../valueObjects/MemoFontSize';
import type { MemoImage } from '../valueObjects/MemoImage';

export interface Memo {
  readonly id: string;
  readonly content: string;
  readonly color: MemoColor;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archived: boolean;

  /** NEW: 글자 크기 (기본 'base') */
  readonly fontSize: MemoFontSize;

  /** NEW: 첨부 이미지 (선택) */
  readonly image?: MemoImage;
}

export interface MemosData {
  readonly memos: readonly Memo[];
}
```

### 2.4 Pure Util: `imageResize.ts`

**파일**: `src/domain/utils/imageResize.ts` (신규)

```ts
import { MEMO_IMAGE_LIMITS, type AllowedMemoImageMime } from '../valueObjects/MemoImage';

export interface ResizedImage {
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
  readonly mimeType: AllowedMemoImageMime;
}

export interface ResizeOptions {
  readonly maxDimension?: number;  // 기본 MEMO_IMAGE_LIMITS.MAX_DIMENSION
  readonly quality?: number;       // JPEG/WebP 품질 (0~1), 기본 0.85
}

/**
 * Blob을 리사이즈된 dataURL로 변환.
 * 긴 변이 maxDimension을 넘으면 비율을 유지하며 축소한다.
 * PNG는 PNG 유지, JPEG/WebP는 품질 적용.
 *
 * 순수 함수처럼 동작하지만 DOM API(Image, Canvas)에 의존 —
 * 브라우저 표준 API만 사용하므로 domain에 위치.
 */
export async function resizeImageBlob(
  blob: Blob,
  mimeType: AllowedMemoImageMime,
  options: ResizeOptions = {},
): Promise<ResizedImage> {
  const maxDim = options.maxDimension ?? MEMO_IMAGE_LIMITS.MAX_DIMENSION;
  const quality = options.quality ?? 0.85;

  const bitmap = await createImageBitmap(blob);
  const { width: ow, height: oh } = bitmap;

  let targetW = ow;
  let targetH = oh;
  if (Math.max(ow, oh) > maxDim) {
    if (ow >= oh) {
      targetW = maxDim;
      targetH = Math.round((oh / ow) * maxDim);
    } else {
      targetH = maxDim;
      targetW = Math.round((ow / oh) * maxDim);
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  bitmap.close?.();

  const dataUrl = mimeType === 'image/png'
    ? canvas.toDataURL('image/png')
    : canvas.toDataURL(mimeType, quality);

  return { dataUrl, width: targetW, height: targetH, mimeType };
}
```

### 2.5 Rules 확장: `memoRules.ts`

기존 [memoRules.ts](../../../src/domain/rules/memoRules.ts)는 변경 없음.
폰트 크기/이미지 관련 상수는 각 valueObject 파일에 배치 (순수 모듈 분리 원칙).

### 2.6 Share Rules 확장

**파일**: [src/domain/rules/shareRules.ts](../../../src/domain/rules/shareRules.ts) (수정)

- 공유 파일 `version` 필드를 `'1'` → `'2'` 업그레이드
- 로드 시 v1 파일은 `fontSize='base'`, `image=undefined`로 자동 마이그레이션
- 저장 시 항상 v2 포맷으로 내보내기
- 수신 측이 v1만 지원할 경우를 대비해 downgrade 함수 제공 (이미지 제거 + fontSize 제거)

---

## 3. Usecase Layer

**파일**: [src/usecases/memo/ManageMemos.ts](../../../src/usecases/memo/ManageMemos.ts) (수정)

```ts
// 추가 메서드 시그니처

async updateFontSize(id: string, fontSize: MemoFontSize): Promise<void>;
async attachImage(id: string, image: MemoImage): Promise<void>;
async detachImage(id: string): Promise<void>;
```

- 내부 구현은 기존 `update()`와 동일한 패턴: 전체 메모 리스트 재저장
- 검증: `fontSize`가 `MEMO_FONT_SIZES`에 속하는지 / 이미지 `dataUrl`이 빈 문자열이 아닌지

**주의**: 리사이즈는 usecase에서 수행하지 않는다 (DOM API 의존). adapters(Store)에서 `resizeImageBlob`을 호출해 완성된 `MemoImage`를 usecase에 전달.

---

## 4. Adapter Layer

### 4.1 Repository 마이그레이션

**파일**: [JsonMemoRepository.ts](../../../src/adapters/repositories/JsonMemoRepository.ts) (수정)

`getMemos()`를 오버라이드하지 않고, **상위 어댑터(`useMemoStore.load`)에서 통합 마이그레이션**을 수행한다 — 이미 해당 패턴이 확립되어 있음([useMemoStore.ts:40-48](../../../src/adapters/stores/useMemoStore.ts#L40-L48)).

### 4.2 Store 변경

**파일**: [useMemoStore.ts](../../../src/adapters/stores/useMemoStore.ts) (수정)

```ts
// 마이그레이션 확장 (line 40-48)
const migrated = memos.map((m) => ({
  ...m,
  x: m.x ?? 40 + Math.random() * 200,
  y: m.y ?? 40 + Math.random() * 200,
  width: m.width ?? MEMO_SIZE.DEFAULT_WIDTH,
  height: m.height ?? MEMO_SIZE.DEFAULT_HEIGHT,
  rotation: m.rotation ?? randomRotation(),
  archived: m.archived ?? false,
  fontSize: m.fontSize ?? DEFAULT_MEMO_FONT_SIZE,  // ← 추가
  // image 필드는 선택적이므로 undefined 그대로 허용
}));

// 신규 액션
updateFontSize: (id: string, fontSize: MemoFontSize) => Promise<void>;
attachImage: (id: string, rawBlob: Blob, fileName: string) => Promise<void>;
detachImage: (id: string) => Promise<void>;
```

**attachImage 흐름** (adapter 내부 리사이즈 후 usecase 호출):

```
Blob → validate size/mime → resizeImageBlob() → MemoImage 생성 → manageMemos.attachImage()
       ↓ fail                                                        ↓ fail
     toast('크기 초과')                                           toast('저장 실패')
```

**addMemo 수정**: 새 메모 생성 시 `fontSize: DEFAULT_MEMO_FONT_SIZE` 설정.

### 4.3 Toolbar 확장

**파일**: [MemoFormatToolbar.tsx](../../../src/adapters/components/Memo/MemoFormatToolbar.tsx) (수정)

```
[B] [U] [S] | [A-] [A+] | [📷]
 ↑            ↑           ↑
기존 포맷   폰트 크기    이미지 첨부
           증감 버튼     (파일 선택 다이얼로그)
```

- `[A-]` `[A+]`: `clampFontSizeStep(memo.fontSize, -1 | 1)` 호출 → `onFontSizeChange`
- 현재 크기 라벨은 툴팁으로 표시 (예: "글자 크기: 크게")
- `[📷]` 클릭 → 숨겨진 `<input type="file" accept="image/png,image/jpeg,image/webp">` 트리거
- Props 확장:
  ```ts
  interface MemoFormatToolbarProps {
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    content: string;
    onContentChange: (newContent: string) => void;
    fontSize: MemoFontSize;
    onFontSizeChange: (fs: MemoFontSize) => void;
    hasImage: boolean;
    onAttachImage: (blob: Blob, fileName: string) => void;
    onDetachImage: () => void;
  }
  ```

### 4.4 MemoRichEditor 확장 (붙여넣기 + 크기 적용)

**파일**: [MemoRichEditor.tsx](../../../src/adapters/components/Memo/MemoRichEditor.tsx) (수정)

기존 `handlePaste`를 확장:

```ts
const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
  // 1. 이미지 붙여넣기 먼저 체크
  const items = e.clipboardData.items;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item?.type.startsWith('image/')) {
      e.preventDefault();
      const blob = item.getAsFile();
      if (blob && isAllowedMemoImageMime(blob.type)) {
        onImagePaste(blob, `clipboard-${Date.now()}.${blob.type.split('/')[1]}`);
        return;
      }
    }
  }

  // 2. 일반 텍스트 붙여넣기 (기존 로직)
  e.preventDefault();
  const text = e.clipboardData.getData('text/plain');
  document.execCommand('insertText', false, text);
}, [onImagePaste]);
```

편집 영역 className에 `MEMO_FONT_SIZE_CLASS[fontSize]` 추가.

### 4.5 MemoCard 확장

**파일**: [MemoCard.tsx](../../../src/adapters/components/Memo/MemoCard.tsx) (수정)

카드 레이아웃:

```
┌─────────────────────────┐
│ [📌] [노랑] [📄]      X │ ← 헤더 (기존)
├─────────────────────────┤
│ [이미지 썸네일 120px]    │ ← NEW: 이미지 있을 때만
│                         │
├─────────────────────────┤
│ 메모 내용 텍스트         │ ← fontSize 적용
│ (text-sm/base/lg/xl)   │
└─────────────────────────┘
      [ 리사이즈 핸들 ↘ ]
```

- 이미지는 `MemoImageAttachment` 컴포넌트로 분리 렌더
- 클릭 시 `MemoImageViewer` 모달 열림
- 텍스트 영역에 `className={MEMO_FONT_SIZE_CLASS[memo.fontSize]}`

**드래그 충돌 해결**: 이미지 영역에서 `onMouseDown`을 `stopPropagation`하지 않음 → 이미지 드래그도 카드 이동과 동일 동작. 이미지 클릭은 별도 `onClick`으로 뷰어 오픈 (단, 드래그 거리 8px 이하일 때만).

### 4.6 신규 컴포넌트

**MemoImageAttachment.tsx** (신규)

```tsx
interface Props {
  image: MemoImage;
  onOpenViewer: () => void;
  onRemove: () => void;
  canRemove: boolean;  // 편집 모드에서만 true
}

// 120px 고정 높이, object-fit:cover, 우상단 X 버튼 (canRemove일 때)
```

**MemoImageViewer.tsx** (신규)

```tsx
interface Props {
  image: MemoImage;
  onClose: () => void;
}

// 전체 화면 모달, 배경 dim + ESC/클릭 외부 닫기
// max-height: 80vh, object-fit:contain
```

### 4.7 MemoDetailPopup 확장

**파일**: [MemoDetailPopup.tsx](../../../src/adapters/components/Memo/MemoDetailPopup.tsx) (수정)

- 상단: 이미지 있으면 원본 크기로 렌더 (max-height 40vh)
- 하단: 텍스트 영역에 `fontSize` 적용
- 툴바 표시 (편집 모드에서 모든 조작 가능)

---

## 5. Migration Strategy

### 5.1 데이터 마이그레이션

```
┌─ 저장된 memos.json (v1.10.x) ─────────────┐
│ { memos: [{ id, content, color, ... }] }  │
└───────────────────────────────────────────┘
                  │
                  ↓ useMemoStore.load() 시 자동 마이그레이션
                  │
┌─ 메모리상 Memo (v1.11.0) ────────────────┐
│ { ..., fontSize: 'base', image: undefined }│
└──────────────────────────────────────────┘
                  │
                  ↓ 다음 update 호출 시 디스크에 재저장
                  │
┌─ 저장된 memos.json (v1.11.0 포맷) ────────┐
│ { memos: [{ ..., fontSize: 'base' }] }    │
└───────────────────────────────────────────┘
```

**핵심**: 읽기 시 폴백 주입, 쓰기 시 새 포맷 저장 — 점진적 업그레이드.

### 5.2 롤백 안전성

- 사용자가 v1.11.0에서 메모 작성 후 v1.10.x로 다운그레이드할 경우:
  - `fontSize`/`image` 필드는 **무시됨** (기존 코드는 존재하지 않는 필드를 읽지 않음)
  - 데이터 손실 없음
- 재업그레이드 시 필드 복원

### 5.3 공유 파일 호환

- `.ssampin` v2 내보내기: 이미지 포함
- v2 파일을 v1.10.x가 열면 알 수 없는 필드 무시 (현재 `shareRules`가 이미 관대한 파싱)
- 향후 downgrade 내보내기 옵션은 Out of Scope

---

## 6. UX 상세

### 6.1 이미지 크기 제한 UX

| 상황 | UX |
|------|----|
| 5MB 초과 | 토스트: "이미지는 5MB 이하만 첨부할 수 있습니다" |
| 허용 외 포맷 | 토스트: "PNG, JPEG, WebP만 지원합니다" |
| 리사이즈 중 | 툴바 이미지 버튼 spinner, 카드 하단 스켈레톤 120px 높이 |
| 리사이즈 실패 | 토스트: "이미지 처리에 실패했어요. 다른 이미지로 시도해주세요" |

### 6.2 드래그앤드롭 활성화

- 편집 모드 진입 시(`setEditing(true)`)에만 카드 위에 drop zone 하이라이트
- `dragover` 시 border 강조, `drop` 이벤트에서 `DataTransfer.files` 처리
- 편집 모드가 아닐 때는 카드 드래그 이동 그대로 유지

### 6.3 폰트 크기 증감 UI

- `A-` `A+` 2버튼 (Material Symbols: `text_decrease`, `text_increase`)
- 현재 크기 인디케이터: 버튼 사이에 작은 라벨("기본") 또는 title 툴팁
- 최소/최대 도달 시 버튼 `disabled:opacity-40`

---

## 7. Test & Verification

### 7.1 수동 검증 시나리오

| # | 시나리오 | 기대 결과 |
|---|---------|----------|
| 1 | 기존 메모 데이터(`fontSize` 없음) 로드 | 모두 `base` 크기로 렌더 |
| 2 | `A+` 버튼 3회 클릭 | `base → lg → xl` (xl에서 멈춤) |
| 3 | `A-` 버튼 2회 클릭 | `base → sm` (sm에서 멈춤) |
| 4 | 3MB PNG 파일 드래그드롭 | 800px로 리사이즈되어 카드에 썸네일 |
| 5 | 10MB JPEG 파일 첨부 시도 | 에러 토스트, 첨부 안 됨 |
| 6 | 스크린샷 `Ctrl+V` | 편집 중인 메모에 이미지 첨부 |
| 7 | GIF 파일 첨부 시도 | 거부 토스트 |
| 8 | 이미지 썸네일 클릭 | 원본 크기 뷰어 모달 열림 |
| 9 | 뷰어에서 ESC | 닫힘 |
| 10 | 이미지 첨부된 메모 드래그 이동 | 정상 이동 (썸네일 클릭 아님) |
| 11 | `.ssampin` v1 파일 가져오기 | 에러 없이 로드, `fontSize=base`, `image=undefined` |
| 12 | 이미지 포함 메모를 v2로 내보내기 → 다시 가져오기 | 이미지 복원 |
| 13 | Electron 모드 + 브라우저 dev 모드 교차 확인 | 동일 동작 |

### 7.2 빌드 검증

- `npx tsc --noEmit` → 0 errors
- `npm run build` → dist 생성 성공
- 기존 메모 기능 회귀 테스트 (드래그/리사이즈/색상/회전/아카이브 모두 정상)

### 7.3 성능 목표

- 800px 리사이즈 < 500ms (5MB 원본 기준, 최신 노트북)
- 이미지 15개 메모 혼재 시 `memos.json` < 10MB
- 카드 렌더 프레임 < 16ms (60fps 유지)

---

## 8. Implementation Order

Phase 별로 커밋 단위 분리를 권장:

1. **Phase 1 — Value Objects & Entity** (리스크: 낮음)
   - `MemoFontSize.ts` / `MemoImage.ts` / `imageResize.ts` 생성
   - `Memo.ts` 엔티티 필드 추가
   - 컴파일 확인 (`tsc --noEmit`)

2. **Phase 2 — Usecase & Store** (리스크: 중간)
   - `ManageMemos` 메서드 3종 추가
   - `useMemoStore` 마이그레이션 + 액션 3종 추가
   - 기존 메모 로드 회귀 테스트

3. **Phase 3 — 글자 크기 UI** (리스크: 낮음)
   - `MemoFormatToolbar` 증감 버튼
   - `MemoCard`/`MemoDetailPopup`/`MemoRichEditor`에 `fontSize` props 연결
   - 수동 시나리오 1–3 검증

4. **Phase 4 — 이미지 첨부 UI** (리스크: 중간)
   - `MemoImageAttachment` / `MemoImageViewer` 신규 컴포넌트
   - 파일 선택/드롭/붙여넣기 3경로 구현
   - 수동 시나리오 4–10 검증

5. **Phase 5 — 공유 파일 & 마이그레이션** (리스크: 높음)
   - `shareRules.ts` v2 포맷
   - 시나리오 11–13 검증

6. **Phase 6 — 마감** (리스크: 낮음)
   - 접근성 라벨
   - 디자인 토큰 재확인 (`design examples/`)
   - 릴리즈 노트 초안

---

## 9. Release Checklist (Plan 문서의 8단계에 추가)

본 피처 릴리즈 시 기존 Release Workflow 8단계 외 추가 확인:

- [ ] `.ssampin` 포맷 버전 표시가 "파일 > 공유 가져오기" 다이얼로그에 노출되는지 확인
- [ ] 이미지 포함 대용량 `memos.json` 로드 시 initial paint 지연 확인 (허용 기준 < 500ms)
- [ ] 챗봇 Q&A 지식 베이스 갱신 ("메모에 이미지 첨부하는 방법", "메모 글자 크기 바꾸는 법")
- [ ] 노션 사용자 가이드 업데이트 (포스트잇 메모 섹션)

---

## 10. Open Questions

| # | 질문 | 결정 필요 시점 |
|---|------|---------------|
| 1 | 이미지 있는 메모를 v1으로 내보내기 할 때 이미지 제거 confirm 필요한가? | Phase 5 이전 |
| 2 | 썸네일 영역 클릭 vs 길게 누르기(드래그 시작)를 어떻게 구분? | Phase 4 |
| 3 | `A+`/`A-` 버튼 대신 드롭다운으로 선택 UX가 더 나은지 디자인 리뷰 | Phase 3 이전 |
| 4 | 리사이즈 기본값 800px가 빔프로젝터 투사에 충분한지 사용자 확인 | Phase 6 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-17 | memo-font-size + memo-image-attachment 통합 Design 초안 | pblsketch |
