# 생기부 초안 [분량 조절] 섹션 — UI 설계서

- 상태: 설계 완료 · 구현 대기 (2026-09-07)
- 근거 계획서: `docs/01-plan/features/record-draft-length-adjustment.plan.md` §C-3 / §C-3-1 / §C-3-2 (ADR-086)
- 적용 화면: 학급 운영 / 수업 관리 생기부 초안, 오른쪽 「AI 초안」 패널 안
- 대상 신규 파일: `src/adapters/components/RecordDraft/RecordDraftLengthPanel.tsx`
- 코드는 이 문서에 없다. 아래 클래스 문자열은 구현자가 그대로 옮겨 붙이는 것을 전제로 적었다.
- 착수 직전에 `RecordDraftAiPanel.tsx`·`RecordDraftView.tsx`를 다시 열어 줄 번호를 확인할 것 — 두 파일 다 이 설계 작업 중에도 다른 세션이 계속 고치고 있었다(§8 참조).

## 0. 한 줄 요약

기존 「AI 초안 판(버전) 미리보기」 카드와 같은 뼈대(테두리 카드 · 판 탭 · 미리보기 · 버튼 줄)를 한 번 더 쓰되, 판을 저장하기 **전** 단계(목표 입력 · 실행 중 · 확인 두 갈래)가 앞에 붙는 조립이다. 새 색·새 모양을 만들지 않는다.

## 1. 배치 — 어디에 들어가는가

`RecordDraftAiPanel.tsx`의 반환 JSX 안, 기존 주석 번호 기준:

```
1. 주제 고르기            (기존, threads.length > 0 일 때만)
2. 시작: 공급자·모델·단위 (기존, running/queue 중엔 숨김)
   [실행 중 안내] / [멈춤 안내]
3. 되돌리기 배너           (기존)
4. 판(버전) 미리보기        (기존: selected && versions.length > 0)
5. ▶ 분량 조절  ← 신규, 여기에 삽입
6. 형광펜 다시 표시         (기존, highlightOn && onRemark && 글 있음)
```

- **4번 뒤, 5번(형광펜) 앞.** 판 미리보기가 있으면 그 판을 참고해 조절을 시작하는 흐름이 자연스럽고, 형광펜 [다시 표시]는 "지금 이 글"에 대한 마무리 동작이라 항상 맨 아래가 맞다.
- **AI 초안 판이 하나도 없어도 렌더링된다.** 분량 조절의 대상은 화면의 현재 입력(등록부)이지 AI 판이 아니다 — 직접 쓴 글도 조절 대상이다(§E-8). 그래서 4번 블록의 존재 여부(`selected && versions.length > 0`)에 조건을 걸지 않는다.
- 연결이 안 돼 있으면(`!runProvider`) 패널 전체가 안내 화면으로 조기 반환되므로, 이 섹션도 자연히 함께 숨는다. 별도 가드가 필요 없다.
- 부모(`RecordDraftAiPanel`)가 `RecordDraftLengthPanel`에 실명 그대로 재료를 넘긴다. 가리는 일은 여기서도 하지 않는다 — `buildLengthAdjustPack`(도메인 서비스) 안에서 한 세션으로 가린다는 원칙(§C-1)을 그대로 따른다.

## 2. 이 문서가 다루는 것 / 다루지 않는 것

**다룬다**: 접힌·펼친 헤더, 9개 상태 + 2개 인라인 확인 게이트의 와이어프레임과 실제 Tailwind 클래스, 색·간격 결정과 이유, 접근성.

**다루지 않는다**(계획서 §C-2·§C-4·§D에 이미 있음, 여기서 다시 쓰지 않는다): 등록부·잠금·토큰의 배선, `judgeLength`/`buildLengthAdjustPack`의 계산 로직, 저장 계약, 브릿지·동기화 영향. §8에 얇은 참고용 데이터 흐름 스케치만 둔다.

## 3. 이 섹션이 물려받는 것 — 실제 클래스 인용

`RecordDraftAiPanel.tsx`(789줄, 이번 설계 시점 기준)에서 그대로 가져와 쓰는 것들이다. 새로 만들지 않는다.

| 무엇                           | 원본 위치                              | 실제 클래스                                                                                                                                                                                                                                           |
| ------------------------------ | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 보조 버튼(`btn`)               | 469행                                  | `rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 ring-sp-border transition-colors hover:bg-sp-surface`                                                                                                                                            |
| 주 버튼(파랑)                  | 592행 · 746행                          | `rounded-lg bg-sp-accent px-2.5 py-1.5 text-xs font-semibold text-sp-accent-fg`                                                                                                                                                                       |
| 카드 컨테이너                  | 653행(판 미리보기 카드)                | `flex flex-col gap-2 rounded-lg border border-sp-border bg-sp-bg p-3`                                                                                                                                                                                 |
| 선택 칩(고름/안 고름)          | 522~526행(주제 칩) · 675~679행(판 탭)  | `rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition-colors` + 고름: `bg-blue-500/15 text-sp-accent ring-blue-500/30` / 안 고름: `text-sp-muted ring-sp-border hover:text-sp-text`                                                         |
| 세그먼트 버튼(공급자 고르기)   | 552~569행                              | 바깥: `inline-flex overflow-hidden rounded-lg ring-1 ring-sp-border` · 각 버튼: `px-2 py-1 text-xs font-medium` + 고름: `bg-sp-accent text-sp-accent-fg` / 안 고름: `bg-sp-card text-sp-muted hover:text-sp-text`                                     |
| 되돌리기/주의 배너(호박)       | 633행                                  | `flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 ring-1 ring-amber-500/20` + 글자 `text-xs text-amber-600`                                                                                                                               |
| 위험 배너(빨강)                | `RecordDraftView.tsx` 1206·1227행      | `rounded-lg bg-red-500/5 px-2.5 py-1.5 text-xs leading-snug text-red-500 ring-1 ring-red-500/20`                                                                                                                                                      |
| 미리보기 본문 상자             | 702·719행                              | `whitespace-pre-wrap rounded-lg bg-sp-card px-2 py-1.5 text-sm leading-relaxed text-sp-text` (비교할 때는 `ring-1 ring-sp-border` 추가)                                                                                                               |
| 바이트 카운터 색 규칙          | `RecordDraftView.tsx` 994~997행        | `bytes > limit && verified ? 'text-red-500'/'bg-red-500' : ratio > 0.8 ? 'text-amber-500'/'bg-amber-500' : 'text-sp-muted'/'bg-emerald-500'`                                                                                                          |
| 바이트 진행바                  | `RecordDraftView.tsx` 1249~1252행      | 트랙 `h-1 w-full overflow-hidden rounded-full bg-sp-border` · 채움 `block h-full rounded-full` + 위 색, `style={{ width: `${ratio\*100}%` }}`                                                                                                         |
| 접이식 헤더(토글)              | `ArchivedClassesSection.tsx` 108~119행 | 버튼 `w-full flex items-center gap-1.5 px-1 py-1.5 text-xs text-sp-muted hover:text-sp-text transition-colors` + `aria-expanded` · 화살표 `material-symbols-outlined text-sm transition-transform ${open ? 'rotate-180' : ''}` (아이콘 `expand_more`) |
| 실패/삭제 확인 버튼(빨강 외곽) | `InquiryThreadPanel.tsx` 149·165행     | 진행(위험 인정): `rounded-md bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-500 ring-1 ring-red-500/20 hover:bg-red-500/20` · 취소/후퇴: `text-sp-muted hover:text-sp-text`                                                                   |
| 숫자 입력 + 단위 라벨          | `ClassRosterTab.tsx` 668~677행         | 입력 `bg-sp-bg border border-sp-border rounded-lg px-2 py-1.5 text-sm text-sp-text text-center focus:outline-none focus:border-sp-accent` + 옆 라벨 `text-xs text-sp-muted`                                                                           |
| `role="status"` 공지           | 646행                                  | `<p role="status" className="text-xs text-sp-muted">`                                                                                                                                                                                                 |

