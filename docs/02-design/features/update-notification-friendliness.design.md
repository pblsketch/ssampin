# 업데이트 안내 친화도 개선 (Update Notification Friendliness Overhaul) Design Document

> **Plan**: [`update-notification-friendliness.plan.md`](../../01-plan/features/update-notification-friendliness.plan.md) v0.2
> **Project**: SsamPin
> **Version**: v2.0.4 (예정)
> **Date**: 2026-05-07
> **Status**: Layer 1 Draft v0.1 — 사용자 승인 대기 중. Layer 2·3 후속.

---

## 0. 문서 구조

본 Design 문서는 Plan §3의 3 Layer를 차례로 상세 설계한다. **사용자 승인 진행 방식 = B (Layer 1 먼저 → 승인 → Layer 2·3 병렬)**.

- §1 Layer 1 Design — **현재 작성 완료, 승인 대기**
- §2 Layer 2 Design — Layer 1 승인 후 작성
- §3 Layer 3 Design — Layer 1 승인 후 Layer 2와 병렬 작성

---

## 1. Layer 1 Design — 카피 프레임워크

### 1.1 핵심 산출물

**[`docs/release-notes-assets/RELEASE-NOTES-WRITING-STYLE.md`](../../release-notes-assets/RELEASE-NOTES-WRITING-STYLE.md)** — v2.0.4부터 락되는 작성 가이드. 본 Design의 §1 결과물 그 자체.

### 1.2 4슬롯 description 스키마 (contract)

본 결정은 Layer 2 (UI 렌더)와 Layer 3 (자동 변환기) 모두에 영향. 변경 시 두 Layer 동시 영향.

#### JSON 스키마

기존 스키마 비파괴 유지. `description: string` 그대로, 내부 구조만 표준화.

```json
{
  "type": "new" | "fix" | "improve" | "change",
  "title": "...",
  "description": "...",          // 4슬롯 구조 텍스트 (newline 포함)
  "notionUrl": "..."             // (선택, Layer 3 D-11 도입)
}
```

#### description 텍스트 형식

```
{slot1: lead}\n
\n
· {slot2: bullet1}\n
· {slot2: bullet2}\n
· {slot2: bullet3}\n
\n
{slot3: how — [설정 > 경로] 포함, (환경 한정) 가능}\n
\n
{slot4: closer}
```

- **줄 구분**: 슬롯 사이 빈 줄 1개 (`\n\n`)
- **불릿 마커**: `· ` (U+00B7 + 공백)
- **종속 불릿**: `  ◦ ` (들여쓰기 2 + U+25E6 + 공백)
- **강조**: `**text**` (마크다운 호환, UI 정규식 처리)
- **인라인 링크 (선택)**: `[text](url)` (Layer 2 D-08에서 정규식 처리, P2 — 본 Layer 1에서는 plain text만 가정)

#### 슬롯 검증 규칙

UI·변환기가 의존하는 검증 규칙:

| 규칙 | 검증 방식 |
|------|---------|
| **R-1**: description은 줄바꿈 1개 이상 포함 (multi-slot) 또는 단일 줄 (slot 1만) | `description.split('\n\n').length >= 1` |
| **R-2**: 불릿 줄은 `· ` 또는 `  ◦ ` 로 시작 | regex `/^(  ◦ \|· )/` |
| **R-3**: 슬롯 1 (리드)은 `[설정 ` 으로 시작하지 않음 (How로 시작 금지) | regex `/^\[설정/` 첫 줄 거부 |
| **R-4**: highlights 첫머리 외 description 본문에 이모지 없음 | 유니코드 이모지 카테고리 검사 (`fix` type만 ⚠️ 1개 허용) |
| **R-5**: em-dash `—` 사용 (hyphen·en-dash 금지) | regex `/(?<![-\d])-(?![-\d])\|–/` 검출 시 경고 |

**검증 도구**: 본 가이드 §9 발행 전 체크리스트를 자동화하는 lint 스크립트 (선택, P3 후순위).

### 1.3 Layer 2/3에 대한 contract

#### Layer 2 (UI 렌더)가 따라야 할 contract

**파싱 규칙 (UI 컴포넌트가 description 문자열을 받아 React 트리로 변환할 때)**

```typescript
function parseDescription(description: string): DescriptionNode[] {
  // 1. 빈 줄(\n\n)로 슬롯 분할
  const slots = description.split('\n\n').map(s => s.trim()).filter(Boolean);

  // 2. 각 슬롯 안에서 줄 단위 분석
  return slots.map(slot => {
    const lines = slot.split('\n');
    const isBulletGroup = lines.every(l => /^(  ◦ |· )/.test(l));

    if (isBulletGroup) {
      return {
        type: 'bulletList',
        items: lines.map(l => ({
          level: l.startsWith('  ◦ ') ? 2 : 1,
          text: l.replace(/^(  ◦ |· )/, ''),
        })),
      };
    }

    // 3. 일반 텍스트 — **bold** 정규식 변환
    return {
      type: 'paragraph',
      content: parseInlineMarks(lines.join(' ')),
    };
  });
}

function parseInlineMarks(text: string): InlineNode[] {
  // **bold** → <strong>, [text](url) → <a> (선택, P2)
  // ...
}
```

**렌더 결과**

- `paragraph` → `<p class="text-body text-sp-text mb-3">{...}</p>`
- `bulletList` (level=1) → `<ul class="list-none space-y-1 mb-3"><li class="flex gap-2"><span>·</span><span>{...}</span></li></ul>`
- `bulletList` (level=2) → 들여쓰기 + `<span>◦</span>`

**의도된 비기능**: description 안에 `<table>`·이미지·코드 블록 없음. plain markdown 일부만.

#### Layer 3 (자동 변환기)가 따라야 할 contract

**Threads 변환 매핑** (`release-notes-to-threads.mjs`):

```
release-notes.json change[i]
  ↓
Thread {i+1}:
  - 헤더: "{i+1}. {title} — {slot1.substring(0, 30)}..."
  - 본문: slot1 + "\n\n" + slot2(불릿 그대로) + "\n\n" + slot4
  - slot3 (How)은 thread 본문 마지막에 별도 처리: "[설정 > {경로}] 토글로 켜세요. ({환경})"
```

**카드 프롬프트 변환 매핑** (`release-notes-to-card-prompts.mjs`):

```
highlights[i]  → cards/0{i+2}-{slug}.md (콘텐츠 카드)
  - tag: change[i].type → 신규/수정/개선/변경 라벨
  - headline: highlights[i] (이모지 제거 후)
  - sub-copy: change[i].slot1 첫 1문장
  - bullets: change[i].slot2 (3~5개)
  - body text: change[i].slot4
```

(콘텐츠 카드 6장 + 인트로 1장 + 아웃트로 1장 = 카드 8장 표준)

**불일치 허용 범위**: 자동 변환기는 80% 일치 목표. 나머지 20%(이모지 위치, 타래 간 연결 어구, 카드뉴스 시각 디테일)는 수동 후편집.

### 1.4 마이그레이션·역호환

#### 신규 vs 기존 description 처리

| 구분 | 처리 |
|------|------|
| v2.0.4 이후 신규 항목 | 4슬롯 구조 필수 |
| v2.0.3 이전 항목 | 기존 단일 문단 그대로 유지 (소급 정비 안 함, Plan §2.2) |
| UI 렌더 | description에 빈 줄 없으면 단일 paragraph로 폴백 |

폴백 로직 (Layer 2 구현 시):

```typescript
function parseDescription(description: string): DescriptionNode[] {
  if (!description.includes('\n\n')) {
    // 구버전: 단일 문단으로 렌더
    return [{ type: 'paragraph', content: parseInlineMarks(description) }];
  }
  // 신버전: 4슬롯 파싱 (위 §1.3)
  // ...
}
```

이 폴백으로 v2.0.0~2.0.3 release-notes.json 기존 데이터는 변경 없이 그대로 동작. 모달도 깨지지 않음.

