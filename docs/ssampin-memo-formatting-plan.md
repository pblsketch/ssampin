# 메모 서식 강화 기능 계획서

> **작성일**: 2026-07-09
> **대상 버전**: v0.4.x
> **피드백 출처**: 사용자 피드백 (서식 기능 요청)

---

## 1. 개요

### 1.1 문제 정의

현재 메모 기능은 **순수 텍스트(plain text)** 만 지원한다.
포스트잇 메모 카드(`MemoCard.tsx`)와 상세 팝업(`MemoDetailPopup.tsx`) 모두 `<textarea>`로 입력하고, `<div>`로 표시할 때도 서식 없이 `whitespace-pre-wrap`으로만 렌더링한다.

교사가 중요한 메모 내용을 **굵게**, **밑줄**, **취소선** 등으로 강조할 수 없어 가독성이 떨어진다.

### 1.2 현재 상태

| 항목 | 상태 |
|------|------|
| `Memo` 엔티티 | `{ id, content(string), color, x, y, rotation, createdAt, updatedAt }` |
| `MemoCard.tsx` (270줄) | 일반 텍스트 `<textarea>` + `<div>` 표시 |
| `MemoDetailPopup.tsx` (250줄) | 팝업 확대 보기, 역시 일반 텍스트 |
| `ManageMemos.ts` | CRUD usecase, content를 string으로 처리 |
| 저장 형식 | `memos.json` → `content: string` |

### 1.3 핵심 원칙

1. **마크다운 기반 저장** — content 필드는 여전히 string이지만, 인라인 마크다운 문법 포함
2. **하위 호환성** — 기존 일반 텍스트 메모는 그대로 표시 (마크다운 없으면 plain text)
3. **가벼운 구현** — 블록 레벨(헤더, 리스트 등) 불필요, 인라인 서식만
4. **편집/보기 모드 분리** — 편집 시 마크다운 원문, 보기 시 렌더링

---

## 2. 기능 상세

### 2.1 지원 서식

| 서식 | 마크다운 문법 | 렌더링 결과 |
|------|-------------|------------|
| **굵게** | `**텍스트**` | `<strong>텍스트</strong>` |
| __밑줄__ | `__텍스트__` | `<u>텍스트</u>` |
| ~~취소선~~ | `~~텍스트~~` | `<s>텍스트</s>` |

> **참고**: 표준 마크다운에서 `__text__`는 bold이지만, 쌤핀에서는 밑줄로 사용한다. (교사 UX 친화적)

### 2.2 렌더링 전략

#### 인라인 마크다운 파서 (`parseInlineMarkdown`)

경량 파서를 직접 구현한다. 외부 라이브러리(marked, remark 등)는 번들 크기 + 블록 레벨 지원 불필요로 사용하지 않는다.

```typescript
// domain/rules/memoRules.ts

interface FormattedSegment {
  readonly text: string;
  readonly bold: boolean;
  readonly underline: boolean;
  readonly strikethrough: boolean;
}

function parseInlineMarkdown(content: string): FormattedSegment[];
```

#### 파싱 규칙
1. `**...**` → bold
2. `__...__` → underline  
3. `~~...~~` → strikethrough
4. 중첩 지원: `**~~굵은 취소~~**` → bold + strikethrough
5. 이스케이프: `\*\*` → 리터럴 `**`
6. 불완전한 마크다운: `**미닫힌` → 그대로 표시 (리터럴)

### 2.3 UI 컴포넌트

#### MemoFormattedText (신규 공통 컴포넌트)

```typescript
interface MemoFormattedTextProps {
  content: string;
  className?: string;
}
```

- `parseInlineMarkdown()`로 세그먼트 배열 생성
- 각 세그먼트를 적절한 HTML 태그로 렌더링
- 줄바꿈(`\n`) 처리 유지

#### 서식 툴바 (MemoFormatToolbar)

편집 모드에서 textarea 위에 나타나는 미니 툴바:

```
[B] [U] [S]    ← 굵게 / 밑줄 / 취소선
```

- 텍스트 선택 후 버튼 클릭 → 선택 영역에 마크다운 래핑
- 선택 없이 클릭 → 커서 위치에 빈 마크다운 삽입 (`****` → 커서를 가운데로)
- 이미 적용된 서식 → 토글 해제 (마크다운 마커 제거)

### 2.4 데이터 모델 변경

**Memo 엔티티 변경 없음.**

content 필드는 그대로 string이며, 마크다운 문법이 포함된 텍스트로 저장된다.

```json
{
  "id": "abc-123",
  "content": "**중요** 내일 시험\n~~연기됨~~ → __확정__",
  "color": "yellow",
  "x": 100,
  "y": 200,
  "rotation": -1.5,
  "createdAt": "2026-07-09T00:00:00.000Z",
  "updatedAt": "2026-07-09T00:00:00.000Z"
}
```