**손대지 않는 것**: `DRAFT_TEXT_METRICS`(편집 칸·형광펜 레이어 정렬 전용, 지시사항대로 미리보기에 붙이지 않는다), `ROLE_BG`(문단 역할 형광펜 색 — 조절 미리보기에는 아직 표식이 없으므로 쓸 일이 없다).

## 4. 공용 스타일 상수(구현 스케치)

새 파일이므로 `RecordDraftAiPanel`의 `btn`과 같은 역할을 하는 상수를 이 파일 안에 **다시 선언**한다(모듈이 다르므로 import로 공유하지 않는다 — 기존 파일도 그렇게 하지 않는다):

```ts
const btn =
  'rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 ring-sp-border transition-colors hover:bg-sp-surface';
const primaryBtn = 'rounded-lg bg-sp-accent px-2.5 py-1.5 text-xs font-semibold text-sp-accent-fg';
const dangerBtn =
  'rounded-lg bg-red-500/10 px-2.5 py-1.5 text-xs font-semibold text-red-500 ring-1 ring-red-500/20 hover:bg-red-500/20';
const chip = (on: boolean): string =>
  `rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition-colors ${
    on
      ? 'bg-blue-500/15 text-sp-accent ring-blue-500/30'
      : 'text-sp-muted ring-sp-border hover:text-sp-text'
  }`;
```

## 5. 상태별 와이어프레임 + 클래스

### 5-0. 헤더(모든 상태 공통, 접힘·펼침 둘 다)

```
[▾] 분량 조절                              대상: AI 초안 v2
```

```tsx
<div className="flex flex-col gap-2 rounded-lg border border-sp-border bg-sp-bg p-3">
  <button
    type="button"
    onClick={() => setOpen((v) => !v)}
    aria-expanded={open}
    aria-controls="length-panel-body"
    className="flex w-full items-center gap-1.5 text-left text-xs text-sp-muted transition-colors hover:text-sp-text"
  >
    <span
      className={`material-symbols-outlined text-sm transition-transform ${open ? 'rotate-180' : ''}`}
    >
      expand_more
    </span>
    <span className="material-symbols-outlined text-sm">straighten</span>
    <span className="text-sm font-semibold text-sp-text">분량 조절</span>
    <span className="ml-auto text-xs text-sp-muted">
      대상: {sourceLabel /* "AI 초안 v2" 또는 "직접 작성한 글" */}
    </span>
  </button>
  {open && (
    <div id="length-panel-body" className="flex flex-col gap-2">
      {/* 5-1~5-12 */}
    </div>
  )}
</div>
```

- **기본값은 접힘.** 초안 화면은 이미 정보 밀도가 높다(디자인 원칙 4 "점진적 복잡성"). 한도를 넘겼을 때만 자동으로 펼치는 것을 권장한다(§7).
- "대상" 라벨 규칙(구현 가정 — §11-1에서 확인 요청): 이 섹션 위 4번 블록의 `selected`가 있고 `selected.appliedAt !== undefined`이면 `` `AI 초안 v${index+1}` ``, 아니면 `직접 작성한 글`. 실제 판정에 쓰는 바이트는 언제나 화면의 현재 입력이므로 이 라벨은 출처를 알려 주는 힌트일 뿐 계산에 영향을 주지 않는다.
- 아이콘은 `straighten`(자, 길이 재는 느낌)을 제안한다. 기존 패널의 `auto_awesome`(AI 초안)·`ink_highlighter`(형광펜)와 겹치지 않으면서 "분량"을 은유한다.

### 5-1. 상태 1 — 글이 비어 있음

```
[▾] 분량 조절
    이 칸에 쓴 글이 없어서 분량을 조절할 수 없어요. 먼저 글을 쓰거나 AI 초안을 받아 주세요.
```

```tsx
<p className="px-1 text-xs leading-relaxed text-sp-muted">
  이 칸에 쓴 글이 없어서 분량을 조절할 수 없어요. 먼저 글을 쓰거나 AI 초안을 받아 주세요.
</p>
```

- 헤더의 "대상: …" 세그먼트 자체를 그리지 않는다(빈 글에는 붙일 판이 없다). em 대시나 다른 자리표시 문자로 대신 채우지 않는다 — 애초에 그 자리를 없앤다.
- 이 상태에서는 목표 입력·모드 버튼을 아예 그리지 않는다. 비활성 입력칸을 보여주고 이유를 옆에 적는 것보다, 아무것도 조작할 수 없을 때는 조작 UI 자체를 치우는 편이 "장식 없이 동작에만 답한다"는 이 저장소의 태도(§근거 정리 보드 협업 지침)에 맞는다.
- 판정: `getSourceText().trim().length === 0`.

### 5-2. 상태 2 — 대기(idle)

```
현재 1,782바이트                           영역 한도 1,500바이트

목표 분량 [ 1500 ] 바이트

[ 줄이기 ] [ 근거로 보충하기 ]

핵심 활동과 교사 평가를 유지하며 줄입니다.

                                          [ 조절안 만들기 ]
```