### 1.5 highlights 배열 contract

**핵심 fix**: `VersionNote.highlights: string` → `string[]` (Layer 2 D-04).

JSON 데이터는 v2.0.0부터 이미 `string[]`이지만 TypeScript 타입은 `string`. 실제 모달은 `releaseNotes[0]?.highlights`로 단일 문자열처럼 접근해 첫 원소만 렌더. 6개 중 5개 손실.

#### 타입 정의 (수정 후)

```typescript
interface VersionNote {
  version: string;
  date: string;
  highlights: string[];  // ← string에서 변경
  changes: ChangeItem[];
}
```

#### 렌더 contract

- 배열 모든 원소를 `· ` 불릿 형태로 노출
- 각 highlight는 자체 이모지를 첫머리에 포함 (가이드 §4)
- 모달에서는 6개 모두 노출, 변경 내역(changes)은 접힘 기본
- AppInfoSection에서도 동일 — 현재 버전은 highlights 우선 노출 후 changes 접힘 기본

### 1.6 작성 워크플로우 (사용자가 다음 release 작성 시)

```
1. 코드 동결 (release 전 마지막 머지)
2. 변경 항목 정리 (git log 분석 + 사용자 노출 표면 식별)
3. 각 항목에 대해 type 분류 (new / fix / improve / change)
4. RELEASE-NOTES-WRITING-STYLE.md 4슬롯 템플릿에 맞춰 description 작성
   - new·메이저 improve: 4슬롯 모두
   - 단순 fix·improve: 슬롯 1 + 3
5. highlights[] 작성 (각 40~60자, 이모지 1개)
6. release-notes.json에 신규 버전 항목 추가
7. (Layer 3 도입 후) 변환기 dry-run → Threads·카드 자동 생성 → 검수
8. 발행 전 체크리스트 (가이드 §9) 통과
9. 빌드·릴리즈 (5단계 분리 명령, MEMORY.md Step 6)
```

### 1.7 정착 여부 측정

본 가이드 정착의 측정 지표 (사후, 마케팅 에이전트가 제시한 것):

| 지표 | 측정 방법 | 목표 |
|------|---------|------|
| 4슬롯 준수율 | release-notes.json description 자동 검증 (§1.2 R-1 ~ R-5) | v2.0.4 이후 신규 항목 100% |
| 작성 시간 (체감) | 작성 시작 ~ release 직전 시간 | 30~50% 단축 (자동 변환기 효과 합산) |
| Threads 변환 일치율 | v2.0.4 dry-run 결과 vs 수동 후편집 결과 | ≥ 80% |
| 사용자 피드백 | "친절해졌다"는 정성 피드백 수집 | v2.0.4 출시 후 1주 내 1건 이상 |

---

## 2. Layer 2 Design — UI 렌더링

> **Status**: Draft v0.1 (2026-05-07, `bkit:frontend-architect` 위임). `UpdateNotification.tsx`(346줄), `AppInfoSection.tsx`(597줄) 두 컴포넌트의 구체 변경 사양. Layer 1 §1.3 contract를 따르며, 공용 `Modal.tsx` 마이그레이션·a11y 보강·sp-* 토큰 정합화 포함.

### §2.1 컴포넌트 변경 diff 개요

#### UpdateNotification.tsx — 현재 vs 새 버전 (status=available 기준)

```
┌──────────────────────────────────────────────────────────┐
│  현재 (v2.0.3)                                           │
├──────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────┐    │
│  │  🎉  쌤핀 v2.0.4 업데이트            [✕]        │    │
│  │       2026-05-XX                                  │    │
│  │  ─────────────────────────────────────────────── │    │
│  │  {highlights: string}                             │    │
│  │  → 첫 번째 highlights 원소만 단일 <p>로 렌더     │    │
│  │  ─────────────────────────────────────────────── │    │
│  │  이런 점이 바뀌었어요!                            │    │
│  │  [새기능] titleA                                  │    │
│  │  [버그수정] titleB                                │    │
│  │  [개선] titleC  (changes 항상 전부 노출)          │    │
│  │  ─────────────────────────────────────────────── │    │
│  │              [나중에]  [🚀 지금 업데이트]         │    │
│  └──────────────────────────────────────────────────┘    │
│  · z-50 하드코딩, 공용 Modal.tsx 미사용                   │
│  · ESC 닫기 없음, focus-trap 없음                         │
│  · chevron 없음 (changes 항상 펼침)                       │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  새 버전 (v2.0.4 목표)                                   │
├──────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────┐    │
│  │  쌤핀이 v2.0.4로 업데이트됐어요       [✕]        │    │  ← 헤더 카피 변경
│  │  2026-05-XX                                       │    │
│  │  이번 업데이트의 한 줄 컨셉 카피...               │    │  ← 서브헤더(신규)
│  │  ─────────────────────────────────────────────── │    │
│  │  · 🖥️ highlights[0] 원소                         │    │  ← 배열 모두 노출
│  │  · 🔧 highlights[1] 원소                         │    │
│  │  · ⚡ highlights[2] 원소                         │    │
│  │  · ... (최대 6개)                                 │    │
│  │  ─────────────────────────────────────────────── │    │
│  │  [N개 변경 내역 자세히 보기 ▼]  (기본 접힘)       │    │  ← 토글(신규)
│  │  ─────────────────────────────────────────────── │    │
│  │  [닫기]  [노션 가이드 ↗]  [피드백 ↗]             │    │  ← CTA 3개
│  └──────────────────────────────────────────────────┘    │
│  · z-sp-modal 토큰, 공용 Modal.tsx 래핑                   │
│  · ESC 닫기 O, focus-trap O (Modal.tsx 자동 획득)         │
│  · chevron transition className 방식                      │
└──────────────────────────────────────────────────────────┘
```

#### AppInfoSection.tsx — 릴리즈 노트 섹션 현재 vs 새 버전

```
┌──────────────────────────────────────────────────────────┐
│  현재 (v2.0.3) — 업데이트 내역 섹션                     │
├──────────────────────────────────────────────────────────┤
│  [ 업데이트 내역 ▼ ]   (기본 접힘)                       │
│    ▼ v2.0.4   현재   2026-05-XX                          │
│      {highlights: string} → 단일 <p>                     │  ← 버그: 첫 원소만
│      [새기능] titleA                                      │
│      [버그수정] titleB                                    │
│                                                           │
│    > v2.0.3         2026-05-07     (기본 접힘)           │
│    > v2.0.2         2026-05-03     (기본 접힘)           │
│    > v2.0.1         ...            (기본 접힘)           │
│    [ 이전 버전 N개 더 보기 ]                              │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│  새 버전 (v2.0.4 목표) — 업데이트 내역 섹션             │
├──────────────────────────────────────────────────────────┤
│  [ 업데이트 내역 ▼ ]                                     │
│    ▼ v2.0.4   현재   2026-05-XX   (기본 펼침 ← 변경)    │
│      이번 버전에서 달라진 점                              │  ← 강조 헤더
│      · 🖥️ highlights[0]                                  │  ← 배열 전부
│      · 🔧 highlights[1]                                  │
│      ─────────────────────────────────────────────────   │
│      [새기능] titleA                                      │
│      [버그수정] titleB     (parseDescription 렌더)        │
│                                                           │
│    > v2.0.3         2026-05-07     (기본 접힘)           │
│    > v2.0.2         2026-05-03     (기본 접힘)           │
│    [ 이전 버전 기록 보기 (N개) ]   ← 문구 명확화         │
└──────────────────────────────────────────────────────────┘
```

### §2.2 `parseDescription` 함수 구현 사양

#### 타입 정의

