# 관찰 입력 재배치 · 주제 연결(ObservationTopicPicker) 설계서

- 상태: 설계 완료, 구현 전. 코드는 건드리지 않았다(설계 문서만).
- 작성일: 2026-09-07
- 선행: [관찰 입력 → 주제별 근거 정리 계획](../../01-plan/features/observation-evidence-flow.plan.md) §4.1·§4.2(확정 계약, 재기획 아님) · [근거 정리 보드 2차 설계서](record-evidence-board-v2.design.md)(톤 참고)
- 적용 화면: `src/adapters/components/ClassManagement/ObservationForm.tsx`(교과), `src/adapters/components/Homeroom/Records/InputMode.tsx`(담임)의 저장 폼. 담임 원본 조회 편집(`InlineRecordEditor.tsx`)의 장면 편집도 포함.
- 범위 밖: 계획의 S1(저장·잠금·실패 계약), S3(같은 학생 왕복·원본 진입), S4(원본 비교). 이 문서는 계획 §6 단계표의 **S2(본문 우선 입력·선택 주제)** 화면 몫만 다룬다. 출결 입력 화면은 재배치 대상이 아니다(계획 §4.1).
- `ObservationTopicPicker`가 실제로 근거를 저장하는 관문(`ensureEvidenceFromSource`, `moveToNewThread` 등)은 S1 산출물이다. 이 문서는 그 관문이 있다고 가정하고 **호출 계약(props)**만 정의한다. S1이 아직 없으면 구현자는 임시로 board가 쓰는 기존 `useRecordEvidenceStore`/`useInquiryThreadStore` 공개 함수를 직접 불러 임시 배선하되, 계획 §5.1의 순서(원본 저장 성공 → 근거 연결)를 어기지 않는다.

## 0. 한 줄

지금은 "분류부터 고르고 본문은 맨 나중"이라 교사가 쓰기도 전에 분류를 고민한다. 바뀐 뒤에는 "쓰고, 필요하면 장면 고르고, 이어 쓰는 주제가 있으면 그거 하나만 누르고, 나머지는 접혀 있다"가 된다.

## 1. 화면 골격

### 1-1 교과 입력 — `ObservationForm.tsx`

**지금(before)**

```
[날짜]                                          [글자수]
[분류: 칩들 + 직접 추가]
[태그: 칩들 + 직접 추가]
[본문 textarea — placeholder "관찰한 내용이나 학생부에 참고할 내용을 적어 주세요"]
[어떤 장면인가요?: 칩들 + 직접 추가]
[첨부 자료 영역]
[기록 저장 버튼]
```

**바뀐 뒤(after)**

```
[날짜]                                          [글자수]
[관찰 내용 — 레이블 + 본문 textarea, 학생 전환 시 자동 포커스]
  placeholder: "학생이 한 말과 행동, 그 뒤 달라진 점을 적어 주세요"
[어떤 장면인가요?(선택): 칩들 + 직접 추가]
[ObservationTopicPicker — 주제 연결(선택)]
[▾ 분류·태그 (접힘, 기본 닫힘)]
  펼치면: 분류 칩들 + 태그 칩들 + 직접 추가 입력
[첨부 자료 영역]
[기록 저장 버튼]
```

- 교과는 분류에 기본값(`DEFAULT_OBSERVATION_CATEGORIES[0]`, '수업 관찰')이 항상 있고 저장을 막지 않으므로 **분류·태그 전체를 접는다.** 접힌 줄에는 현재 선택값을 그대로 보여준다: `분류: 수업 관찰 · 태그 0개 ▾`(펼치기 버튼 겸용, 클릭하면 펼쳐짐).
- 본문 위 레이블은 `<p className="text-xs font-semibold text-sp-muted">`로 "관찰 내용"을 붙인다(기존 '분류'·'어떤 장면인가요?' 레이블과 같은 톤). 접두 문구 없이 placeholder만 있던 지금 구조에서 레이블을 새로 추가하는 것이다.
- 첫 마운트·학생 전환 시 포커스는 지금처럼 `textareaRef.current?.focus()`를 유지한다(대상 요소만 재배치되지 위치가 바뀌는 게 아니므로 로직 변경 없음).
- 말로 쓰기(`VoiceTypingButton`)·학생별로 나누기 단추는 첨부 영역 줄에 그대로 둔다(계획이 이 위치를 지정하지 않음).

### 1-2 담임 입력 — `Homeroom/Records/InputMode.tsx` (중앙 열)

담임은 분류가 상담 방법·후속 조치·날짜 모드까지 게이팅하므로 교과처럼 통째로 접을 수 없다. 계획 §4.1의 지시("선택 상태를 한 줄에 항상 보이고 상세 입력만 접는다")를 아래처럼 둘로 쪼갠다.

**지금(before, 중앙 열 상단부터)**

```
[카테고리 헤더 + 템플릿 select]
[분류: 칩들(단일 선택)]
[상담 방법: counseling일 때만]
[태그(선택): 칩들 + 직접 추가]
[어떤 장면인가요?(선택): 칩들 + 직접 추가]
[메모 textarea + 크게 보기 버튼]
[말로 쓰기]
[첨부 자료 영역]
[여러 날 등록: 날짜 모드]
[후속 조치(접힘)]
```

**바뀐 뒤(after)**

```
[분류 상태 줄 — 항상 보임]
  펼치기 전: "분류: 미선택 · 상세 정보 ▾" 또는 "분류: 상담 · 태그 2개 ▾"
  (미선택 상태에서도 줄 자체는 항상 있다 — 저장 가능 조건이라 숨기지 않는다)
[관찰 내용 — 레이블 + 메모 textarea, 크게 보기 버튼]
  placeholder: "학생이 한 말과 행동, 그 뒤 달라진 점을 적어 주세요"
  (담임 전용 도움말 아이콘 hover/포커스 시: "역할 수행, 관계, 자율·진로 활동도 좋아요")
[말로 쓰기]
[어떤 장면인가요?(선택): 칩들 + 직접 추가]
[ObservationTopicPicker — 주제 연결(선택)]
[▾ 분류·상세 정보 (펼침 상태는 위 "분류 상태 줄"과 연동)]
  펼치면: 템플릿 select + 분류 칩 + 상담 방법(counseling일 때만) + 태그 칩 + 여러 날 등록(날짜 모드) + 후속 조치
[첨부 자료 영역]
[저장 버튼]
```