```tsx
<div className="flex items-center justify-between text-xs">
  <span className={sourceByteCls /* §3 바이트 카운터 색 규칙, 소스 바이트 기준 */}>
    현재 {sourceBytes.toLocaleString()}바이트
  </span>
  <span className="text-sp-muted">영역 한도 {areaLimit.toLocaleString()}바이트</span>
</div>

<label className="flex items-center gap-1.5 text-xs text-sp-text">
  목표 분량
  <input
    type="number"
    inputMode="numeric"
    value={targetInput}
    onChange={(e) => setTargetInput(e.target.value)}
    onBlur={() => setTargetInput(String(clampTargetBytes(Number(targetInput), area, level)))}
    aria-label="목표 분량(바이트)"
    className="w-20 rounded-lg border border-sp-border bg-sp-bg px-2 py-1 text-center text-sm text-sp-text focus:border-sp-accent focus:outline-none"
  />
  <span className="text-sp-muted">바이트</span>
</label>
{clampedNotice && <p className="text-xs text-sp-muted">이 영역 한도는 {areaLimit.toLocaleString()}바이트예요.</p>}
{!areaLimitVerified && <p className="text-xs text-sp-muted">한도 수치는 확인 중이에요.</p>}

<div className="inline-flex w-fit overflow-hidden rounded-lg ring-1 ring-sp-border" role="radiogroup" aria-label="분량 조절 방향">
  <button
    type="button"
    onClick={() => setKind('shrink')}
    aria-pressed={kind === 'shrink'}
    className={`px-2.5 py-1.5 text-xs font-medium ${kind === 'shrink' ? 'bg-sp-accent text-sp-accent-fg' : 'bg-sp-card text-sp-muted hover:text-sp-text'}`}
  >
    줄이기
  </button>
  <button
    type="button"
    onClick={() => setKind('expand')}
    aria-pressed={kind === 'expand'}
    disabled={evidenceCount === 0}
    className={`px-2.5 py-1.5 text-xs font-medium disabled:opacity-40 disabled:hover:bg-sp-card ${kind === 'expand' ? 'bg-sp-accent text-sp-accent-fg' : 'bg-sp-card text-sp-muted hover:text-sp-text'}`}
  >
    근거로 보충하기
  </button>
</div>

{kind === 'expand' && (
  <p className="text-xs text-sp-muted">
    주제: {threadTitle ?? '전체 근거'}
    {threadTitle && ' (조절 대상 판 기준)'}
  </p>
)}

<p className="text-xs leading-relaxed text-sp-muted">
  {kind === 'shrink'
    ? '핵심 활동과 교사 평가를 유지하며 줄입니다.'
    : '빠진 과정과 결과를 근거 자료로 채우고, 새로운 내용은 지어내지 않습니다.'}
</p>

<button type="button" onClick={runOrConfirm} className={`w-fit self-end ${primaryBtn}`}>
  조절안 만들기
</button>
```

- "현재 N바이트"는 **소스(등록부의 현재 입력) 바이트**다. 행의 바이트 카운터와 같은 수여야 한다 — 다르면 "왜 여기 숫자가 다르지"라는 새 혼란을 만든다. 색도 같은 규칙(§3)을 그대로 쓴다.
- 목표 입력의 `onBlur`에서 `clampTargetBytes`로 자른다. 타이핑 중에는 자르지 않는다 — 입력 중간에 숫자가 튀면 타이핑이 불편하다.
- "줄이기 / 근거로 보충하기"는 라디오 버튼 의미이므로 `role="radiogroup"` + 각 버튼 `aria-pressed`(또는 `role="radio"` + `aria-checked` — 접근성 트리는 5-9 참고)로 상호 배타를 알린다.
- [조절안 만들기]는 오른쪽 정렬(`self-end`)한다. 계획서 와이어프레임에서 이 버튼만 오른쪽에 떠 있다.

### 5-3. 상태 3 — 보충하기인데 근거 0건

세그먼트 버튼의 "근거로 보충하기" 자체를 `disabled`로 두는 것(5-2에 이미 반영)에 더해, 그 이유를 바로 아래 한 줄로 보여준다:

```
[ 줄이기 ] [ 근거로 보충하기(흐리게) ]
이 영역에 쓸 근거가 없어서 보충할 수 없어요. 근거 정리 보드에서 먼저 모아 주세요.
```

```tsx
{
  kind !== 'expand' && evidenceCount === 0 && (
    <p className="text-xs leading-relaxed text-sp-muted">
      이 영역에 쓸 근거가 없어서 보충할 수 없어요. 근거 정리 보드에서 먼저 모아 주세요.
    </p>
  );
}
```

- **왜 버튼을 완전히 숨기지 않고 흐리게(disabled)만 하는가**: 완전히 숨기면 "보충하기라는 기능이 있는지"조차 모른다. 흐린 버튼 + 이유 문구가 "지금은 못 쓰지만 방법이 있다"를 함께 전달한다 — 이 저장소가 근거 0건일 때 다른 버튼(주제 칩 등)을 다루는 방식과 같다.
- 문구는 원인(근거 0건)과 다음 행동(보드로 가서 모으기)을 한 문장에 담는다. 버튼 링크는 만들지 않는다 — 이 섹션에서 화면 전환까지 하면 책임이 흩어진다(패널은 이미 [미분류 N건] 버튼으로 보드 이동 경로를 갖고 있다).

### 5-4. 게이트(ㄱ) — [조절안 만들기]를 눌렀을 때, 기재 금지 항목이 있으면

[조절안 만들기]를 누르는 즉시 그 버튼 자리가 아래로 바뀐다(실행하지 않은 채):

```
⚠ 기재 금지 항목이 들어 있는 문장이 함께 나갑니다. 먼저 지우시겠어요?

                          [ 먼저 지우러 가기 ]  [ 그대로 보내기 ]
```

```tsx
<div className="flex flex-col gap-2 rounded-lg bg-red-500/5 px-3 py-2 ring-1 ring-red-500/20">
  <p className="flex items-start gap-1 text-xs leading-relaxed text-red-500">
    <span className="material-symbols-outlined text-sm">warning</span>
    기재 금지 항목이 들어 있는 문장이 함께 나갑니다. 먼저 지우시겠어요?
  </p>
  <div className="flex justify-end gap-1.5">
    <button type="button" onClick={cancelToEdit} className={`${btn} bg-sp-card text-sp-text`}>
      먼저 지우러 가기
    </button>
    <button type="button" onClick={proceedAnyway} className={dangerBtn}>
      그대로 보내기
    </button>
  </div>
</div>
```