```typescript
// 인라인 노드 — 텍스트 또는 굵음
interface InlineText { kind: 'text'; value: string; }
interface InlineBold { kind: 'bold'; value: string; }
type InlineNode = InlineText | InlineBold;

// 불릿 아이템
interface BulletItem {
  level: 1 | 2;          // 1 = · , 2 = ◦ (종속 들여쓰기)
  nodes: InlineNode[];   // 인라인 마크 처리된 텍스트
}

// 슬롯 노드 — paragraph 또는 bulletList
interface ParagraphNode { type: 'paragraph'; content: InlineNode[]; }
interface BulletListNode { type: 'bulletList'; items: BulletItem[]; }

export type DescriptionNode = ParagraphNode | BulletListNode;
```

#### `parseInlineMarks` 구현

```typescript
/**
 * "텍스트 **bold** 텍스트" 형식을 InlineNode[] 배열로 변환.
 * 중첩 bold 비지원. 단일 패스 정규식.
 */
function parseInlineMarks(text: string): InlineNode[] {
  const result: InlineNode[] = [];
  const boldRe = /\*\*(.+?)\*\*/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = boldRe.exec(text)) !== null) {
    if (match.index > lastIdx) {
      result.push({ kind: 'text', value: text.slice(lastIdx, match.index) });
    }
    result.push({ kind: 'bold', value: match[1] });
    lastIdx = match.index + match[0].length;
  }

  if (lastIdx < text.length) {
    result.push({ kind: 'text', value: text.slice(lastIdx) });
  }

  if (result.length === 0) {
    result.push({ kind: 'text', value: text });
  }
  return result;
}
```

#### `parseDescription` 메인 구현

```typescript
const BULLET_L1_RE = /^· /;       // U+00B7 + 공백
const BULLET_L2_RE = /^  ◦ /;     // 2칸 들여쓰기 + U+25E6 + 공백

/**
 * 4슬롯 description 문자열 → DescriptionNode[] 변환.
 *
 * 폴백:
 *   - description에 빈 줄(\n\n)이 없으면 단일 paragraph로 렌더 (구버전 호환)
 *   - 슬롯 내 모든 줄이 불릿일 때만 bulletList, 아니면 paragraph (혼합 방지)
 */
export function parseDescription(description: string): DescriptionNode[] {
  if (!description || description.trim() === '') return [];

  // 구버전 단일 문단 폴백
  if (!description.includes('\n\n')) {
    return [{ type: 'paragraph', content: parseInlineMarks(description.trim()) }];
  }

  const slots = description.split('\n\n').map((s) => s.trim()).filter(Boolean);

  return slots.map((slot): DescriptionNode => {
    const lines = slot.split('\n');
    const allBullets = lines.every(
      (l) => BULLET_L1_RE.test(l) || BULLET_L2_RE.test(l),
    );

    if (allBullets) {
      return {
        type: 'bulletList',
        items: lines.map((l): BulletItem => {
          if (BULLET_L2_RE.test(l)) {
            return { level: 2, nodes: parseInlineMarks(l.replace(BULLET_L2_RE, '')) };
          }
          return { level: 1, nodes: parseInlineMarks(l.replace(BULLET_L1_RE, '')) };
        }),
      };
    }

    return { type: 'paragraph', content: parseInlineMarks(lines.join(' ')) };
  });
}
```

#### 단위 테스트 케이스 6개

```typescript
describe('parseDescription', () => {
  // TC-1: 4슬롯 정상 — paragraph·bulletList·paragraph·paragraph 순서
  it('TC-1: 4슬롯 정상 파싱', () => {
    const input = [
      '위젯이 진짜 바탕화면 작업판처럼 깔립니다.',
      '· 빈 공간 클릭·휠·드래그 모두 위젯으로\n· 가장자리 8방향 자유 리사이즈\n· Ctrl+1~4 레이아웃 즉석 전환',
      '[설정 > 위젯 > 바탕화면 아이콘 아래 모드] 토글로 켜세요.',
      '시간표를 늘 곁에 두고 수업하시는 분들께 어울려요.',
    ].join('\n\n');
    const result = parseDescription(input);
    expect(result).toHaveLength(4);
    expect(result[0].type).toBe('paragraph');
    expect(result[1].type).toBe('bulletList');
    expect((result[1] as { type: 'bulletList'; items: unknown[] }).items).toHaveLength(3);
  });

  // TC-2: 단일 문단 폴백 — \n\n 없음 (v2.0.3 이전 데이터)
  it('TC-2: 구버전 단일 문단 폴백', () => {
    const result = parseDescription('Windows 설정 → 위젯 → ... 작업판이 됩니다.');
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('paragraph');
  });

  // TC-3: 종속 불릿 level=2 (◦)
  it('TC-3: 종속 불릿 level=2 파싱', () => {
    const input = ['리드 텍스트.', '· 1단계 불릿\n  ◦ 종속 A\n  ◦ 종속 B'].join('\n\n');
    const result = parseDescription(input);
    if (result[1].type === 'bulletList') {
      expect(result[1].items[0].level).toBe(1);
      expect(result[1].items[1].level).toBe(2);
    }
  });

  // TC-4: 빈 description → 빈 배열
  it('TC-4: 빈 문자열 → 빈 배열', () => {
    expect(parseDescription('')).toEqual([]);
    expect(parseDescription('   ')).toEqual([]);
  });

  // TC-5: **bold** 인라인 마크 처리
  it('TC-5: bold 마크 InlineNode 변환', () => {
    const result = parseDescription('위젯이 **진짜 바탕화면 작업판**처럼 깔립니다.');
    if (result[0].type === 'paragraph') {
      const nodes = result[0].content;
      expect(nodes[1]).toEqual({ kind: 'bold', value: '진짜 바탕화면 작업판' });
    }
  });

  // TC-6: em-dash 보존
  it('TC-6: em-dash(—) 포함 텍스트 원형 보존', () => {
    const input = ['Drive 동기화 — 평소 자동 sync용.', '· 백업 센터와 보완적'].join('\n\n');
    const result = parseDescription(input);
    if (result[0].type === 'paragraph') {
      const fullText = result[0].content.map((n) => n.value).join('');
      expect(fullText).toContain('—');
    }
  });
});
```

### §2.3 UpdateNotification 컴포넌트 변경 사양

#### (a) 타입 정의 — highlights 배열 타입 정합화

```diff
 interface VersionNote {
   version: string;
   date: string;
-  highlights: string;
+  highlights: string[];
   changes: ChangeItem[];
 }
```

데이터(release-notes.json)는 v2.0.0부터 이미 `string[]`이었으므로 비파괴. 런타임 역호환 헬퍼는 §2.8 위험 완화 참조.

#### (b) 모달 헤더 + 서브헤더

```jsx
// 수정 후
<h2 className="text-sp-text text-base font-bold leading-tight">
  쌤핀이 v{info.version}로 업데이트됐어요
</h2>
{releaseNotes[0]?.date && (
  <p className="text-sp-muted text-xs mt-0.5">{releaseNotes[0].date}</p>
)}
{/* 서브헤더: highlights[0]를 컨셉 카피로 활용 */}
{releaseNotes[0]?.highlights?.[0] && (
  <p className="text-sp-text/70 text-sm mt-1 leading-relaxed">
    {releaseNotes[0].highlights[0]}
  </p>
)}
```

> 서브헤더는 `highlights[0]`을 재활용. highlights 섹션에서 중복될 수 있으나 시각 계층(더 크고 연한 색)으로 구분. 실제 구현 시 사용자 확인 필요.

#### (c) highlights 영역 — 배열 6개 풀 노출

```jsx
{(releaseNotes[0]?.highlights?.length ?? 0) > 0 && (
  <ul className="list-none space-y-1 mt-3" aria-label="주요 변경사항">
    {releaseNotes[0].highlights.map((h, i) => (
      <li key={i} className="flex items-start gap-2 text-sm text-sp-text/80">
        <span className="text-sp-accent mt-0.5 shrink-0" aria-hidden="true">·</span>
        <span className="leading-relaxed">{h}</span>
      </li>
    ))}
  </ul>
)}
```