- "분류 상태 줄"과 "▾ 분류·상세 정보" 아코디언은 **같은 펼침 상태를 공유하는 하나의 단위**다. 위쪽 요약 줄을 누르면 펼쳐지고, 본문 다음에 있는 아코디언 헤더를 눌러도 같은 상태가 토글된다. 구현은 상태 하나(`const [detailOpen, setDetailOpen] = useState(false)`)로 충분하다. 굳이 둘로 보이는 이유는 "지금 뭘 골랐는지"를 스크롤 없이 위에서 바로 보게 하기 위해서다.
- 날짜 모드(단일/범위/다중)는 계획이 이동을 지시하지 않았다. §5(구현 주의)에서 별도 판단 항목으로 남긴다.
- 여러 날짜(다중/범위, 2일 이상 선택)나 여러 학생을 고른 상태에서는 `ObservationTopicPicker`가 비활성 안내 모드로 전환된다(§2-3의 "다학생 또는 여러 날짜" 행).
- 상담 후속 조치(`showFollowUp`)는 지금처럼 아코디언 안에서 별도 하위 토글로 유지한다(이번 재배치로 위치만 상세 정보 블록 안으로 들어갈 뿐 동작 변경 없음).

### 1-3 공통 규칙 재확인

- 순서: `학생·날짜 → 관찰 내용 → 관찰 장면(선택) → 주제 연결(선택) → 분류·태그/상담 등 부가 정보 → 첨부 → 저장`.
- 주제/장면 미선택으로 저장을 막지 않는다(기존과 동일 — 이번 변경은 순서만 바꾼다).
- 두 화면 모두 안내 placeholder는 "학생이 한 말과 행동, 그 뒤 달라진 점을 적어 주세요"로 통일한다. 담임 전용 예시(역할 수행·관계·자율/진로)는 별도 도움말 아이콘(`info` 머티리얼 아이콘, `title` 속성)로 뺀다 — placeholder 자체를 늘리면 한 줄이 넘어가 잘린다.

## 2. `ObservationTopicPicker`

### 2-1 목적과 배치

저장 전에 "이 기록을 이어 쓰는 주제가 있는지" 한 번 묻는 보조 입력이다. 새 파일 제안 경로: `src/adapters/components/RecordDraft/ObservationTopicPicker.tsx`(계획 §6 S2 파일 표와 동일). `RecordDraft` 폴더 밑에 두는 이유는 `useInquiryThreadStore`·`InquiryThread` 개념이 이미 그 폴더의 근거 보드 쪽 도메인이기 때문이다(교과/담임 두 입력 화면이 같은 컴포넌트를 import).

### 2-2 Props 계약(제안)

```ts
interface ObservationTopicPickerProps {
  /** 담임 = Student.id, 교과 = 'tc:{classId}:{studentKey}' — RecordEvidence/InquiryThread와 동일 체계. null이면 학생 미선택. */
  readonly studentRef: string | null;
  /** 교과 컨텍스트에서만 존재. 담임은 undefined. */
  readonly classId?: string;
  /** allSlotsForContext와 같은 축의 컨텍스트 구분자. */
  readonly context: 'teaching' | 'homeroom';
  /** 현재 입력 중인 본문 — 비어 있으면 선택기 자체를 비활성화한다. */
  readonly content: string;
  /** 다학생 또는 다날짜(단일이 아님)일 때 true — 선택기를 안내 문구로 대체한다. */
  readonly multiTarget: boolean;
  /** 컨트롤드 값. 폼이 들고 있다가 저장 시 그대로 저장 관문에 넘긴다. */
  readonly selectedThreadId: string | null;
  readonly onSelectThread: (threadId: string | null) => void;
}
```

- 상태(로딩/에러/목록)는 컴포넌트 내부에서 `useInquiryThreadStore`를 직접 구독한다(`loaded`, `loadError`, `getOpenByStudentRef`, `add`). 부모 폼이 주제 목록을 따로 들고 있지 않는다 — 폼은 **선택된 id 하나**만 안다.
- `studentRef`가 바뀌면(학생 전환) 내부에서 `selectedThreadId`를 지우라고 강제하지 않는다. 계획 §4.2 "학생 전환" 행에 따라 **새 학생에 이전 선택을 복사하지 않는 책임은 부모 폼**에 있다(학생 전환 시 폼 리셋 로직 안에 `onSelectThread(null)` 한 줄을 포함시킨다). Picker는 받은 `selectedThreadId`가 새 `studentRef`의 열린 주제 목록에 없으면 화면에는 표시하지 않되, 부모가 지우기 전까지 값 자체를 임의로 `null`로 되돌리지 않는다(제어 컴포넌트 원칙 — 값 소유자는 부모).
- 저장 시점 재검증(닫힌 주제로 바뀌었는지 등)은 Picker의 책임이 아니라 S1 저장 관문의 책임이다(계획 §4.2 "닫힌 주제" 행 마지막 문장, §5.1-5). Picker는 선택 UI만 제공한다.

### 2-3 상태표

계획 §4.2 표를 화면 동작으로 옮긴 것이다. 문구는 계획 원문을 그대로 쓴다(임의로 표현을 순화하지 않는다).