- **색은 빨강(위험)**. `prohibited_item`은 이미 이 화면에서 `hasRisk`(빨강) 계열로 분류된 깃발이다(`RecordDraftRow`의 `hasRisk` 판정, §3 표 "위험 배너"). 같은 심각도는 같은 색으로 — 이 문서가 새로 정하는 규칙이 아니라 기존 규칙을 따르는 것이다.
- **[먼저 지우러 가기]를 왼쪽·중립색, [그대로 보내기]를 오른쪽·빨강**으로 둔다. `InquiryThreadPanel`의 삭제 확인 패턴(안전한 선택을 중립/왼쪽, 위험을 인정하는 선택을 빨강/강조)과 같은 배치다 — "위험을 인정하고 계속"이 시각적으로 더 무겁게 느껴져야, 무심코 누르는 사고가 줄어든다.
- [먼저 지우러 가기]는 어디로도 이동시키지 않는다(§5-3과 같은 이유 — 화면 전환 책임 분리). 이 섹션 안에서 편집 칸으로 포커스만 옮기거나, 그냥 이 확인을 닫아 선생님이 직접 편집 칸을 고치게 한다. 최소 구현은 "닫기"다.
- [그대로 보내기]를 누르면 이 블록이 사라지고 5-5(실행 중)로 전이한다.

### 5-5. 상태 4 — 실행 중

```
1차 조절 중이에요… (1~2분 걸릴 수 있어요)
```

재조정(2차)이 걸리면:

```
목표에 못 미쳐 자동으로 다시 조절하고 있어요…
```

```tsx
<p className="flex items-center gap-1.5 text-sm text-sp-muted">
  <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
  {attempt === 1
    ? '1차 조절 중이에요… (1~2분 걸릴 수 있어요)'
    : '목표에 못 미쳐 자동으로 다시 조절하고 있어요…'}
</p>
```

- 기존 패널의 실행 안내(`{phase.name} 초안을 쓰는 중이에요…`, 609행)와 어조를 맞춘다. 다만 조절은 학생 이름이 이미 헤더에 있으므로 반복하지 않는다.
- **회전 아이콘은 이 섹션에서 유일하게 쓰는 모션이다.** 실행 중임을 알리는 것 외의 장식적 애니메이션(페이드인, 슬라이드 등)은 쓰지 않는다 — "동작에 답하는 움직임만"이라는 협업 지침을 그대로 따른다.
- 이 상태 동안 목표 입력·모드 버튼·[조절안 만들기]는 `disabled`로 덮는 것이 아니라 **아예 이 블록으로 대체**한다(기존 패널이 실행 중일 때 "시작" 블록 자체를 숨기는 것과 같은 방식, 550행 조건 참고).
- 시간이 오래 걸리는 이유(1~2분)를 처음부터 괄호로 밝혀 둔다 — 진행바가 없는 불확정 대기이므로, 기다림의 이유를 먼저 말해 준다.

### 5-6. 상태 5 — 결과 1개 (판정 `ok`)

```
1,782 → 1,463바이트 · 319바이트 줄임
근거 6건 사용 · 제외 1건                 (근거로 보충하기였을 때만)

┌────────────────────────────────────┐
│ (조절된 글 미리보기)                  │
└────────────────────────────────────┘

[ 원문과 비교 ]                         [ 이 글로 바꾸기 ]
```

```tsx
<div className="flex flex-col gap-2">
  <p className="text-sm font-semibold text-sp-text">
    {sourceBytes.toLocaleString()} → {resultBytes.toLocaleString()}바이트 ·{' '}
    {Math.abs(sourceBytes - resultBytes).toLocaleString()}바이트{' '}
    {resultBytes < sourceBytes ? '줄임' : '늘림'}
  </p>
  {kind === 'expand' && excludedSummary && (
    <p className="text-xs text-sp-muted">{excludedSummary}</p>
  )}

  {compareOn ? (
    <div className="flex flex-col gap-2" aria-label="원문과 비교">
      <p className="text-xs font-semibold text-sp-muted">원문 ({sourceBytes.toLocaleString()}B)</p>
      <p className="whitespace-pre-wrap rounded-lg bg-sp-card px-2 py-1.5 text-sm leading-relaxed text-sp-text ring-1 ring-sp-border">
        {adjustSourceText}
      </p>
      <p className="text-xs font-semibold text-sp-muted">
        조절안 ({resultBytes.toLocaleString()}B)
      </p>
      <p className="whitespace-pre-wrap rounded-lg bg-sp-card px-2 py-1.5 text-sm leading-relaxed text-sp-text ring-1 ring-sp-border">
        {resultText}
      </p>
    </div>
  ) : (
    <p
      className="whitespace-pre-wrap rounded-lg bg-sp-card px-2 py-1.5 text-sm leading-relaxed text-sp-text"
      data-testid="length-adjust-preview"
    >
      {resultText}
    </p>
  )}

  <div className="flex flex-wrap items-center gap-1.5">
    <button
      type="button"
      onClick={() => setCompareOn((v) => !v)}
      aria-pressed={compareOn}
      className={`bg-sp-card text-sp-text ${btn}`}
    >
      {compareOn ? '비교 닫기' : '원문과 비교'}
    </button>
    <button type="button" onClick={applyAdjusted} className={`ml-auto ${primaryBtn}`}>
      이 글로 바꾸기
    </button>
  </div>
</div>
```

- **[원문과 비교]는 왼쪽 위 → 아래 쌓기(1열)로 고정한다.** 사이드 패널이 `w-[380px]`로 고정 폭이라(§7 근거), 기존 [내 글과 비교]처럼 `grid-cols-2`를 쓰면 한쪽 열이 90px 안팎으로 눌린다. "좁은 폭에서는 위아래로 떨어지는 반응형"(계획서 E-3)을 미디어 쿼리 대신 **처음부터 1열**로 만족시킨다 — 이 패널의 폭은 뷰포트가 아니라 사이드바이므로 `md:` 류 브레이크포인트가 아예 걸리지 않는다.
- [이 글로 바꾸기]는 `ml-auto`로 오른쪽 끝에 둔다 — 계획서 와이어프레임이 두 버튼을 좌우로 벌려 그렸고, 오른쪽 = 가장 중요한 다음 행동이라는 기존 패널의 배치 문법(779~787행 "여기서 멈추기"도 `ml-auto`)과 같다.
- 판정에 실제로 쓰는 수치는 **화면이 보여주는 바로 그 숫자**다(`resultBytes`는 앱이 최종 저장 본문으로 다시 센 값, §C-1 원칙 1). 모델이 말한 숫자를 화면에 쓰지 않는다.

### 5-7. 상태 5-2 — 결과 2개 (자동 재조정이 돌았을 때)

```
결과   [ 1차 1,610B ] [ 2차 1,463B ✓ ]

1,782 → 1,463바이트 · 319바이트 줄임
...
```

```tsx
<div className="flex flex-wrap items-center gap-1" role="tablist" aria-label="분량 조절 결과">
  <span className="text-xs text-sp-muted">결과</span>
  {[1, 2].map((n) => (
    <button
      key={n}
      type="button"
      role="tab"
      aria-selected={picked === n}
      onClick={() => setPicked(n as 1 | 2)}
      className={chip(picked === n)}
    >
      {n}차 {candidateBytes[n - 1].toLocaleString()}B{picked === n ? ' ✓' : ''}
    </button>
  ))}
</div>
```