#### (d) 변경 내역 접힘 토글

```jsx
const [changesOpen, setChangesOpen] = useState(false);
const totalChanges = releaseNotes.reduce((n, v) => n + v.changes.length, 0);

<div className="px-6 pt-2 pb-3 border-t border-sp-border/30">
  <button
    type="button"
    onClick={() => setChangesOpen((v) => !v)}
    aria-expanded={changesOpen}
    aria-controls="update-changes-panel"
    className="flex items-center gap-1.5 text-xs text-sp-muted hover:text-sp-text
               transition-colors w-full text-left py-1"
  >
    <span
      className={[
        'material-symbols-outlined text-sm transition-transform duration-200',
        changesOpen ? 'rotate-180' : 'rotate-0',
      ].join(' ')}
      aria-hidden="true"
    >expand_more</span>
    {changesOpen ? '변경 내역 접기' : `${totalChanges}개 변경 내역 자세히 보기`}
  </button>

  {changesOpen && (
    <div id="update-changes-panel" className="mt-2 max-h-[35vh] overflow-y-auto space-y-2.5">
      {/* 기존 change list 렌더 */}
    </div>
  )}
</div>
```

#### (e) `parseDescription` 결과 React 트리 렌더 (DescriptionRenderer)

```jsx
function DescriptionRenderer({ description }: { description: string }) {
  const nodes = parseDescription(description);
  if (nodes.length === 0) return null;

  return (
    <div className="mt-1 space-y-2">
      {nodes.map((node, i) => {
        if (node.type === 'paragraph') {
          return (
            <p key={i} className="text-sp-muted text-xs leading-relaxed">
              {node.content.map((inline, j) =>
                inline.kind === 'bold'
                  ? <strong key={j} className="font-semibold text-sp-text/90">{inline.value}</strong>
                  : <span key={j}>{inline.value}</span>
              )}
            </p>
          );
        }
        return (
          <ul key={i} className="list-none space-y-0.5">
            {node.items.map((item, j) => (
              <li
                key={j}
                className={[
                  'flex items-start gap-1.5 text-xs text-sp-muted leading-relaxed',
                  item.level === 2 ? 'pl-4' : '',
                ].join(' ')}
              >
                <span className="shrink-0 text-sp-muted/60 mt-0.5" aria-hidden="true">
                  {item.level === 2 ? '◦' : '·'}
                </span>
                <span>
                  {item.nodes.map((inline, k) =>
                    inline.kind === 'bold'
                      ? <strong key={k} className="font-semibold text-sp-text/80">{inline.value}</strong>
                      : <span key={k}>{inline.value}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        );
      })}
    </div>
  );
}
```

#### (f) CTA 푸터 3개

```jsx
<div className="flex items-center justify-between px-6 py-4 border-t border-sp-border/50">
  {/* 좌측: 외부 링크 2개 */}
  <div className="flex items-center gap-3">
    <a href="https://ssampin.com/guide" target="_blank" rel="noopener noreferrer"
       className="flex items-center gap-1 text-xs text-sp-muted hover:text-sp-text transition-colors">
      노션 가이드
      <span className="material-symbols-outlined text-[12px]" aria-hidden="true">open_in_new</span>
    </a>
    <a href="https://ssampin.com/feedback" target="_blank" rel="noopener noreferrer"
       className="flex items-center gap-1 text-xs text-sp-muted hover:text-sp-text transition-colors">
      피드백
      <span className="material-symbols-outlined text-[12px]" aria-hidden="true">open_in_new</span>
    </a>
  </div>
  {/* 우측: 닫기 + 업데이트 */}
  <div className="flex items-center gap-2">
    <button onClick={handleDismiss}
            className="px-3 py-1.5 text-sm text-sp-muted hover:text-sp-text transition-colors rounded-lg hover:bg-sp-surface">
      닫기
    </button>
    <button onClick={handleDownload}
            className="px-4 py-1.5 text-sm bg-sp-accent text-white rounded-lg hover:bg-blue-600 transition-colors font-medium flex items-center gap-1.5">
      <span className="material-symbols-outlined text-base" aria-hidden="true">rocket_launch</span>
      지금 업데이트
    </button>
  </div>
</div>
```

#### (g) 공용 Modal.tsx 래핑

```jsx
// 수정 후 — Modal.tsx 래핑 (focus-trap·ESC·overlay 클릭 자동 획득)
export function UpdateNotification() {
  const isOpen = !dismissed && status !== 'idle';
  const isDownloading = status === 'downloading';

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleDismiss}
      title={`쌤핀 v${info?.version ?? ''} 업데이트 안내`}
      srOnlyTitle
      size="sm"
      closeOnEsc={!isDownloading}      // 다운로드 중 ESC 차단
      closeOnBackdrop={!isDownloading} // 다운로드 중 overlay 클릭 차단
    >
      {/* 기존 status별 분기 콘텐츠 */}
    </Modal>
  );
}
```

#### (h) chevron transform → className 마이그레이션

```jsx
// 수정 후 — className으로 통합 (인라인 style 제거)
<span
  className={[
    'material-symbols-outlined text-icon-md text-sp-muted',
    'transition-transform duration-200',
    showChangelog ? 'rotate-180' : 'rotate-0',
  ].join(' ')}
  aria-hidden="true"
>expand_more</span>
```

> 인라인 `style`과 Tailwind `transition-transform` 충돌 근본 해소. `rotate-0` 명시로 JIT 번들 강제.

### §2.4 AppInfoSection 컴포넌트 변경 사양

릴리즈 노트 섹션(L273~L401)만 isolated 수정. 개발자 모달·업데이트 버튼·기타 섹션 손대지 않음.

#### (a) `expandedVersions` 초기화 로직 — 현재 버전 기본 펼침 방어

```jsx
fetchAllReleaseNotes().then((notes) => {
  if (notes) {
    setAllNotes(notes);
    // 현재 버전이 목록에 있을 때만 기본 펼침
    const hasCurrentVersion = notes.some((n) => n.version === __APP_VERSION__);
    setExpandedVersions(new Set(hasCurrentVersion ? [__APP_VERSION__] : []));
  }
  setChangelogLoading(false);
});
```

#### (b) highlights 배열 우선 노출

```jsx
{isCurrent && (
  <p className="text-sp-muted text-[10px] font-semibold uppercase tracking-wide mb-1 pl-5 pt-1">
    이번 버전에서 달라진 점
  </p>
)}
{normalizeHighlights(ver.highlights).length > 0 && (
  <ul className="list-none space-y-0.5 mb-2 pl-5">
    {normalizeHighlights(ver.highlights).map((h, i) => (
      <li key={i} className="flex items-start gap-1.5 text-xs text-sp-text/80">
        <span className="text-sp-accent/70 shrink-0 mt-0.5" aria-hidden="true">·</span>
        <span className="leading-relaxed">{h}</span>
      </li>
    ))}
  </ul>
)}
```

> `normalizeHighlights` 헬퍼는 §2.8에서 정의 (역호환).

#### (c) 과거 버전 "이전 버전 기록 보기" 문구 명확화

```jsx
<button type="button" onClick={() => setShowAllVersions(true)}
        className="w-full text-center py-2 text-xs text-sp-accent hover:text-sp-accent/80 transition-colors">
  이전 버전 기록 보기 ({allNotes.length - INITIAL_SHOW_COUNT}개 더)
</button>
```

#### (d) description → `DescriptionRenderer` 적용

```jsx
{c.description && <DescriptionRenderer description={c.description} />}
```

> `DescriptionRenderer` 위치: `src/adapters/components/common/DescriptionRenderer.tsx` (신규, UpdateNotification·AppInfoSection 공유).

#### (e) chevron transition fix (2곳)