| #                                          | 상태                              | 트리거 조건                                                                                               | 보이는 것                                                                            | 문구                                                                                                              | 가능한 행동                                                                                                                                                                   | 비활성 조건                                                                          |
| ------------------------------------------ | --------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1                                          | 기본                              | `studentRef` 있음, `content.trim()` 있음, `multiTarget=false`, 목록 로드 완료, 열린 주제 0건 또는 여러 건 | 헤더 한 줄 + 목록(있으면) + "새 주제 만들기" 보조 항목                               | "주제 연결(선택) · 나중에 근거 보드에서 묶어도 돼요"                                                              | 목록에서 하나 클릭 → 선택. 다시 클릭 → 선택 해제. "새 주제 만들기" 클릭 → §2-4 대화상자                                                                                       | 없음(항상 활성)                                                                      |
| 2                                          | 학생 미선택 · 주제 로딩           | `studentRef === null` 또는 `useInquiryThreadStore.loaded === false`                                       | 헤더만, 선택 영역은 회색 스켈레톤 또는 빈 상태                                       | 학생 미선택: 헤더 문구 그대로, 목록 자리에 "학생을 먼저 선택하세요"(옅은 색). 로딩 중: 목록 자리에 "불러오는 중…" | 없음(클릭 불가)                                                                                                                                                               | 선택기 전체 비활성. 원본 저장 버튼은 이 상태와 무관하게 활성 유지                    |
| 2'                                         | 로딩 실패                         | `loadError !== null`                                                                                      | 헤더 + 오류 줄                                                                       | "주제를 불러오지 못했습니다 · 다시 시도"                                                                          | "다시 시도" 클릭 → `useInquiryThreadStore.load(true)` 재호출                                                                                                                  | 목록·새 주제 만들기 비활성. 원본 저장은 이 오류와 무관하게 계속 가능(§0 전제와 동일) |
| 3                                          | 단일 학생 · 단일 날짜 · 본문 있음 | 1의 조건과 동일(상태 1의 발동 조건을 명시적으로 부연)                                                     | 같은 studentRef·classId의 열린 주제를 **최근 수정 순**으로 정렬한 칩/행 목록         | (헤더는 기본과 동일)                                                                                              | 목록 클릭 → 선택. "새 주제 만들기"는 목록 아래 보조 항목(시각적으로 더 옅게 — 주가 아니라 부)                                                                                 | 없음                                                                                 |
| 4                                          | 새 주제(대화상자 진입)            | "새 주제 만들기" 클릭                                                                                     | §2-4의 작은 대화상자                                                                 | "새 주제 만들기"                                                                                                  | 이름 입력 → 만들기(확정 전 저장소 쓰기 0회). 기존 유사 이름 클릭 시 그 주제를 바로 선택(새로 만들지 않음)                                                                     | 이름 빈 문자열이면 "만들기" 비활성                                                   |
| 5                                          | 닫힌 주제                         | "마친 주제 포함" 토글 켬                                                                                  | 기본 목록과 시각적으로 구분되는 별도 섹션(흐린 톤 + "닫힌 주제" 배지)                | 목록 자체에는 별도 안내 문구 없음(보드의 닫힌 주제 배지 스타일 재사용)                                            | 클릭해도 즉시 선택되지 않는다 → "주제를 다시 열고 연결" 확인 버튼 노출 → 클릭 시 `useInquiryThreadStore.update(id, { status: 'open' })` 성공 후에만 `onSelectThread(id)` 호출 | 다시 열기 진행 중에는 그 항목만 비활성(스피너)                                       |
| 6                                          | 학생 전환                         | 부모가 `studentRef`를 바꿔 리렌더                                                                         | 목록이 새 studentRef 기준으로 재조회됨                                               | (해당 없음 — 별도 문구 없이 목록만 갱신)                                                                          | 새 목록에서 다시 고른다. 이전 선택은 부모가 `onSelectThread(null)`로 지운 뒤이므로 화면엔 아무것도 선택돼 있지 않다                                                           | 새 목록 로딩 중에는 상태 2와 동일하게 표시                                           |
| (참고) 다학생 또는 여러 날짜               | `multiTarget=true`                | 목록 전체를 안내 문구로 대체                                                                              | "여러 학생·날짜 기록은 저장 후 학생별 근거 보드에서 묶어 주세요"                     | 없음(선택 UI 자체를 그리지 않음)                                                                                  | 항상 비활성 — Picker는 이 상태에서 `selectedThreadId`를 읽지 않고 부모도 일괄 저장에 넘기지 않는다(계획 §4.2 표 그대로)                                                       |
| (참고) 저장 도중 주제 삭제 · 소유권 불일치 | 저장 관문(S1)이 실패를 반환       | Picker 바깥, **저장 결과 배너**에 표시(§1의 저장 버튼 하단)                                               | "기록은 저장됐지만 주제에 연결하지 못했습니다" + "주제 다시 선택" + "근거 보드 열기" | "주제 다시 선택" 클릭 → 폼은 그대로 두고 Picker를 다시 활성 상태로(선택값만 초기화)                               | 이 상태는 Picker 컴포넌트 자체의 렌더 상태가 아니라 **부모 폼의 저장 결과 상태**다. Picker는 이 문구를 그리지 않는다                                                          |

- 본문이 비어 있을 때(`content.trim() === ''`)는 위 표의 어떤 상태보다 우선한다: 헤더 문구를 "주제 연결(선택)"에서 **"내용을 적으면 주제에 연결할 수 있어요"**로 바꾸고 목록·새 주제 만들기 모두 비활성화한다. 이 조건은 `studentRef`·로딩 상태와 별개로 항상 먼저 검사한다.
- "마친 주제 포함" 토글은 기본적으로 꺼져 있다(닫힌 주제는 기본 목록에서 제외 — 계획 원문). 토글 자체는 목록이 비어 있지 않을 때만 노출한다.
- 영역(생기부 영역) 문구: Picker는 영역을 다루지 않는다. 목록·대화상자 어디에도 영역 선택 UI를 넣지 않는다. 선택 완료 후 헤더 아래 보조 줄로 "생기부 영역은 근거 보드에서 고를 수 있어요"를 1회만 표시한다(주제를 실제로 골랐을 때만 — 안 고르면 이 줄 자체가 없다). "AI 제외"·"영역 미지정"을 여기서 안내하지 않는다(계획 원문 그대로).

### 2-4 "새 주제 만들기" 대화상자

계획 요구: "이름만 받는 작은 대화상자. 검색 가능한 동명 주제를 먼저 제시하고 중복 이름 자동 병합은 하지 않음. 확정 전에는 저장소 쓰기 0회." + AC-18 "focus trap·Esc·원래 포커스 복귀·한국어 이름".