- 탭 스타일은 기존 "판 탭"(675~684행)과 **글자 그대로 같은 클래스**를 쓴다 — 다만 이건 아직 저장되지 않은 두 후보 중 하나를 고르는 자리이므로, 저장된 판이 쌓이는 위쪽 "판(버전) 탭"과는 다른 목록이다(후보 두 개는 아직 `RecordAiDraft`로 저장되지 않았다 — §8 참고). 시각적으로 같아 보이되 의미는 "아직 결정 전"이라는 점이 유일한 차이다.
- 두 후보 중 하나를 고르면 그 아래 요약(`1,782 → …`)·미리보기·버튼 줄이 고른 후보 기준으로 다시 그려진다. 고르지 않은 후보는 [이 글로 바꾸기]를 누르기 전까지 언제든 되돌아가 볼 수 있다 — 화면에는 둘 다 남는다(ADR 결정 7의 "화면에는 둘 다 보인다"를 지키는 자리).
- `✓`는 판이 실제로 적용된 뒤에 붙이는 기존 표기(682행)와 겹치므로, **아직 반영 전에는 `✓` 대신 그냥 굵게(선택됨)만 표시**하고, 실제 `✓`(반영됨)는 5-6의 판이 저장된 이후에만 붙인다. → 위 스니펫의 `picked === n ? ' ✓' : ''`는 "지금 보고 있는 탭" 표시로 오해될 수 있어, 구현 시 `아이콘 없이 굵게`로 바꾸는 것을 권장한다(§11-2에 확인 필요 사항으로 남긴다).

### 5-8. 상태 6 — 결과가 한도 초과(`over-limit`)

```
1,782 → 1,552바이트 · 230바이트 줄임
(미리보기)

저장하려면 52바이트를 더 줄여야 해요.

[ 원문과 비교 ]                    [ 편집칸에 넣기(저장 안 함) ]
```

```tsx
<p className="flex items-center gap-1 text-xs text-red-500">
  <span className="material-symbols-outlined text-sm">error</span>
  저장하려면 {(resultBytes - areaLimit).toLocaleString()}바이트를 더 줄여야 해요.
</p>
<div className="flex flex-wrap items-center gap-1.5">
  <button type="button" onClick={() => setCompareOn((v) => !v)} aria-pressed={compareOn} className={`bg-sp-card text-sp-text ${btn}`}>
    {compareOn ? '비교 닫기' : '원문과 비교'}
  </button>
  <button type="button" onClick={insertToEditorOnly} className={`ml-auto ${primaryBtn}`}>
    편집칸에 넣기(저장 안 함)
  </button>
</div>
```

- [이 글로 바꾸기]를 **완전히 대체**한다(계획서 원문: "대신"). 눌러도 저장이 거부될 버튼을 보여 주지 않는다 — 이건 C0(ㄱ)에서 고친 "반영 실패가 조용히 삼켜지는" 문제를 다른 자리에서 재현하지 않기 위한 것이다.
- 안내 문구는 `text-red-500`(위험이 아니라 "저장 불가"라는 확정된 사실이므로, §3 바이트 카운터의 "한도 초과" 색과 같은 색을 쓴다).
- [편집칸에 넣기]는 그 자체로 이 상태의 유일한 행동이므로 주 버튼(파랑) 색을 그대로 준다. "저장 안 함"이라는 괄호가 이미 버튼 글자 안에 있어, 색만으로 "이게 최종 저장이다"라고 오인할 위험은 낮다.

### 5-9. 상태 7 — 목표만 초과(`over-goal`, 한도 이내)

```
1,782 → 1,540바이트 · 목표보다 40바이트 많음
(미리보기)

[ 원문과 비교 ]                         [ 이 글로 바꾸기 ]
```

```tsx
<p className="text-sm font-semibold text-sp-text">
  {sourceBytes.toLocaleString()} → {resultBytes.toLocaleString()}바이트 · 목표보다{' '}
  {(resultBytes - targetBytes).toLocaleString()}바이트 많음
</p>
```

- 버튼 줄은 5-6(정상)과 **완전히 같다** — 반영을 막지 않는다(계획서 원칙: "한도 이내면 수치만 표시"). 색도 굳이 경고색을 쓰지 않는다. 개인 목표는 강제가 아니라는 원칙(§H 위험표 "1,500을 채우세요류 문구 금지")을 지키려면, 목표 초과를 시각적으로 "잘못"처럼 그리지 않아야 한다 — 담담한 `text-sp-text`로 사실만 말한다.

### 5-10. 상태 8 — 근거 부족으로 짧게 나옴(`under-goal`, `[근거 부족]` 표식 있었음)

```
1,782 → 980바이트 · 목표보다 449바이트 적음
근거가 부족해 목표보다 짧게 작성했어요.
근거 3건 사용 · 제외 0건

(미리보기)

[ 원문과 비교 ]                         [ 이 글로 바꾸기 ]
```

```tsx
<p className="text-sm font-semibold text-sp-text">…</p>
<p className="flex items-center gap-1 text-xs text-sp-muted">
  <span className="material-symbols-outlined text-sm">info</span>
  근거가 부족해 목표보다 짧게 작성했어요.
</p>
```

- 이 상태는 **자동 재조정을 하지 않는다**(계획서 C-1-1 "표식이 있었으면 자동 재조정을 하지 않는다"). 그래서 5-7의 "결과 2개" 탭이 이 경우엔 절대 나타나지 않는다 — `under-goal`이면서 `[근거 부족]` 표식이 없었을 때만(순수히 모델이 짧게 썼을 때만) 재조정 1회가 돈다. 이 구분을 놓치면 "근거가 부족해서 짧다"인데 한 번 더 CLI를 돌려 시간을 낭비하게 된다.
- 색은 `text-sp-muted`(정보, 경고 아님) — 근거 부족은 모델의 실패가 아니라 "지어내지 말라"는 지시를 잘 지킨 결과다. 빨강·호박을 쓰면 마치 무언가 잘못된 것처럼 보인다.

### 5-11. 게이트(ㄴ) — 반영 직전, 그 사이 선생님이 글을 고쳤으면

[이 글로 바꾸기] 또는 [편집칸에 넣기]를 누르는 순간 최신 입력과 `sourceText`를 비교해 다르면, 버튼 자리가 아래로 바뀐다:

```
⚠ 그 사이에 글을 고치셨어요.

                    [ 최신 글로 다시 조절 ]  [ 그래도 이 글로 바꾸기 ]
```