```jsx
// 1) 업데이트 내역 토글
className={[
  'material-symbols-outlined text-icon-md text-sp-muted',
  'transition-transform duration-200',
  showChangelog ? 'rotate-180' : 'rotate-0',
].join(' ')}

// 2) 버전별 chevron_right
className={[
  'material-symbols-outlined text-icon-sm text-sp-muted',
  'transition-transform duration-200',
  isExpanded ? 'rotate-90' : 'rotate-0',
].join(' ')}
```

### §2.5 a11y 매트릭스

| 항목 | 현재 | 목표 | 검증 방법 |
|------|------|------|---------|
| ESC 닫기 (UpdateNotification) | ❌ | ✅ Modal.tsx 자동 (`closeOnEsc=true` 기본) | 모달 열림 → ESC → 닫힘 |
| ESC 닫기 (다운로드 중) | 해당 없음 | `closeOnEsc={false}` — 의도치 않은 dismiss 차단 | 다운로드 중 ESC → 닫히지 않음 |
| focus-trap (UpdateNotification) | ❌ | ✅ Modal.tsx 자동 (focus-trap-react) | Tab 순환, 모달 외부 이탈 없음 |
| `aria-expanded` 변경 내역 토글 | ❌ | ✅ `aria-expanded={changesOpen}` | 스크린리더 상태 읽힘 |
| `aria-controls` 변경 내역 패널 | ❌ | ✅ `aria-controls="update-changes-panel"` | 버튼→패널 연결 읽힘 |
| `aria-live` 다운로드 진행률 | ❌ | ✅ `aria-live="polite"` | % 업데이트 시 스크린리더 알림 |
| `aria-modal` 다이얼로그 | ❌ | ✅ Modal.tsx 자동 | 스크린리더 "대화상자" 맥락 |
| `aria-labelledby` 다이얼로그 제목 | ❌ | ✅ Modal.tsx 자동 | 모달 진입 시 제목 읽힘 |
| 키보드 포커스 순서 | 닫기만 | 닫기(X) → 변경 내역 토글 → 노션/피드백 → 닫기 → 업데이트 | Tab 전체 순환 |
| 외부 링크 (오픈인뉴) | ❌ | `rel="noopener noreferrer"` + 아이콘 | 새 탭 열림, 현재 창 유지 |
| chevron 회전 transition | ❌ (인라인 style 무효) | className `transition-transform duration-200` | 200ms 회전 애니메이션 |
| body scroll 잠금 | ❌ | ✅ Modal.tsx 자동 | 백그라운드 스크롤 안 됨 |

#### 핵심 검증 시나리오

**시나리오 A — 키보드 전용 (Tab 순환)**
1. 모달 열림 → 첫 인터랙티브(닫기 X)에 자동 포커스
2. Tab → 변경 내역 토글 → 노션 → 피드백 → 닫기 → 업데이트 순환
3. 마지막에서 Tab → 첫 번째 wrap-around (focus-trap)
4. ESC → 모달 닫힘, 이전 포커스 복귀

**시나리오 B — 다운로드 중 ESC 보호**
1. 업데이트 클릭 → status='downloading'
2. ESC → 닫히지 않음 (`closeOnEsc={false}`)
3. Overlay 클릭 → 닫히지 않음
4. 완료 → status='downloaded', ESC 다시 활성화

**시나리오 C — 스크린리더 (NVDA + Chrome)**
1. 모달 열림 → "쌤핀 vX.X.X 업데이트 안내, 대화상자" 읽힘
2. 토글 버튼 → "N개 변경 내역 자세히 보기, 접힘, 버튼"
3. 클릭 → "펼쳐짐" 상태 변경 알림

### §2.6 디자인 토큰 매핑 (sp-* 정합화)

| 자리 | 현재 하드코딩 | 목표 sp-* 토큰 | 다크 테마 비율 | 라이트 테마 |
|------|-------------|--------------|------------|----------|
| `new` 뱃지 배경 | `bg-blue-500/20 text-blue-400` | `bg-sp-accent/20 text-sp-accent` | sp-accent #3b82f6 | TODO Audit v4 |
| `fix` 뱃지 배경 | `bg-green-500/20 text-green-400` | `bg-emerald-500/15 text-emerald-400` | semantic 유지 | AA (4.6:1) |
| `improve` 뱃지 배경 | `bg-purple-500/20 text-purple-400` | `bg-purple-500/15 text-purple-400` | 유지 | AA (4.5:1) |
| `change` 뱃지 배경 | `bg-amber-500/20 text-amber-400` | `bg-sp-highlight/15 text-sp-highlight` | sp-highlight #f59e0b | TODO Audit v4 |
| 모달 overlay | `bg-black/50` (z-50) | `bg-black/60` (z-sp-modal) | Modal.tsx 기본 | — |
| 모달 배경 | `bg-sp-card border border-sp-border` | 유지 | — | — |
| highlights 불릿 마커 | 없음 | `text-sp-accent` | sp-accent | — |
| 변경 내역 토글 hover | `hover:bg-sp-surface` | 유지 | sp-surface #131a2b | — |
| 외부 링크 | 없음 (신규) | `text-sp-muted hover:text-sp-text` | sp-muted | AA (4.6:1) |

> **라이트 테마 우선 조치**: 일부 sp-accent 텍스트는 흰 배경 기준 3.0:1로 AA 미달 가능. **본 PDCA 스코프에서는 현재 값 유지 + Audit v4 사이클로 이월** (TODO 표시).

### §2.7 라이트/다크 테마 검증 매트릭스

WCAG AA 기준 4.5:1 이상.

| 텍스트 역할 | 다크 fg | 다크 bg | 비율 | 판정 | 라이트 |
|-----------|------|------|------|------|------|
| 본문 (sp-text) | #e2e8f0 | #1a2332 | 10.2:1 | AAA | AAA |
| 보조 (sp-muted) | #94a3b8 | #1a2332 | 4.7:1 | AA | AA |
| 강조 (sp-accent) | #3b82f6 | #1a2332 | 3.1:1 | AA Large / 소형 미달 | TODO Audit v4 |
| 하이라이트 (sp-highlight) | #f59e0b | #1a2332 | 6.0:1 | AA | AA |
| 뱃지 `new` | #3b82f6 on overlay | — | ~3.0:1 | AA Large | TODO |
| 뱃지 `fix` | #34d399 on overlay | — | 5.1:1 | AA | AA |
| DescriptionRenderer paragraph | #94a3b8 | #1a2332 | 4.7:1 | AA | AA |
| DescriptionRenderer bold | #e2e8f0/90 | #1a2332 | 9.2:1 | AAA | AAA |
| bulletList 마커 (sp-muted/60) | #94a3b8×0.6 | — | 2.8:1 | 장식 3:1 미달 | `text-sp-muted` 권고 |

> **조치**: bulletList 마커 `/60` → `text-sp-muted` 변경 (시각 약자 배려).

### §2.8 위험 완화 (Layer 2 한정)

#### 위험 1: 다운로드 중 ESC dismiss 의도치 않은 닫힘

```jsx
const isDownloading = status === 'downloading';

<Modal
  isOpen={isOpen}
  onClose={handleDismiss}
  closeOnEsc={!isDownloading}      // 다운로드 중 ESC 차단
  closeOnBackdrop={!isDownloading} // 다운로드 중 overlay 차단
>
  {/* ... */}
</Modal>

{/* 다운로드 중 시각적 안내 */}
{isDownloading && (
  <p className="text-sp-muted text-[10px] text-center pb-2">
    다운로드 중에는 창을 닫을 수 없어요
  </p>
)}
```

#### 위험 2: 공용 Modal scroll 영역 — 변경 내역 내부 스크롤

```jsx
{changesOpen && (
  <div
    id="update-changes-panel"
    className="overflow-y-auto max-h-[35vh] space-y-2.5 px-6 pb-4
               scrollbar-thin scrollbar-thumb-sp-border"
  >
    {/* 기존 note 렌더 */}
  </div>
)}
```