**기존 코드와의 차이(중요)**: 보드(`RecordEvidenceBoard.tsx`)의 `InquiryThreadCreate` + `createPopover`는 `data-sp-floating` 포털만 쓰고 **실제 포커스 트랩(Tab 순환 차단)과 닫을 때 포커스 복귀가 구현돼 있지 않다**(수동 `onKeyDown`의 Escape 처리만 있음). 이번 대화상자는 그 패턴을 그대로 베끼지 않는다. 대신 이미 포커스 트랩·복귀·바디 스크롤 잠금을 갖춘 공용 `Modal`(`src/adapters/components/common/Modal.tsx`, `focus-trap-react` 기반)을 재사용한다. `useTextPrompt`(`src/adapters/components/common/TextPromptModal.tsx`)가 이미 이 조합(Modal + createPortal(document.body))을 쓰고 있으므로 그 배선을 그대로 따른다.

**구조 제안**: `ObservationTopicPicker.tsx` 안에 내부 서브컴포넌트 `ObservationTopicCreateDialog`를 두거나 별도 파일로 뺀다(구현자 판단, §6).

```
createPortal(
  <Modal isOpen onClose={closeAndRestoreFocus} title="새 주제 만들기" size="sm">
    <div className="flex flex-col gap-3 px-6 pb-6 pt-2">
      <div>
        <label htmlFor="topic-name" className="mb-1.5 block text-sm font-sp-medium text-sp-text">
          주제 이름
        </label>
        <input id="topic-name" autoFocus ... placeholder="예: 할인 문구와 선택" />
      </div>
      {matchingExisting.length > 0 && (
        <div className="rounded-lg bg-sp-surface p-2 ring-1 ring-sp-border">
          <p className="mb-1 text-xs text-sp-muted">비슷한 이름의 주제가 있어요. 이걸 선택할까요?</p>
          {matchingExisting.map(t => (
            <button onClick={() => selectExisting(t.id)}>{t.title}</button>
          ))}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel}>취소</button>
        <button onClick={submit} disabled={name.trim().length === 0}>만들기</button>
      </div>
    </div>
  </Modal>,
  document.body,
)
```

- `matchingExisting` = 현재 studentRef의 **열린 주제** 중 입력 중인 이름과 대소문자 무시 부분일치(`title.includes(input.trim())` 양방향)하는 목록. **자동으로 골라주지 않는다** — 클릭해야 그 기존 주제가 선택되고, 이 경우 새로 만들지 않는다(`onSelectThread(existing.id)` 후 대화상자 닫기, `add` 호출 없음).
- "만들기" 버튼을 누르면 매칭 목록에 같은 이름이 있어도 **항상 새 주제를 만든다**(계획: "중복 이름 자동 병합은 하지 않음"). 병합 여부 판단은 교사 몫이다.
- 확정 전 저장소 쓰기 0회: `name` 입력 중에는 어떤 store 함수도 호출하지 않는다. `matchingExisting` 계산은 이미 로드된 `getOpenByStudentRef(studentRef)` 결과에 대한 순수 필터라 새 읽기가 아니다.
- 만들기 확정 시점의 실제 쓰기(`useInquiryThreadStore.add`)와 근거 연결(`ensureEvidenceFromSource` + `moveToNewThread` 계열)은 **S1 저장 관문이 저장 시점에 수행**한다(계획 §5.1-7 "새 주제는 저장된 근거가 확보된 뒤"). 즉 이 대화상자의 "만들기"는 **주제 생성 자체를 즉시 실행하지 않고**, `onSelectThread`에 "이번엔 새 이름으로 만들 것"이라는 의도를 넘기는 형태가 자연스럽다. 두 가지 구현 방식이 있고 최종 선택은 구현자 몫이다:
  - (A) `selectedThreadId`를 실제 id 대신 `{ mode: 'new', title: string }` 같은 판별 유니온으로 확장한다(Props 타입 변경 필요).
  - (B) 대화상자 확정 시 그 자리에서 `add()`를 호출해 빈 주제를 먼저 만들고 `onSelectThread(newId)`로 넘긴다. 저장 취소/실패 시 그 빈 주제가 남는 문제가 생기므로 **계획 §5.1-9의 보상 삭제 계약과 반드시 맞물려야 한다**(같은 시도 ID 체계로 미사용 주제를 정리).
  - 계획 원문("확정 전 저장소 쓰기 0회", "실제 생성은 기록 저장 후 연결 단계")은 (A)를 더 강하게 시사한다. 이 문서는 (A)를 권고하되, S1 계약의 정확한 타입 설계는 S1 담당자와의 교차 확인이 필요하다고 명시한다(§6).
- 닫기 동작(`onCancel`, `Esc`, backdrop 클릭)은 모두 `Modal`의 `onClose` 하나로 모인다. `Modal`은 이미 `returnFocusOnDeactivate: true`로 원래 포커스(= "새 주제 만들기" 트리거 버튼)를 복귀시킨다 — 추가 구현 불필요.
- `aria-label`은 Modal의 `title` prop("새 주제 만들기")이 자동으로 `aria-labelledby`에 연결되므로 별도 지정이 필요 없다.

### 2-5 닫힌 주제 다시 열기 세부

- "마친 주제 포함" 토글 → 닫힌 주제 섹션 노출 → 항목 클릭 시 즉시 선택되지 않고 그 항목 안에 "이 주제를 다시 열고 연결" 버튼이 인라인으로 나타난다(별도 대화상자 없음 — 계획이 오버헤드를 요구하지 않음).
- 버튼 클릭 → `useInquiryThreadStore.update(id, { status: 'open' })` → 성공 시에만 `onSelectThread(id)`. 실패 시 그 항목에 "다시 열지 못했습니다" 인라인 오류(토스트 아님 — 여러 항목이 있을 수 있어 어느 것이 실패했는지 항목 옆에 있어야 함).
- 저장 직전 이 주제가 다른 경로에서 다시 닫혔을 경우의 재검사는 S1 저장 관문 책임(계획 §4.2 "선택 후 다른 경로에서 닫혔어도 저장 직전 재검사").

## 3. 토큰·클래스 명세

기존 두 입력 화면이 이미 쓰는 팔레트를 그대로 따른다. 새로 만드는 값은 없다.