```tsx
<div className="flex flex-col gap-2 rounded-lg bg-amber-500/10 px-3 py-2 ring-1 ring-amber-500/20">
  <p className="text-xs text-amber-600">그 사이에 글을 고치셨어요.</p>
  <div className="flex flex-wrap justify-end gap-1.5">
    <button type="button" onClick={restartWithLatest} className={primaryBtn}>
      최신 글로 다시 조절
    </button>
    <button type="button" onClick={proceedWithStale} className={`bg-sp-card text-sp-text ${btn}`}>
      그래도 이 글로 바꾸기
    </button>
  </div>
</div>
```

- **색은 호박(amber), 빨강이 아니다.** 이건 개인정보·규정 위반이 아니라 "화면 정보가 오래됐다"는 동시성 알림이다 — 이 저장소의 기존 되돌리기 배너(633행)와 같은 심각도·같은 색이다.
- **[최신 글로 다시 조절]을 주 버튼(파랑)으로, [그래도 이 글로 바꾸기]를 중립으로 둔다.** 5-4와 반대 배치다: 5-4는 "위험을 인정하는 쪽"이 특수 색(빨강)을 받아 신중하게 누르도록 했지만, 여기서는 "옛 글 기준으로 덮어써 방금 고친 내용이 사라질 수 있는 쪽"(그래도 이 글로 바꾸기)이 위험한 선택이고, "다시 계산해 안전하게 가는 쪽"(최신 글로 다시 조절)이 권장 경로다. **권장 경로를 주 버튼(파랑, 시각적으로 먼저 눈에 띔)으로 두고, 위험한 경로는 평범한 버튼으로 눌러도 튀지 않게** 한다 — 다만 "그래도 이 글로 바꾸기"는 실행을 막지는 않는다(자동으로 고르지 않는다는 계획서 원칙: 두 선택 모두 항상 누를 수 있어야 한다).
- [최신 글로 다시 조절]을 누르면 5-2(대기)로 돌아가되, 목표·모드 값은 유지한 채 `getSourceText()`를 다시 읽어 실행까지 자동으로 이어가는 편이 손이 덜 간다(선생님이 이미 조절을 원해서 여기까지 왔으므로, 값을 다시 입력하게 하지 않는다). 다만 이 자동 재실행이 §5-4(기재 금지 확인)를 다시 통과해야 하면 그 확인부터 다시 보여준다.

### 5-12. 상태 9 — 실패

세 갈래 모두 5-5(실행 중) 자리를 대체하는 한 줄 안내 + 다시 시도 버튼으로 통일한다:

```
연결이 끊겼어요. 다시 시도해 주세요.                    [ 다시 시도 ]
응답이 오지 않아 멈췄어요. 다시 시도해 주세요.           [ 다시 시도 ]
분량이 바뀌지 않았어요.                                 [ 다시 시도 ]
```

```tsx
<div className="flex items-center gap-2 rounded-lg bg-sp-card px-3 py-2">
  <span className="material-symbols-outlined text-sm text-sp-muted">error_outline</span>
  <p className="flex-1 text-xs leading-relaxed text-sp-muted">{failureMessage}</p>
  <button type="button" onClick={retry} className={`shrink-0 bg-sp-bg text-sp-accent ${btn}`}>
    다시 시도
  </button>
</div>
```

- **연결 끊김·응답 없음(시간 상한)** 문구는 `OWN_AI_ERROR_MESSAGES[kind].draft`를 그대로 재사용한다(새 문구를 만들지 않는다 — 이미 있는 어조를 지킨다). 다만 시간 상한 초과는 계획서 §C-2(4)가 명시한 전용 문구 `응답이 오지 않아 멈췄어요. 다시 시도해 주세요.`를 쓴다.
- **"같은 글이 돌아옴"**은 이 섹션에서 새로 만드는 유일한 실패 문구다: `분량이 바뀌지 않았어요.` 원인 설명(왜 안 바뀌었는지)은 모델이 알려주지 않으므로 추측해서 적지 않는다 — 사실만 말하고 다시 시도를 안내한다.
- 색은 `text-sp-muted`(빨강이 아니다) — 이건 선생님의 잘못도 데이터 위험도 아닌 "그냥 안 됐다"이므로, 5-4·5-8처럼 무겁게 다루지 않는다. 톤은 기존 패널의 "멈춤" 배너(616~628행, `bg-sp-card`+`text-sp-muted`)와 같다.
- 이 상태에서는 후보(있었다면)를 버리고 완전히 5-2(대기)로 돌아갈 수 있는 경로도 필요하다 — [다시 시도] 옆에 작게 `text-sp-muted` 텍스트 버튼으로 "처음부터"를 두는 것을 권장하되 필수는 아니다(§11-3).

### 5-13. 잠금(다른 AI 작업이 실행 중) — 모든 상태에 걸리는 규칙

부모의 공유 잠금(`aiBusyRef`)이 **이 섹션이 시작한 것이 아닌 이유**(초안 생성 큐, [다시 표시])로 걸려 있으면:

```
목표 분량 [1500](흐리게) 바이트
[ 줄이기(흐리게) ] [ 근거로 보충하기(흐리게) ]
다른 AI 작업이 끝나면 이어서 할 수 있어요.
                                          [ 조절안 만들기(흐리게) ]
```

```tsx
<fieldset disabled={lockedByOther} className="contents">
  {/* 5-2의 입력·버튼들 */}
</fieldset>;
{
  lockedByOther && (
    <p className="text-xs text-sp-muted">다른 AI 작업이 끝나면 이어서 할 수 있어요.</p>
  );
}
```

- `<fieldset disabled>`를 쓰면 안의 모든 입력·버튼이 한 번에 비활성화되고 스크린 리더에도 자동으로 전달된다 — 요소마다 `disabled` 조건을 반복해서 붙이는 것보다 안전하다(§9).
- 이 규칙은 5-1(빈 글)·5-5(자기 실행 중)·5-4·5-11(확인 게이트)에는 적용하지 않는다 — 그 상태들은 이미 자기 자신의 흐름을 그리고 있다.

## 6. 색 결정 요약표