> Modal.tsx의 `overflow-hidden`이 내부 스크롤 막는지 검증 필요. 자식 flex 컬럼이 max-h 초과 시 스크롤하도록 `min-h-0` flex 아이템 추가.
> **Do 단계 진입 전 확인**: Modal.tsx L97의 `overflow-hidden` 제거 또는 `flex-1 min-h-0 overflow-auto` 자식 래퍼 도입 결정.

#### 위험 3: AppInfoSection 597줄 부수 효과 방지

```typescript
// 1) normalizeHighlights 헬퍼 — AppInfoSection 파일 내 순수 함수
function normalizeHighlights(highlights: string | string[]): string[] {
  if (Array.isArray(highlights)) return highlights;
  if (typeof highlights === 'string' && highlights.trim() !== '') {
    return [highlights];
  }
  return [];
}

// 2) 수정 범위 주석으로 경계 명시
// ─── 릴리즈 노트 섹션 START (§2.4 변경 대상) ───
// ... (L273~L401)
// ─── 릴리즈 노트 섹션 END ───

// 3) DescriptionRenderer는 공통 파일로 분리
// import { DescriptionRenderer } from '@adapters/components/common/DescriptionRenderer';
```

### §2.9 구현 순서 (Day 단위 step-by-step)

Plan §4 Week 1 D2~D5 매핑.

#### D2 (화) — 타입 정합화 + highlights 즉시 노출 검증

| Step | 작업 | 변경 파일 | 검증 |
|------|------|---------|------|
| 2-1 | `VersionNote.highlights: string[]` 타입 변경 | UpdateNotification:22, AppInfoSection:117 | tsc 0 오류 |
| 2-2 | `normalizeHighlights` 헬퍼 추가 | AppInfoSection.tsx | TC-4 통과 |
| 2-3 | UpdateNotification highlights 배열 렌더 | UpdateNotification:218~223 | 모달 6개 노출 확인 |
| 2-4 | AppInfoSection highlights 배열 렌더 | AppInfoSection:351~358 | 설정에서 전체 노출 확인 |

#### D2~3 (화~수) — UpdateNotification 정보 계층 + Modal 마이그레이션

| Step | 작업 | 변경 파일 | 검증 |
|------|------|---------|------|
| 3-1 | `parseDescription` + `parseInlineMarks` 구현 | DescriptionRenderer.tsx (신규) | TC-1~6 통과 |
| 3-2 | `DescriptionRenderer` 컴포넌트 | 동일 | 4슬롯 시각 렌더 |
| 3-3 | 헤더/서브헤더 카피 변경 | UpdateNotification:198~214 | 텍스트 확인 |
| 3-4 | 변경 내역 접힘 토글 | UpdateNotification:233~271 | 펼침/접힘 동작 |
| 3-5 | CTA 푸터 3개 | UpdateNotification:273~289 | 렌더 확인 |
| 3-6 | Modal.tsx 래핑 | UpdateNotification:184~189 | Tab·ESC·overlay 동작 |
| 3-7 | chevron transition | 해당 span | 200ms 회전 |

#### D3~4 (수~목) — AppInfoSection 재구성

| Step | 작업 | 변경 파일 | 검증 |
|------|------|---------|------|
| 4-1 | `expandedVersions` 방어 로직 | AppInfoSection:281~290 | 자동 펼침 |
| 4-2 | 강조 헤더 + highlights 배열 | AppInfoSection:350~370 | "달라진 점" + 모두 |
| 4-3 | description → `DescriptionRenderer` | AppInfoSection:368~374 | 4슬롯 파싱 |
| 4-4 | "이전 버전 기록 보기" 문구 | AppInfoSection:380~390 | 텍스트 확인 |
| 4-5 | chevron transition (2곳) | AppInfoSection:298, 334 | 회전 애니메이션 |

#### D4~5 (목~금) — a11y 보강 + sp-* 토큰화

| Step | 작업 | 변경 파일 | 검증 |
|------|------|---------|------|
| 5-1 | `aria-expanded` / `aria-controls` | UpdateNotification | DevTools 속성 |
| 5-2 | `aria-live="polite"` 진행률 | UpdateNotification:295~306 | 스크린리더 |
| 5-3 | 뱃지 sp-* 토큰화 | UpdateNotification:31~35, AppInfoSection:125~129 | 클래스 변경 |
| 5-4 | 불릿 마커 `text-sp-muted` | DescriptionRenderer.tsx | 명도 4.5:1+ |
| 5-5 | ESC/backdrop 차단 | UpdateNotification Modal props | 다운로드 중 비닫힘 |
| 5-6 | tsc --noEmit 0 오류 | — | CI 통과 |
| 5-7 | npm run dev 통합 QA | — | 전체 시나리오 |

### §2.10 인수 기준 매핑 (Plan §6.B)

| Plan §6.B | 충족 §항 | 핵심 구현 |
|---------|---------|---------|
| highlights 6개 노출 | §2.3(a), §2.3(c) | 타입 fix + 배열 map |
| ESC 닫기 | §2.3(g), §2.5 | Modal.tsx 마이그레이션 |
| 변경 내역 접힘 + chevron | §2.3(d), §2.3(h) | `changesOpen` + className |
| AppInfoSection 현재 펼침 | §2.4(a) | `expandedVersions` 방어 |
| 라이트 명도 4.5:1+ | §2.6, §2.7 | sp-* 토큰화 + 매트릭스 |
| 키보드 네비게이션 | §2.5, §2.3(f) | focus-trap + Tab 순서 |
| 다운로드 중 ESC 보호 | §2.8 위험 1 | `closeOnEsc={!isDownloading}` |
| 코드 회귀 0건 | §2.8 위험 3 | isolated 수정 + normalize 헬퍼 |

> **Do 단계 진입 전 확인 사항** — ✅ 사용자 결정 완료 (2026-05-07)
> - `DescriptionRenderer.tsx` 위치 — `src/adapters/components/common/DescriptionRenderer.tsx` 확정 (제안 채택)
> - Modal.tsx `overflow-hidden` 처리 — **옵션 A 채택**: UpdateNotification 측 children 래퍼에 `flex-1 min-h-0 overflow-auto` 추가, Modal.tsx 자체는 변경 없음. 회귀 위험 최소화. 향후 Audit v4 사이클에서 옵션 B(구조 통합) 재검토.

---

## 3. Layer 3 Design — 자동 파생 변환 파이프라인

> **Status**: Draft v0.1 (2026-05-07). Layer 1 락 후 작성.

### 3.1 변환기 3종 개요

`release-notes.json` master를 입력으로 받아 3개 채널 출력을 자동 파생한다.

| 스크립트 | 입력 | 출력 | 의존성 | 우선순위 |
|---------|------|------|--------|---------|
| `release-notes-to-threads.mjs` | `public/release-notes.json` | `docs/release-notes-assets/v{version}/threads-post.md` | Node 표준 `fs`/`path` | P2 |
| `release-notes-to-card-prompts.mjs` | 동일 | `docs/release-notes-assets/v{version}/cards/prompts/*.md` (8개) | Node 표준 | P2 |
| `release-notes-to-notion-blocks.mjs` | 동일 | `docs/release-notes-assets/v{version}/notion-update.json` | `@modelcontextprotocol/sdk` (선택) | P3 (v2.0.5+) |

**공통 설계 결정**:
- **CommonJS도 ESM도 아닌 `.mjs`** — `package.json`의 `"type"` 명시 부담 회피, 기존 `scripts/ingest-chatbot-qa.mjs` 컨벤션 일관
- **신규 npm 의존성 없음** (P2 한정) — Node.js 표준 모듈만 사용. P3의 노션 변환기만 추후 평가
- **CLI 인자 통일**: `--version <ver>` 필수, `--out <dir>` 옵션. 입력은 항상 `public/release-notes.json` 고정.
- **dry-run 모드**: `--dry-run` 시 출력 파일 쓰지 않고 stdout으로 결과 출력