기존 일반 텍스트 메모: 마크다운 마커가 없으므로 파서가 전체를 plain text 세그먼트 하나로 반환 → **하위 호환 완벽**.

---

## 3. 구현 단계

### Phase 1: 파서 + 렌더링 컴포넌트 (domain + adapters)

1. `domain/rules/memoRules.ts` — `parseInlineMarkdown()` 순수 함수 구현
2. `adapters/components/Memo/MemoFormattedText.tsx` — 렌더링 컴포넌트

### Phase 2: 카드 + 팝업에 렌더링 적용

1. `MemoCard.tsx` — 보기 모드에서 `MemoFormattedText` 사용
2. `MemoDetailPopup.tsx` — 보기 모드에서 `MemoFormattedText` 사용

### Phase 3: 서식 툴바

1. `adapters/components/Memo/MemoFormatToolbar.tsx` — 서식 버튼 3개
2. `MemoCard.tsx` — 편집 모드에서 툴바 표시
3. `MemoDetailPopup.tsx` — 편집 모드에서 툴바 표시

---

## 4. 파일 변경 목록

### 신규 파일 (3개)

| 파일 | 레이어 | 설명 |
|------|--------|------|
| `src/domain/rules/memoRules.ts` | domain | 인라인 마크다운 파서 순수 함수 |
| `src/adapters/components/Memo/MemoFormattedText.tsx` | adapters | 서식 렌더링 컴포넌트 |
| `src/adapters/components/Memo/MemoFormatToolbar.tsx` | adapters | 서식 툴바 (B/U/S 버튼) |

### 수정 파일 (2개)

| 파일 | 변경 내용 |
|------|-----------|
| `src/adapters/components/Memo/MemoCard.tsx` | 보기 모드에 `MemoFormattedText` 적용, 편집 모드에 `MemoFormatToolbar` 추가 |
| `src/adapters/components/Memo/MemoDetailPopup.tsx` | 보기 모드에 `MemoFormattedText` 적용, 편집 모드에 `MemoFormatToolbar` 추가 |

---

## 5. 테스트 시나리오

| # | 시나리오 | 예상 결과 |
|---|---------|-----------|
| 1 | 기존 일반 텍스트 메모 열기 | 서식 없이 기존과 동일하게 표시 |
| 2 | `**굵게**` 입력 후 보기 모드 | **굵게** 렌더링 |
| 3 | `__밑줄__` 입력 후 보기 모드 | 밑줄 렌더링 |
| 4 | `~~취소선~~` 입력 후 보기 모드 | 취소선 렌더링 |
| 5 | `**~~중첩~~**` 입력 | 굵은 취소선 렌더링 |
| 6 | 불완전 마크다운 `**미닫힘` | 리터럴 텍스트로 표시 |
| 7 | 서식 툴바로 텍스트 선택 후 B 클릭 | `**선택텍스트**`로 래핑 |
| 8 | 이미 굵은 텍스트 선택 후 B 클릭 | `**` 마커 제거 (토글) |
| 9 | 카드 위에서 서식 렌더링 | MemoCard에서 정상 표시 |
| 10 | 팝업에서 서식 렌더링 | MemoDetailPopup에서 정상 표시 |
| 11 | 줄바꿈 포함 서식 | 줄바꿈 유지 + 서식 적용 |
| 12 | 빈 메모에서 서식 버튼 클릭 | 빈 마크다운 삽입 + 커서 위치 조정 |

---

## 6. 리스크 및 대안

| 리스크 | 대안 |
|--------|------|
| 정규식 파서 성능 | 메모 content 길이 제한 (보통 300자 미만) → 성능 문제 없음 |
| 마크다운 이스케이프 복잡성 | 최소한의 이스케이프만 (`\*`, `\_`, `\~`) |
| 사용자가 마크다운 문법 모를 수 있음 | 서식 툴바 제공으로 해결, 마크다운 직접 입력 불필요 |
| 복사/붙여넣기 시 마크다운 마커 노출 | 편집 모드에서는 마크다운 원문 보이는 게 의도된 동작 |

---

## 부록: 디자인 참고

### 서식 툴바 스타일

```
┌────────────────────────────────────┐
│  [B] [U] [S]                       │  ← 포스트잇 색상 위에 반투명
├────────────────────────────────────┤
│                                    │
│  textarea (편집 중)                │
│                                    │
└────────────────────────────────────┘
```

- 버튼 스타일: `text-slate-500 hover:text-slate-700`, 활성 시 `text-blue-600 bg-blue-100/50`
- 버튼 크기: `w-7 h-7 rounded`
- 폰트 아이콘: Material Symbols (`format_bold`, `format_underlined`, `format_strikethrough`)
- 툴바 위치: textarea 바로 위, 포스트잇 배경색 위에 렌더