| 의미                                        | 색                                                                                     | 근거                                                             |
| ------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 저장 불가(한도 초과, 확정된 사실)           | `text-red-500`                                                                         | 기존 바이트 카운터 규칙과 동일선상(§3)                           |
| 개인정보·규정 위험(기재 금지 확인)          | `bg-red-500/5·10 ring-red-500/20 text-red-500`                                         | `prohibited_item`이 이미 이 화면의 `hasRisk`(빨강) 계열          |
| 동시성 주의(글이 그 사이 바뀜, 판 되돌리기) | `bg-amber-500/10 ring-amber-500/20 text-amber-600`                                     | 기존 되돌리기 배너와 같은 심각도                                 |
| 목표 초과(한도 이내)·근거 부족(정상 동작)   | `text-sp-text`/`text-sp-muted`                                                         | "개인 목표는 강제가 아니다" 원칙 — 경고색을 쓰면 규정처럼 보인다 |
| 실행 실패(연결·시간 상한·무변화)            | `text-sp-muted` (배경 `bg-sp-card`)                                                    | 기존 "멈춤" 배너와 같은 톤 — 선생님 잘못이 아니다                |
| 선택됨(모드 버튼·결과 탭)                   | `bg-sp-accent text-sp-accent-fg` 또는 `bg-blue-500/15 text-sp-accent ring-blue-500/30` | 기존 세그먼트 버튼·판 탭 재사용                                  |

## 7. 간격·레이아웃 결정

- 섹션 전체 폭은 사이드 패널 고정 폭 `w-[380px]`(`RecordDraftSidePanel.tsx` 93행)를 물려받는다. 이 폭 안에서는 2열 그리드가 항상 좁으므로, 이 섹션의 비교 뷰(5-6)는 **처음부터 1열**로 설계했다(그리드가 아니라 `flex flex-col`). 기존 [내 글과 비교](`grid-cols-2`)와 다른 선택이지만, 계획서 E-3이 명시적으로 요구한 "좁은 폭 반응형"을 뷰포트 브레이크포인트 없이 만족하는 유일한 방법이다.
- 카드 안 요소 간격은 `gap-2`(8px, "한 덩어리 안의 요소들"), 헤더와 본문 사이는 카드 패딩(`p-3`=12px)만으로 충분히 분리된다. 버튼 줄은 `gap-1.5`(6px, 인라인 쌍) — 기존 패널과 동일.
- 기본 접힘. 다만 **한도 초과 상태(5-8)로 진입하면 자동으로 펼친다**(구현 시 `useEffect`로 `verdict === 'over-limit'` && 방금 결과가 도착했을 때 1회 `setOpen(true)`). 선생님이 [반영]을 눌렀다가 조용히 실패하는 C0(ㄱ) 유형의 문제를 이 섹션에서 반복하지 않으려면, "여기 조절 기능이 있다"는 것 자체를 그 순간에 보여줘야 한다.

## 8. 데이터 흐름 스케치 (참고용, 비구속)

구현자가 실제 프롭을 정할 때 참고할 수 있는 최소 스케치다. 이름·개수는 확정이 아니다 — 계획서 §C-2·§C-4·§D가 정본이다.

```ts
interface RecordDraftLengthPanelProps {
  readonly area: RecordArea;
  readonly level: SchoolLevel;
  readonly areaLimit: number;
  readonly areaLimitVerified: boolean;
  /** 클릭 시점에 등록부(liveDraftTextRef)에서 새로 읽는다 — 렌더 시점 스냅숏이 아니다(§E-1). */
  readonly getSourceText: () => string;
  readonly evidenceCount: number;
  readonly threadTitle?: string;
  /** 위 4번 블록의 selected가 있고 반영됐으면 "AI 초안 v{n}", 아니면 undefined(→ "직접 작성한 글"). */
  readonly sourceVersionLabel?: string;
  readonly lockedByOther: boolean;
  readonly onRun: (kind: 'shrink' | 'expand', targetBytes: number) => Promise<AdjustRunResult>;
  readonly onApply: (text: string) => Promise<void>;
  readonly onInsertOnly: (text: string) => void;
}
```

**왜 `sourceText`를 문자열 프롭이 아니라 함수로 받는가**: 확인 결과 지금 `RecordDraftAiPanel`에 내려오는 `target.existingText`는 `selectedDraft?.content`(저장된 값)를 `useMemo`로 스냅숏한 것이다(`RecordDraftView.tsx` 499~509행). 타이핑마다 갱신되지 않고, 한도를 넘겨 저장이 거부된 글은 애초에 이 값에 반영되지 않는다. 분량 조절이 봐야 하는 건 화면의 **지금 이 순간** 입력(`liveDraftTextRef` 등록부)이므로, 클릭 시점에 새로 읽는 함수 형태가 맞다 — 이건 계획서 §E-1·§E-2가 이미 요구한 것이고, 이 문서는 그걸 프롭 설계에 반영했을 뿐이다.

## 9. 접근성

- **목표 입력**: `<label>`로 텍스트 "목표 분량"을 감싸 `<input>`과 프로그램적으로 연결하고, `aria-label="목표 분량(바이트)"`을 추가로 붙여 스크린 리더가 단위까지 읽게 한다. `type="number"` + `inputMode="numeric"`으로 모바일 키패드도 숫자로 뜬다.
- **모드 버튼(줄이기/보충하기)**: 바깥 컨테이너에 `role="radiogroup" aria-label="분량 조절 방향"`, 각 버튼에 `aria-pressed`(단순 토글 두 개이므로 `aria-pressed`로 충분 — 기존 세그먼트 버튼도 `aria-pressed`를 쓴다, 559행). 비활성(근거 0건)일 때는 `disabled` 속성을 실제로 걸어 포커스가 가지 않게 한다(시각적 흐림만으로는 스크린 리더 사용자가 눌러 볼 수 있어 혼란스럽다).
- **결과 탭(1차/2차)**: `role="tablist"` + 각 버튼 `role="tab"` `aria-selected` — 기존 판 탭(665행)과 동일 패턴.
- **상태 전환 알림**: 실행 시작·완료·실패는 눈에 보이는 문구 변화만으로는 스크린 리더 사용자가 놓친다. 결과·실패·게이트 문구를 감싸는 컨테이너에 `role="status" aria-live="polite"`를 붙인다(기존 패널의 `notice` 문구가 646행에서 이미 이렇게 하고 있다 — 같은 관례). 게이트(5-4·5-11)처럼 사용자 행동을 반드시 요구하는 경우는 `role="alert"`(assertive)를 쓰는 것을 권장한다 — 기재 금지 확인을 조용히 지나치면 개인정보가 그대로 나갈 수 있다.
- **버튼 라벨**: 아이콘만 있는 버튼은 없다(모두 텍스트를 동반). [편집칸에 넣기(저장 안 함)]처럼 괄호가 붙은 라벨은 그대로 `aria-label` 없이 버튼 텍스트 자체로 충분하다 — 괄호 안 설명이 오히려 스크린 리더에도 유용하다.
- **잠금(5-13)**: `<fieldset disabled>`로 일괄 처리해 포커스가 비활성 요소에 들어가지 않게 한다.
- **키보드 포커스 이동**: [조절안 만들기] → 실행 중 → 결과 전환처럼 컨테이너 내용이 완전히 바뀌는 지점에서, 포커스가 사라진 버튼에 남아 허공을 가리키지 않도록 결과가 도착하면 그 블록의 첫 상호작용 요소(예: [원문과 비교])로 포커스를 옮기는 것을 권장한다(`ref.current?.focus()`, 강제는 아님 — §11-4).