### 3.2 `release-notes-to-threads.mjs` — Threads 8타래 변환기

#### 3.2.1 입출력 스키마

```
입력: release-notes.json의 versions[i] 단일 항목
  (CLI: --version 2.0.4 → versions.find(v => v.version === '2.0.4'))

출력: v{version}/threads-post.md
  - 헤더 메타블록 (사용법·이미지 첨부·글자수·버전 컨셉)
  - Thread 1 ~ Thread N (N = changes.length 의 상한 7 + 인트로 + 아웃트로)
  - 각 Thread: 첨부 이미지 reference + 코드블록 안에 본문
```

#### 3.2.2 매핑 규칙

**Thread 1 (메인 포스트)** — `cards/01-intro.png` 첨부
```
입력 → 출력 매핑
- 타이틀: "쌤핀 v{version} 업데이트 📌 ({YYYY.MM.DD} 릴리즈)"
- 컨셉 1줄: highlights[0]을 추출, 이모지 제거 후 "이번엔 '{X}' 하는 마음으로 {N}가지를 손봤어요." 템플릿
- 불릿 리스트: highlights[] 6개 모두 (이모지 포함)
- 마무리: "아래 타래에서 하나씩 풀게요 👇"
- 해시태그: "#쌤핀 #교사앱 #업데이트" (THREADS-POST-STYLE.md §5 고정)
```

**Thread 2 ~ N-1 (콘텐츠 타래)** — `cards/0X-{slug}.png` 첨부

각 changes[i]에 대해 1 thread. 4슬롯 description을 직접 매핑:

```typescript
function changeToThread(change: ChangeItem, index: number): string {
  const slots = parseDescription(change.description);  // Layer 1 §1.3 contract
  const lead = slots.find(s => s.type === 'paragraph' && s.position === 0)?.content ?? '';
  const bullets = slots.find(s => s.type === 'bulletList')?.items ?? [];
  const closer = slots.findLast(s => s.type === 'paragraph')?.content ?? '';

  return `${index}. ${change.title} — ${lead.split('.')[0]}

${lead}
${bullets.map(b => '· ' + b.text).join('\n')}

${closer}`;
}
```

**Thread N (아웃트로)** — `cards/0N-outro.png` 첨부
```
"지금 바로 업데이트해 보세요 🔔

쌤핀 데스크톱 앱 · ssampin.com

업데이트는 앱 설정 > 앱 정보에서 확인하거나, 위 링크에서 최신 버전을 다운로드하실 수 있어요. 자동 업데이트 알림도 곧 표시됩니다.

수업과 업무에서 써보시고 피드백 주시면 다음 버전에 바로 반영하겠습니다. 감사합니다 🙌

#쌤핀 #SsamPin #교사도구 #교육 #EdTech"
```
THREADS-POST-STYLE.md §7 락된 템플릿 그대로. 변경 없음.

#### 3.2.3 변환 알고리즘 (의사코드)

```javascript
function convertToThreads(version) {
  const data = JSON.parse(fs.readFileSync('public/release-notes.json'));
  const ver = data.versions.find(v => v.version === version);
  if (!ver) throw new Error(`Version ${version} not found`);

  const sections = [
    generateHeader(ver),
    generateThread1(ver),       // 인트로
    ...ver.changes
      .filter(c => c.type !== 'change')  // 'change' type은 일반적으로 메인 노출 안 함 (경계 케이스 §3.5)
      .slice(0, 6)                        // 콘텐츠는 최대 6개 (카드뉴스와 일치)
      .map((c, i) => generateContentThread(c, i + 1)),
    generateOutroThread(ver),    // 아웃트로
  ];

  return sections.join('\n\n---\n\n');
}
```

#### 3.2.4 v2.0.3 dry-run 일치율 검증

기준: 기존 수동 작성 [`docs/release-notes-assets/v2.0.3/threads-post.md`](e:/github/ssampin/docs/release-notes-assets/v2.0.3/threads-post.md) vs 변환기 출력 텍스트 유사도.

```bash
# 검증 명령
node scripts/release-notes-to-threads.mjs --version 2.0.3 --dry-run > /tmp/converted.md
diff <(normalize /tmp/converted.md) <(normalize docs/release-notes-assets/v2.0.3/threads-post.md)
```

`normalize`: 공백·해시태그·이모지 위치 차이 제거 + Levenshtein 유사도 계산.

**합격 기준**: 80% 이상 텍스트 일치 (메인 카피·타이틀·불릿·해시태그·CTA가 같음). 차이는 **이모지 위치, 타래 간 연결 어구, 카드뉴스 시각 디테일**에 한정.

⚠️ **v2.0.3은 4슬롯 적용 전이라 일치율이 낮을 수 있음** — 그 경우 v2.0.4를 첫 합격 검증 대상으로 삼고, v2.0.3은 "구버전 폴백 변환" 모드로 별도 처리.

### 3.3 `release-notes-to-card-prompts.mjs` — 카드 8장 프롬프트 변환기

#### 3.3.1 카드 8장 표준 분배

| 카드 # | 종류 | 입력 매핑 | 레이아웃 | 템플릿 base |
|-------|------|---------|---------|-----------|
| 01 | 인트로 | highlights[0] + version + date | sparse | v2.0.3/01-card-intro.md |
| 02~07 | 콘텐츠 6개 | changes[0..5] (type=new·메이저 improve 우선) | sparse 또는 balanced (combo) | v2.0.3/02~07 |
| 08 | 아웃트로 | (선택) 잔여 fix 1개 + CTA | sparse | v2.0.3/08-card-outro.md |

#### 3.3.2 콘텐츠 카드 자동 매핑

각 콘텐츠 카드(02~07)는 `change` 1개에 대응. 템플릿 슬롯 채움:

```yaml
# 자동 생성된 카드 prompt 헤더
slug: ssampin-v{version}-card-{NN}
type: image-card
series: ssampin-v{version}
card_number: {NN}
total_cards: 8
aspect: "1:1"
language: ko
style: notion
layout: {sparse | balanced}    # 1 change → sparse, 2 changes 묶음 → balanced
```

**본문 템플릿 (sparse, 단일 change)**:
```markdown
A 1:1 square card — **Card {NN} of 8** — featuring **{change.title}**.

## Visual style (match Card 1 exactly)
[CARD-NEWS-STYLE.md §4 락된 팔레트 그대로]

## Content
- **Top-center tag pill**: "{type 한글 라벨}" pill (white text on {type 색상})
- **Headline** (ExtraBold, deep navy): "{change.title}"
- **Sub-copy** (muted slate): "{slot1.firstSentence}"
- **Central illustration** (monoline, ~50% card height):
  [생성 AI에 줄 일러스트 가이드 — title·slot2 불릿에서 핵심 명사 추출 + monoline 모티프 추천]
- **Body text below illustration** (muted slate, 2 lines centered):
  "{slot2.bullets[0]}"
  "{slot4 (closer)}"
- **Bottom-left**: "{NN} / 8" (muted slate)

## Constraints
[CARD-NEWS-STYLE.md §7 락 그대로]
```

**일러스트 가이드 자동 추천**: change.type별 모티프 사전 정의

```javascript
const ILLUSTRATION_HINTS = {
  'new': '신규 기능을 상징하는 monoline 일러스트 (예: 새 도구·새 화면·새 패턴)',
  'fix': '안전·차단·shield monoline 모티프 (예: 방패·체크마크·차단 표시)',
  'improve': '향상·세련됨·다듬어진 모티프 (예: 가위·붓·샤프닝)',
  'change': '전환·이전·다른 길 모티프 (예: 화살표·교차로)',
};
```

각 카드 prompt에 자동으로 type별 모티프 힌트가 들어가지만, **운영자가 수동 후편집으로 구체화**해야 한다 (e.g., `v2.0.3/02-card-native-desktop.md`의 desktop frame + widget panel 같은 구체 비주얼은 자동 생성 불가).