| 요소                                  | 클래스                                                                                                                                                                                                                                                                                                                                                               | 비고                                                                                                                                                                                      |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 관찰 내용 레이블                      | `text-xs font-semibold text-sp-muted mb-1.5`                                                                                                                                                                                                                                                                                                                         | 기존 '분류' 레이블(`ObservationForm.tsx` 464행)과 동일 톤                                                                                                                                 |
| 본문 textarea                         | `w-full bg-sp-bg border border-sp-border rounded-lg px-3 py-2 text-sm text-sp-text placeholder:text-sp-muted resize-none focus:outline-none focus:border-sp-accent`(교과) / `w-full h-20 bg-sp-surface border border-sp-border rounded-lg p-3 pr-9 text-sm text-sp-text placeholder-sp-muted resize-none focus:outline-none focus:ring-1 focus:ring-sp-accent`(담임) | 기존 클래스 그대로 유지 — 위치만 이동                                                                                                                                                     |
| 분류·태그 아코디언 헤더               | `flex items-center gap-1.5 text-xs text-sp-muted hover:text-sp-text transition-colors` + `material-symbols-outlined text-sm transition-transform ${open ? 'rotate-180' : ''}`(`expand_more`)                                                                                                                                                                         | 기존 '후속 조치 추가' 토글(`InputMode.tsx` 1037행 부근)과 동일 패턴 재사용                                                                                                                |
| 분류 상태 줄(담임, 항상 보임)         | `flex items-center gap-2 text-xs text-sp-text bg-sp-surface/50 rounded-lg px-2.5 py-1.5`                                                                                                                                                                                                                                                                             | 선택값 텍스트는 `font-medium text-sp-text`, 미선택은 `text-sp-muted`                                                                                                                      |
| ObservationTopicPicker 컨테이너       | `rounded-lg border border-sp-border bg-sp-surface/40 p-2.5 space-y-1.5`                                                                                                                                                                                                                                                                                              | 카드 안에 얹히는 보조 섹션이므로 `bg-sp-card`보다 한 단계 낮은 톤(보드의 거울 카드 배경 원칙과 같은 결)                                                                                   |
| Picker 헤더 문구                      | `text-xs text-sp-muted`                                                                                                                                                                                                                                                                                                                                              | "주제 연결(선택) · 나중에 근거 보드에서 묶어도 돼요"                                                                                                                                      |
| 열린 주제 목록 항목(칩)               | `inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors` + 선택 시 `bg-sp-accent text-white`, 비선택 `bg-sp-card text-sp-text ring-1 ring-sp-border hover:bg-sp-surface`                                                                                                                                                      | `bg-sp-accent text-white`는 `index.css` 512행 규칙으로 라이트 모드에서 `--sp-accent-fg`로 자동 치환되는 **보호된 조합**이다(부모-자식 1단계 이내에서만 유효 — 중첩 wrapper를 넣지 않는다) |
| 닫힌 주제 섹션 배지                   | `rounded-full bg-sp-card px-2 py-0.5 text-xs font-semibold text-sp-muted ring-1 ring-sp-border`                                                                                                                                                                                                                                                                      | `InquiryThreadPanel.tsx` 125행의 "닫힌 주제" 배지와 동일 클래스 재사용                                                                                                                    |
| "새 주제 만들기" 보조 항목            | `inline-flex items-center gap-1 rounded-full border border-dashed border-sp-border px-2.5 py-1 text-xs font-medium text-sp-muted hover:text-sp-accent hover:border-sp-accent/50`                                                                                                                                                                                     | 목록 안에서 시각적으로 옅은 위치(주가 아니라 부)                                                                                                                                          |
| 로딩 스켈레톤                         | `h-6 w-24 animate-pulse rounded-full bg-sp-surface` × 2~3개                                                                                                                                                                                                                                                                                                          | 별도 스피너 아이콘 없이 스켈레톤만(계획이 로딩 UI 세부를 지정하지 않음 — 기존 앱의 스켈레톤 관용구 재사용)                                                                                |
| 오류 줄 + 다시 시도                   | `flex items-center gap-1.5 text-xs text-red-400` + 버튼 `text-sp-accent font-medium hover:underline`                                                                                                                                                                                                                                                                 | "주제를 불러오지 못했습니다" 다음 " · " 대신 계획 원문 그대로 가운데 점(`·`) 사용(em dash 금지, 이 표현은 원문에도 dash가 아니라 가운데 점이다)                                           |
| 비활성 안내(다학생/다날짜, 본문 없음) | `text-xs text-sp-muted/70`                                                                                                                                                                                                                                                                                                                                           | `PendingAttachmentArea`의 `disabledHint` 스타일과 동일                                                                                                                                    |
| 대화상자(Modal)                       | `<Modal size="sm">` 그대로, 내부 패딩 `px-6 pb-6 pt-2`                                                                                                                                                                                                                                                                                                               | §2-4 참조                                                                                                                                                                                 |
| 대화상자 입력                         | `w-full rounded-lg border border-sp-border bg-sp-bg px-3.5 py-2.5 text-sm text-sp-text placeholder-sp-muted focus:border-sp-accent focus:outline-none`                                                                                                                                                                                                               | `TextPromptModal.tsx` 93행과 동일                                                                                                                                                         |
| 매칭 기존 주제 미니 목록              | `rounded-lg bg-sp-surface p-2 ring-1 ring-sp-border` + 항목 버튼 `block w-full text-left rounded-md px-2 py-1 text-xs text-sp-text hover:bg-sp-card`                                                                                                                                                                                                                 | —                                                                                                                                                                                         |