## 10. 하지 말아야 할 것

- **`bg-sp-card/40`처럼 `sp-*` 토큰에 Tailwind 투명도 수식을 붙이지 않는다.** 규칙 자체가 생성되지 않아 배경이 투명해지고 `ring`은 파란 Tailwind 기본색으로 샌다. 반투명이 필요하면 `bg-blue-500/15`·`bg-red-500/10`·`bg-amber-500/10`처럼 Tailwind 기본 팔레트를 쓴다.
- **`rounded-sp-*`나 직각을 쓰지 않는다.** `rounded-lg`(카드·버튼·입력)·`rounded-full`(칩·탭)만 쓴다.
- **em 대시(`—`)를 화면 문구·placeholder·모델에 보낼 문자열에 쓰지 않는다.** 이 파일은 `recordDraftNoEmDash.meta.test.ts`의 대상 폴더(`RecordDraft/**`) 안에 있어 자동으로 검사된다. 쌍점(`:`)이나 가운뎃점(`·`)을 대신 쓴다(기존 패널이 이미 그렇게 하고 있다, 예: "1,782바이트로 한도 1,500바이트를 넘었습니다").
- **`DRAFT_TEXT_METRICS`를 미리보기·비교 상자에 붙이지 않는다.** 그건 편집 칸과 형광펜 레이어를 픽셀 단위로 맞추는 정렬 전용 클래스 묶음(`px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words border rounded-lg`)이지 일반 타이포 규격이 아니다. 이 섹션의 미리보기는 기존 AI 판 미리보기와 같은 `whitespace-pre-wrap rounded-lg bg-sp-card px-2 py-1.5 text-sm leading-relaxed text-sp-text`를 쓴다(§3).
- **`text-[0.x rem]` 같은 임의 rem 글자 크기를 쓰지 않는다.** 최소 `text-xs`, 본문·미리보기는 `text-sm` 이상. `recordDraftFontScale.meta.test.ts`가 이 폴더 전체를 스캔한다.
- **모달·`createPortal`을 쓰지 않는다.** 이 섹션 전체와 두 확인 게이트(5-4·5-11) 모두 접힌 카드 안 인라인 블록이다. 유리 모드의 `backdrop-filter`가 화면 고정 요소(모달)를 가두는 문제를 다시 만들지 않는다.
- **두 확인 게이트를 자동으로 고르지 않는다.** 시간이 지나도, 다른 버튼을 눌러도 자동으로 한쪽을 선택 처리하지 않는다 — 선생님이 명시적으로 버튼을 눌러야 다음 단계로 간다.
- **"1,500바이트를 채우세요" 류의 목표 강제 문구를 쓰지 않는다.** 목표는 기본값일 뿐 규정이 아니다(§H 위험표).
- **[뒤에 붙이기]를 이 섹션의 결과에 붙이지 않는다.** 계획서 C-3-1이 명시적으로 숨기라고 한 버튼이다 — 합산이 거의 항상 한도를 넘어 저장이 거부된다.
- **결과가 한도 초과일 때 [이 글로 바꾸기]를 그대로 두고 disabled만 걸지 않는다.** [편집칸에 넣기(저장 안 함)]로 **교체**한다 — 계획서 원문이 "대신"이라고 못 박았다.
- **소스 텍스트를 `useMemo`로 렌더 시점에 캐시해 쓰지 않는다.** [조절안 만들기]를 누르는 그 순간 등록부에서 새로 읽는다(§8).

## 11. 구현자 확인이 필요한 설계 가정

이 문서가 계획서에 없는 부분을 메우며 임의로 정한 것들이다. 구현 착수 전, 혹은 구현 중 애매하면 아래 순서로 가볍게 재확인하고 넘어갈 것 — 승인을 기다리며 멈추지 않아도 되는, 바꾸기 쉬운 항목들이다.

1. **"대상: AI 초안 v2" 라벨 산출 규칙**(§5-0): 이 문서는 "4번 블록의 `selected`가 `appliedAt`을 가지면 그 버전 이름, 아니면 '직접 작성한 글'"로 가정했다. 계획서 와이어프레임에는 이 라벨이 어떻게 정해지는지 규칙이 없었다 — 순수 표시용이라 계산에 영향을 주지 않지만, 구현하다 더 간단한 소스(예: 그냥 항상 "직접 작성한 글"로 두고 이 라벨 자체를 다음 버전으로 미루기)가 보이면 그쪽으로 단순화해도 된다.
2. **결과 탭(5-7)의 `✓` 표기 시점**: 저장된 판의 `✓`(682행, "반영됨")와 헷갈리지 않도록, 아직 반영 전인 후보 탭에는 `✓`를 쓰지 말고 굵은 글씨로만 "선택됨"을 표시할 것을 권장했다. 실제 구현 시 두 `✓`가 화면에 동시에 보이는 경우가 없는지(4번 블록과 이 섹션이 같은 화면에 있으므로) 확인할 것.
3. **실패 상태(5-12)에서 "처음부터" 링크의 필요 여부**: 선택 사항으로 남겼다. QA에서 [다시 시도]만으로 충분한지 확인하고, 후보가 남아 화면이 꼬이면 추가한다.
4. **결과 도착 시 포커스 이동(§9 마지막 항목)**: 강제 요구 사항이 아니다. 스크린 리더 QA에서 필요성이 확인되면 넣는다.
5. **접이식 기본 접힘 + 한도 초과 시 자동 펼침(§7)**: `open` 상태를 이 컴포넌트 로컬 `useState`로 둘지, 계획서의 다른 등록부처럼 부모가 들지는 계획서에 규정이 없다. 로컬 상태로 시작해도 무방하다 — 여러 학생을 오갈 때 접힘 상태가 학생마다 초기화되는 것이 오히려 자연스럽다(패널 자체가 `key`로 학생마다 새로 만들어진다).

## 12. 검증과의 접점

- 이 섹션이 새 화면 문구를 추가하는 파일은 `recordDraftFontScale.meta.test.ts`·`recordDraftNoEmDash.meta.test.ts` 두 메타 테스트의 스캔 대상 폴더(`RecordDraft/**`) 안에 있다 — 별도 등록 없이 자동으로 걸린다.
- 모델에게 가는 지시문(`recordDraftPack.ts`)의 em 대시 검사는 `EXTRA_FILES`에 이미 등록되어 있다(§C-1 확인). 이 UI 설계 문서가 다루는 것은 화면 쪽뿐이다.