#### 3.3.3 인트로·아웃트로 카드 (고정 템플릿)

`v2.0.2`/`v2.0.3` 인트로·아웃트로 카드는 거의 동일한 보일러플레이트. 변환기는 **version·date·highlights[0]·"이번 버전 컨셉" 한 문장만** 채워 넣는다.

#### 3.3.4 출력 디렉토리 자동 생성

```
docs/release-notes-assets/v{version}/
├── threads-post.md             ← 변환기 1
├── cards/
│   └── prompts/                ← 변환기 2
│       ├── 01-card-intro.md
│       ├── 02-card-{slug}.md   ← change.title slugify
│       ├── ...
│       └── 08-card-outro.md
└── notion-update.json          ← 변환기 3 (P3, 후순위)
```

이미지 자체(`*.png`)는 별도 단계 — `baoyu-imagine` skill로 prompt 파일 → PNG 생성 (CARD-NEWS-STYLE.md §9 파이프라인 그대로).

### 3.4 `notionUrl` 옵션 필드 (스키마 비파괴 확장)

#### 3.4.1 스키마 추가

```typescript
interface ChangeItem {
  type: 'new' | 'fix' | 'improve' | 'change';
  title: string;
  description?: string;
  notionUrl?: string;            // ← 추가, 옵션, 비파괴
}
```

JSON에 `notionUrl` 추가 예시:
```json
{
  "type": "new",
  "title": "바탕화면 아이콘 아래 모드",
  "description": "...4슬롯...",
  "notionUrl": "https://supsori.notion.site/native-desktop-mode-abc123"
}
```

#### 3.4.2 UI 렌더 contract (Layer 2와 공유)

`UpdateNotification.tsx`에서 description 끝에 인라인 노출:

```jsx
{change.description && <DescriptionRenderer description={change.description} />}
{change.notionUrl && (
  <a
    href={change.notionUrl}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-flex items-center gap-1 mt-2 text-detail text-sp-accent hover:underline"
    onClick={() => track('release_notes_notion_link_clicked', { version, title: change.title })}
  >
    📖 자세히 보기
    <span className="material-symbols-outlined text-icon-sm">arrow_outward</span>
  </a>
)}
```

#### 3.4.3 폴백 (notionUrl 없을 때)

- description만 노출, 깨끗하게 생략
- 구버전 release-notes.json 항목들은 `notionUrl` 없으므로 자연스럽게 폴백

#### 3.4.4 외부 링크 보안

- `target="_blank" rel="noopener noreferrer"` 필수
- href는 https://supsori.notion.site/* 또는 https://www.notion.so/supsori/* 만 허용 (whitelist)
- Electron `webContents.setWindowOpenHandler`로 외부 브라우저 열기 (Electron 자체에 새 윈도우 안 생김)

### 3.5 경계 케이스 처리

| 케이스 | 처리 |
|--------|------|
| `description` 없는 항목 | Threads 변환기: title만 + 짧은 placeholder. 카드 변환기: change 카드에서 sub-copy 생략. |
| `description`이 단일 문단 (구버전 폴백) | parseDescription이 단일 paragraph 반환. Threads 변환기: lead와 closer 모두 동일한 단일 문단으로 처리 (의도된 비결). |
| `type: 'change'` | Threads에서 콘텐츠 타래로 노출 안 함 (사용자에게 옅은 변경 신호). Highlights에는 포함됨. 카드뉴스에는 포함 가능. |
| `highlights` 배열 6개 미만 | 카드 분배: 콘텐츠 카드 수 = highlights.length. 8장 미달 시 인트로(1) + N + 아웃트로(1)로 변동 길이. |
| `highlights` 배열 6개 초과 | 카드 8장 표준 유지 — 첫 6개만 카드화. 나머지는 release-notes.json description에만 보존. |
| `description`에 강조 `**bold**` 다수 | Threads 변환기: 그대로 유지 (마크다운 호환). 카드 변환기: bold 제거 후 평문 (이미지 안 텍스트는 마크다운 안 됨). |
| 이모지 다양 (highlights 첫머리 외 다수) | 정규식으로 첫 1개만 보존, 나머지 이모지 제거. R-4 검증 규칙 발동. |

### 3.6 변환 실패 폴백

자동 변환기는 fail-soft 원칙:

1. **slot 파싱 실패** (예: 빈 줄 없는 단일 문단 description) → 단일 paragraph로 fallback. 경고 출력.
2. **dry-run 일치율 80% 미만** → stderr에 경고: "변환 결과가 수동 작성과 80% 미만 일치. 수동 후편집 필요." 종료 코드 0 (실패 아님, 신호만).
3. **출력 파일 충돌** (이미 존재) → `--force` 옵션 없으면 abort. 운영자 실수 방지.
4. **불필요한 신규 npm 의존성** (P2 한정) → 발생 시 PR 거부. P3에서만 평가.

### 3.7 구현 순서 (Plan §4 Week 2 D6~D8 매핑)

| Day | 작업 | 산출물 | 검증 |
|-----|------|-------|------|
| D6 (월) | `release-notes-to-threads.mjs` 작성 + parseDescription 공유 모듈 | D-09 | v2.0.3 dry-run, 텍스트 80% 일치 |
| D6 (월) | parseDescription 모듈을 Layer 2와 공유 (`src/usecases/releaseNotes/parseDescription.ts`) | — | 단위 테스트 6개 통과 |
| D7 (화) | `release-notes-to-card-prompts.mjs` 작성 + 카드 분배 알고리즘 | D-10 | v2.0.3 dry-run, 8 prompt 파일 자동 생성, 수동 결과와 슬롯 일치 |
| D7 (화) | type별 일러스트 모티프 힌트 사전 작성 | — | 6 type × 3 모티프 = 18 힌트 |
| D8 (수) | `notionUrl` 스키마 추가 + 모달 인라인 링크 + Layer 2 통합 | D-11 | E2E 테스트 (notion link 클릭 → 외부 브라우저) |
| D8 (수) | URL 화이트리스트 (supsori.notion.site만) | — | 보안 검증 |
| D8 (수) | 변환기 README + 사용법 문서 | `scripts/release-notes-converters.md` | — |

### 3.8 Plan 인수 기준 매핑 (§6.C)

| Plan §6.C | 매핑 |
|----------|------|
| C-01 (Threads 변환기 80% 일치) | §3.2.4 검증 시나리오 |
| C-02 (카드 8장 자동 생성, sparse/balanced 자동 분배) | §3.3.1 + §3.3.2 |
| C-03 (notionUrl 옵션 필드 폴백) | §3.4.3 |
| C-04 (v2.0.4 자체 마케팅 자료를 자동 변환기로 1차 생성) | §3.7 D6~D8 모든 변환기 + Plan §4 D9 사용 |

### 3.9 향후 확장 (v2.0.5+)

- `release-notes-to-notion-blocks.mjs` (D-12, P3) — 노션 사용자 가이드 메인 callout + 변경 페이지 자동 갱신. notion-mcp 또는 notion-api 의존성 평가 필요.
- 다국어 (영어·일본어) — description 슬롯 내 i18n 키 도입. 별도 PDCA.
- A/B 테스트 인프라 — 변환기에서 변형 카피 2종 생성 후 모달이 분기 노출. 텔레메트리 인프라 의존.

---

## 4. 사용자 결정 대기 사항 (Layer 1 — 락 완료 2026-05-07)

✅ Layer 1 락 완료. 사용자 응답: "좋아 다음으로 넘어가" (5 결정 모두 OK).

- 4슬롯 구조 ✅
- 슬롯 진입 순서 (Why→What→How→공감) ✅
- 이모지 정책 (highlights 1 / description 0, fix만 ⚠️ 예외) ✅
- `notionUrl` 옵션 필드 도입 ✅
- lint 스크립트 자동화 보류 (P3 후순위) ✅