- **`data-sp-floating` 부착 지점**: Picker 자체(카드 안에 상시 배치되는 섹션)는 필요 없다 — 다른 내용 위에 뜨지 않기 때문이다. `data-sp-floating`이 필요한 것은 오직 §2-4 대화상자의 `Modal` 패널뿐이며, `Modal` 컴포넌트는 이미 `data-sp-overlay-surface`를 갖고 있어(유리 모드에서 완전 불투명 처리) 별도로 `data-sp-floating`을 추가할 필요가 없다(`data-sp-overlay-surface`가 더 강한 보장 — index.css 규칙 ⑥). 만약 대화상자를 `Modal` 대신 board 스타일의 경량 팝오버로 구현하기로 바꾸면(§2-4 대안), 그 팝오버 루트에는 `data-sp-floating`을 반드시 붙인다.
- `rounded-*`는 전부 Tailwind 기본 키(`rounded-lg`, `rounded-xl`, `rounded-full`)만 쓴다. `rounded-sp-*`는 사용하지 않는다(기존 코드베이스 관례와 동일).

## 4. 접근성

### 4-1 탭 순서(교과, `ObservationForm.tsx`)

1. 날짜 입력
2. 본문 textarea(학생 전환 시 자동 포커스 — 탭 없이도 도달)
3. 관찰 장면 칩들(각 칩은 `button`, `aria-pressed`) → 장면 직접 추가 입력
4. `ObservationTopicPicker` 헤더/목록(칩 `button`, `aria-pressed`) → "새 주제 만들기" → "마친 주제 포함" 토글
5. 분류·태그 아코디언 헤더(`button`, `aria-expanded`) → (펼쳤을 때만) 분류 칩 → 태그 칩 → 직접 추가 입력들
6. 첨부: 말로 쓰기 → 내 자료 → 학생 제출물 → 첨부 칩의 제거 버튼들
7. 기록 저장 버튼

**본문 → 장면 → 저장까지 키보드만으로 가능한 경로**: 학생 선택 직후 포커스가 본문에 있으므로 텍스트 입력 후 `Tab` 두 번(장면 칩 그룹 진입) → `Space`/`Enter`로 장면 토글 → `Tab`으로 계속 이동해 저장 버튼까지 도달, `Enter`로 저장(또는 `Ctrl+Enter` 단축키가 이미 어디서나 동작). 주제 연결·분류·태그를 건드리지 않고도 이 경로만으로 저장이 끝난다(계획 AC-01 충족).

### 4-2 탭 순서(담임, `InputMode.tsx` 중앙 열)

1. 분류 상태 줄(아코디언 토글 겸용 `button`, `aria-expanded`)
2. 메모 textarea → 크게 보기 버튼
3. 말로 쓰기
4. 관찰 장면 칩들
5. `ObservationTopicPicker`(교과와 동일 내부 순서)
6. (펼쳤을 때만) 템플릿 select → 분류 칩 → 상담 방법(counseling) → 태그 칩 → 날짜 모드 라디오군 → 후속 조치 토글
7. 첨부 영역
8. 저장 버튼(sticky)

담임은 분류 선택이 저장 필수 조건(`canSave = selectedStudents.size > 0 && selectedSub !== null`)이므로 **본문만으로 저장까지 가는 키보드 경로는 담임에서 보장하지 않는다**(계획 §4.1이 담임의 "분류만 저장하는 업무"를 그대로 유지하라고 명시했다 — 빈 분류 저장 규칙을 강화하지 않음). 대신 "분류 상태 줄"이 최상단에 있어 `Tab` 1회 만에 도달하므로, 분류를 고르고 본문으로 넘어가는 기존 흐름과 본문부터 쓰고 나중에 분류로 돌아가는 새 흐름 둘 다 3~4번의 `Tab`으로 왕복 가능하다.

### 4-3 aria 레이블(한국어)

| 대상                             | 속성                                                                    | 값                                                                                                |
| -------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Picker 컨테이너                  | `aria-label`                                                            | `"주제 연결 선택"`                                                                                |
| 열린 주제 칩                     | `aria-pressed`                                                          | 선택 여부(boolean)                                                                                |
| 열린 주제 칩                     | `aria-label`(칩 텍스트가 잘릴 때만, 30자 이상)                          | `` `${thread.title} 주제로 연결` ``                                                               |
| "새 주제 만들기"                 | `aria-label`                                                            | `"새 주제 만들기"`                                                                                |
| "마친 주제 포함" 토글            | `aria-pressed` + `aria-label`                                           | `"마친 주제 포함해서 보기"`                                                                       |
| 닫힌 주제 다시 열기 버튼         | `aria-label`                                                            | `` `${thread.title} 주제를 다시 열고 연결` ``                                                     |
| 로딩 실패 다시 시도              | `aria-label`                                                            | `"주제 목록 다시 불러오기"`                                                                       |
| 대화상자 이름 입력               | `aria-label`(레이블과 중복이면 `htmlFor`로 대체 가능)                   | `"새 주제 이름"`                                                                                  |
| 관찰 내용 레이블이 붙은 textarea | `aria-label`(레이블이 `<p>`라 textarea와 `htmlFor` 연결이 안 되면 필요) | `"관찰 내용"` — 단, `<label htmlFor>` + `<textarea id>`로 정식 연결하면 `aria-label` 불필요(권장) |
| 분류 상태 줄(담임)               | `aria-expanded` + `aria-controls`                                       | 아코디언 콘텐츠 id 참조                                                                           |

## 5. 반응형

- **1280px 폭**: 담임 `InputMode.tsx`는 이미 3열 리사이즈 구조(`leftPct`/`centerPct`/`rightPct`, 최소 20%/25%)라 중앙 열이 좁아질 수 있다. `ObservationTopicPicker`의 열린 주제 목록은 `flex flex-wrap`으로 줄바꿈하며, 개별 칩은 `max-w-[10rem] truncate`로 긴 이름을 자르고 `title` 속성으로 전체 이름을 노출한다(보드의 하단 바 주제 단추와 같은 처리 — record-evidence-board-v2 설계 §4-2 참조).
- **1920px 폭**: 칩이 한 줄에 다 들어가면 줄바꿈 없이 가로로 나열. 컨테이너 자체는 `max-w` 제한을 두지 않고 부모 카드 폭을 그대로 따른다(늘려 채우지 않는다는 보드 설계 원칙과 동일 — 다만 여기는 폭 자체가 부모 카드에 종속돼 있어 별도 처리 불필요).
- **큰 글꼴(폰트 스케일)**: `record-draft-uiux-v3` 계열에 이미 있는 `recordDraftFontScale.meta.test.ts` 관례를 따라 텍스트에 고정 `px` 대신 `text-xs`/`text-sm` 같은 상대 클래스만 쓴다(이미 이 설계 전체가 그렇게 작성됨). 대화상자(`Modal size="sm"`, `w-[min(420px,calc(100vw-32px))]`)는 이미 `calc(100vw-...)` 여유가 있어 큰 글꼴에서도 버튼 두 개(취소/만들기)가 줄바꿈될 수 있음을 감안해 버튼 컨테이너에 `flex-wrap`을 허용한다(현재 `TextPromptModal.tsx`는 `flex justify-end gap-2`만 있고 wrap이 없다 — 이 새 대화상자는 `flex-wrap justify-end gap-2`로 한 글자 다르게 가져간다).
- **모바일**: 계획 범위 밖(§0). 모바일 `src/mobile/components/Class/ObservationSheet.tsx`·`src/mobile/pages/students/RecordsSubTab.tsx`는 이번 설계의 변경 대상이 아니다.

## 6. 담임 원본 수정 — 관찰 장면 편집

`InlineRecordEditor.tsx`/`useRecordInlineEdit.ts`에는 현재 장면(slots) 편집이 없다(계획 §3 표 "담임 조회 원본 편집에는 현재 장면 편집 상태가 없다"). 교과 쪽 `ObservationCard.tsx`(1~120행)가 이미 이 패턴을 갖고 있으므로 **그대로 이식**한다.

### 6-1 `useRecordInlineEdit.ts` 변경

- 상태 추가: `const [editSlots, setEditSlots] = useState<string[]>([]);`
- `handleEdit(record)`에 한 줄 추가: `setEditSlots([...(record.slots ?? [])]);`
- `resetEditState()`에 한 줄 추가: `setEditSlots([]);`
- `onEditSave`의 비출결 분기(`updateRecord` 호출부)에 슬롯 반영을 추가하되, **ObservationCard와 같은 규칙**을 따른다: 정규화 후 빈 배열이면 키 자체를 지운다(부재 ≠ 빈 배열).

```ts
// 출결이 아닌 분기 안, 기존 updateRecord 호출 직전:
const normalizedSlots = normalizeSlots(editSlots, 'homeroom', customHomeroomSlots);
await updateRecord({
  ...record,
  content: editContent,
  category: editCategory,
  subcategory: editSubcategory,
  followUp: editFollowUp.trim() || undefined,
  followUpDate: editFollowUpDate || undefined,
  ...(normalizedSlots.length > 0 ? { slots: normalizedSlots } : {}),
});
```

`normalizeSlots`는 이미 `recordUtils.ts`/`observationSlots.ts` 경로에 있는 것(§`InputMode.tsx` 379행에서 이미 쓰는 함수)을 그대로 가져온다. `customHomeroomSlots`는 훅 안에서 `useSettingsStore((s) => s.settings.homeroomRecordSlots)`로 새로 구독해야 한다(현재 훅에 없음).
★출결(`attendance`) 분기는 건드리지 않는다 — 장면은 비출결 개념이라 출결 저장 경로(`updateAttendanceRecord`)에는 슬롯을 넘기지 않는다(계획·기존 UI 모두 출결에는 슬롯 UI가 없다).

- `edit: RecordEditProps` 반환 객체에 `editSlots`/`setEditSlots` 추가. `RecordEditProps` 타입(`recordUtils.ts`)에도 필드 추가 필요.

### 6-2 `InlineRecordEditor.tsx` 변경

- Props에 `editSlots?: readonly string[]`, `setEditSlots?: (next: string[]) => void`, `availableSlots?: readonly string[]` 추가(교과의 `editTags`/`setEditTags`/`availableTags`와 같은 옵셔널 패턴 — 미제공 시 기존 호출자는 영향 없음).
- 위치: **메모(302~314행) 다음, 첨부 자료(316~322행) 이전**에 새 섹션 삽입(입력 화면의 순서 원칙 "본문 다음 장면"과 맞춘다).
- 마크업은 `ObservationCard.tsx` 101~120행의 장면 편집 블록과 동일한 칩 UI를 쓰되, 라벨과 클래스는 `InlineRecordEditor`의 다른 섹션(예: "카테고리", "메모")과 톤을 맞춘다.

```tsx
{
  /* 관찰 장면 — 입력과 같은 목록을 보여준다(계획 §4.1) */
}
{
  editSlots !== undefined && setEditSlots && !isAttendanceRecord && (
    <div>
      <p className={`text-sp-muted mb-1 ${compact ? 'text-caption' : 'text-detail'}`}>
        어떤 장면인가요?
      </p>
      <div className="flex flex-wrap gap-1.5">
        {(availableSlots ?? []).map((slot) => {
          const isSelected = editSlots.includes(slot);
          return (
            <button
              key={slot}
              type="button"
              aria-pressed={isSelected}
              onClick={() =>
                setEditSlots(
                  isSelected ? editSlots.filter((s) => s !== slot) : [...editSlots, slot],
                )
              }
              className={`${chipSize} rounded-lg font-medium transition-all ${
                isSelected
                  ? 'bg-sp-accent text-white'
                  : 'bg-sp-surface text-sp-muted hover:text-sp-text'
              }`}
            >
              {isSelected && <span className="mr-0.5">✓</span>}
              {slot}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- 호출부(`InputMode.tsx` 1270~1300행 `<InlineRecordEditor ... />`)에 `editSlots={editingSlots}`, `setEditSlots={setEditingSlots}`, `availableSlots={allHomeroomSlots}`를 추가하고, `useRecordInlineEdit`가 반환하는 `edit` 객체를 그대로 펼쳐 쓰는 자리라면 자동으로 반영된다(현재 `InputMode.tsx`는 `useRecordInlineEdit`를 직접 쓰지 않고 자체 `editingRecordId` 등 로컬 state를 쓰고 있음 — §7에서 이 불일치를 명시한다).

## 7. 구현 주의

- **재사용 지점**
  - `Modal`(`src/adapters/components/common/Modal.tsx`) — 포커스 트랩·Esc·body 스크롤 잠금·포커스 복귀 전부 이미 있음. 새로 만들지 않는다.
  - `useTextPrompt`/`TextPromptModal`의 `createPortal(..., document.body)` 배선 — 대화상자 포털 패턴의 정본.
  - `allSlotsForContext`, `normalizeSlots`(`domain/rules/observationSlots.ts`) — 장면 목록·정규화 전부 이미 있음.
  - `useInquiryThreadStore.getOpenByStudentRef` — 열린 주제 조회 전부 이미 있음. 새 selector 불필요.
  - `InquiryThreadPanel.tsx`의 "닫힌 주제" 배지 클래스, `InquiryThreadCreate.tsx`의 입력 필드 클래스 — 그대로 재사용.
  - 담임 아코디언 토글은 `InputMode.tsx`의 기존 "후속 조치 추가" 토글(1036~1047행) 패턴을 복제한다.
- **건드리면 안 되는 것**
  - `useObservationStore`/`useStudentRecordsStore`의 저장 함수 시그니처(`addRecord` 등) — 이 문서는 UI 배치만 다룬다. 저장 계약 변경은 S1 소관.
  - 출결(`attendance`) 저장 경로 전체 — `InlineRecordEditor`의 `isAttendanceRecord` 분기, `updateAttendanceRecord` 호출부는 이번 변경 대상이 아니다.
  - `ManageObservations`, `fileWriteLock`, `syncRegistry` 등 계획 §5의 저장 잠금 계약 — 이 문서가 다루는 컴포넌트들은 이미 존재하는 공개 함수만 호출한다.
  - 보드(`RecordEvidenceBoard.tsx`)의 `InquiryThreadCreate`/`createPopover` 자체 — 그 컴포넌트는 그대로 두고, 이번 새 대화상자는 별개 컴포넌트로 만든다(§2-4에서 의도적으로 다른 배선을 쓰는 이유 참조).
  - `RecordDraft/__tests__/recordDraftNoEmDash.meta.test.ts`가 `RecordDraft/**`를 검사한다 — `ObservationTopicPicker.tsx`를 그 폴더에 두면 이 신규 파일의 모든 화면 문구에도 em dash(`—`)를 쓰면 안 된다. 이 문서의 모든 예시 문구는 이미 가운데 점(`·`)·쌍점(`:`)만 쓴다.
- **`InputMode.tsx`의 로컬 편집 상태와 `useRecordInlineEdit` 불일치**: 현재 `InputMode.tsx`는 편집 상태를 자체 `useState`(143~147행)로 들고 있고 `useRecordInlineEdit.ts`는 **다른 화면**(`SearchMode.tsx` 계열로 추정)에서 쓰는 별도 훅이다. §6의 변경 지시는 두 군데 모두에 적용된다:
  1. `useRecordInlineEdit.ts`를 실제로 쓰는 화면(조회 모드)에는 §6-1대로 훅을 고친다.
  2. `InputMode.tsx`의 "오늘 기록" 인라인 편집(1254~1301행)은 훅을 쓰지 않으므로, 그 자리에 로컬 `editingSlots`/`setEditingSlots` state를 새로 추가하고 `InlineRecordEditor` 호출부에 그대로 넘긴다.
     구현자는 실제로 `InlineRecordEditor`를 사용하는 모든 호출부(`grep -rn "InlineRecordEditor" src/`)를 먼저 확인해 몇 군데인지 파악한 뒤 전부 맞춘다(계획 §5.2 "호출부 전부를 검색"과 같은 원칙).

## 구현자가 판단해야 할 남은 것

1. **날짜 모드(단일/범위/다중) UI의 최종 위치**: 이 문서는 "분류·상세 정보" 아코디언 안에 넣도록 제안했지만, 계획 원문이 이 이동을 명시적으로 지시하지 않았다. 최상단(학생·날짜 선택 바로 옆)으로 옮기는 대안도 있다 — 오너 확인 또는 실사용 시나리오로 결정.
2. **"새 주제 만들기" 확정 시점의 실제 생성 타이밍**: §2-4의 (A)/(B) 중 선택. S1 구현자와 `selectedThreadId`/저장 관문 타입을 교차 확인해야 한다. 이 문서는 (A, 지연 생성)를 권고했을 뿐 확정하지 않았다.
3. **`ObservationTopicPicker.tsx` 파일 분할 여부**: 대화상자를 같은 파일의 서브컴포넌트로 둘지 별도 파일(`ObservationTopicCreateDialog.tsx`)로 뺄지. 계획 §6 파일 표에는 `ObservationTopicPicker.tsx` 하나만 제안돼 있다.
4. **열린 주제가 많을 때(10건 이상) 목록 UI**: 계획·이 설계 모두 가상 스크롤이나 페이지네이션을 지정하지 않았다. 실사용에서 문제가 확인되면 별도 처리.
5. **분류 상태 줄의 정확한 문구 형식**: "분류: 상담 · 태그 2개 ▾" 같은 요약 텍스트의 정확한 한국어 표현은 이 문서가 예시만 제시했다. 실제 톤 확인은 화면을 띄운 뒤 오너 검토 권장.
6. **`useRecordInlineEdit.ts`를 실제로 쓰는 호출부 목록**: 이 문서는 `InputMode.tsx`가 이 훅을 안 쓴다는 것만 확인했다. 정확히 몇 개 화면이 이 훅을 쓰는지는 구현 착수 시 `grep`으로 재확인해야 한다(§7 마지막 항목).
7. **담임 도움말 아이콘(역할 수행·관계·자율/진로 예시)의 정확한 트리거**: hover만 지원할지, 포커스·탭에서도 노출할지(접근성 상 포커스 노출 필요 — 이 문서는 "hover/포커스"라고만 적었다). `title` 속성만 쓰면 스크린리더에 노출되지 않으므로, 실제로는 `aria-describedby` + 시각적 툴팁 조합이 필요할 수 있다. 최종 마크업은 구현자가 기존 앱의 툴팁 관용구(있다면)를 찾아 맞춘다.
8. **"마친 주제 포함" 토글의 정확한 배치**(목록 위 vs 목록 아래): 이 문서는 위치를 강제하지 않았다.
