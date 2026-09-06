# 관찰 입력 → 주제별 근거 정리 UIUX 계획

- 작성: 2026-09-06. 상태: 합의 계획 승인 / Architect 2차 승인 → Critic 2차 APPROVE. 구현 전.
- 요청: 학급운영·수업관리의 관찰 입력부터 새 주제별 근거 보드까지 사용자 흐름을 설계한다. **계획만 작성하며 앱 구현·커밋·공유 상태 변경은 하지 않는다.**
- 기준 맥락: `.omx/context/observation-evidence-flow-20260906093246Z.md`.
- 선행 작업: 초안 조사 시 `record-draft-uiux-v3`, `record-evidence-board-v2`가 main에서 작업 중이었다. 계획 종료 시 PROGRESS.md는 두 작업 모두 구현·게이트 완료, 미커밋·실기기 확인 대기로 갱신돼 있다. 이는 상태판 확인이며 이 계획 세션이 구현 게이트를 다시 실행한 결과는 아니다. 이 계획은 최신 변경 인수 후 같은 main에서 순차 구현한다. 줄 번호는 조사 시점이며 인수 시 갱신한다.

## 1. 기대하는 사용자 경험

교사는 학생을 고르고 **관찰 사실부터 적는다**. 장면은 선택하고, 이미 이어 쓰는 활동이 있을 때만 주제를 연결한다. 저장 후 같은 학생의 같은 근거를 보드에서 바로 찾는다. 원본 기록을 고치는 일과 생기부용 근거를 다듬는 일을 구별할 수 있다.

이번 범위는 데스크톱 두 입력 화면·최근 기록·원본 편집 진입·근거 보드 연결 및 이에 필요한 최소 저장 계약이다. AI 생성 방식, 보드 전체 재디자인, 전면 기록 모델 통합, 학급 공통 주제 모델, 기록 이력/자동 병합, 새 데이터 파일/DB 마이그레이션/영구 작업 큐는 만들지 않는다. 모바일은 기존 기록이 새 보드와 호환되는지 검증하며 주제 편집 UI를 추가하지 않는다.

## 2. RALPLAN-DR

### 원칙 5개

1. 입력의 첫 과업은 구체적인 사실 기록이다. 주제·장면 미선택으로 저장을 막지 않는다.
2. 주제 소속 정본은 `RecordEvidence.threadId` 하나다. 원본과 근거를 자동으로 서로 덮어쓰지 않는다.
3. 학생·수업반 소유권과 저장 성공을 화면 편의보다 먼저 보장한다.
4. 보드의 거울 카드·선택 후 묶기·끌기·고아 주제 관용을 재사용한다.
5. 현재 비교만으로 알 수 있는 상태를 정확하게 말한다. 변경 이력을 추측하거나 사용자 편집을 지우지 않는다.

### 결정 요인 상위 3개

1. 기록할 때 분류를 고민하는 부담을 줄이면서 방금 기록한 활동을 이어 갈 수 있어야 한다.
2. 원본과 근거가 별도 저장되는 구조에서 중복 저장·다른 학생 연결·실패 후 본문 소실을 막아야 한다.
3. 진행 중인 보드 v2를 바꾸어 놓지 않는, 검증 가능한 순차 작업이어야 한다.

### 대안 비교

| 대안                                                     | 장점                                                                                            | 비용·한계                                                                                       | 판단                                                                                                                                               |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. 입력 재배치 + 저장 후 보드 이동만                     | 저장소 변경이 작고 기존 ‘쌓인 뒤 묶기’ 결정에 가장 가깝다                                       | 알려진 주제의 후속 기록도 저장 후 보드에서 매번 분류해야 한다. 원본 편집과 근거의 관계는 남는다 | 독립적으로 출시 가능한 축소안. 저장 안정성 선행 조건을 충족하지 못하면 여기까지도 별도 인수 기준으로 삼을 수 있으나 전체 계획 완료로 부르지 않는다 |
| B. 본문 우선 + 선택 주제 연결 + 현재 원본 비교           | 기존 기록 흐름을 보존하면서 알려진 활동을 곧바로 잇는다. 비교 상태를 새 영구 필드 없이 제공한다 | 원본·첨부·근거 저장의 부분 성공 처리와 화면 전환 계약이 필요하다                                | **권고**                                                                                                                                           |
| C. 원본에도 주제 저장 + 기준 스냅샷으로 변경 추적·동기화 | 정확한 변경 시점과 사용자 수정 여부를 구분하고 추후 자동 병합에 유리하다                        | 정본 이중화, 파일 병합/구버전 호환, 기준 스냅샷 도입이 UIUX 개선 범위를 크게 늘린다             | 장기 대안으로는 타당하나 이번에는 제외                                                                                                             |

**권고 종합:** A의 가벼운 입력을 기본으로 하고 B의 선택 연결만 얹는다. C의 이력을 약속하지 않고 ‘현재 원본과 내용이 다름’을 보여 준다. 단일 학생·단일 날짜부터 연결하며 다학생 일괄 기록은 그대로 둔다.

## 3. 현행 근거와 구현 경계

| 현행 사실                                                                                  | 근거                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 주제는 보조 입력이며 소속 정본은 근거다. 고아 threadId는 미분류로만 표시한다               | `docs/03-decisions/ADR-083.md:30`, `docs/03-decisions/ADR-083.md:53`                                                                                                                                                                          |
| 담임 전 영역 주제 묶기를 허용하고, 보강 2에서 거울 카드·끌기를 채택했다                    | `docs/03-decisions/ADR-085.md:39`, `docs/03-decisions/ADR-085.md:94`                                                                                                                                                                          |
| 학생마다 주제를 소유하며 수업 학생 키는 별도 체계다                                        | `src/domain/entities/InquiryThread.ts:25`, `src/domain/entities/RecordEvidence.ts:53`, `src/adapters/components/ClassManagement/ClassRecordDraftView.tsx:24`                                                                                  |
| 교과 실제 입력은 ClassRecordInputView → ObservationForm이고 최근 기록은 ObservationCard다  | `src/adapters/components/ClassManagement/ClassRecordInputView.tsx:666`, `src/adapters/components/ClassManagement/ClassRecordInputView.tsx:689`                                                                                                |
| 교과 명시 저장과 학생 전환 자동 저장이 별도 경로다                                         | `src/adapters/components/ClassManagement/ObservationForm.tsx:202`, `src/adapters/components/ClassManagement/ObservationForm.tsx:337`                                                                                                          |
| 담임은 학생·날짜 일괄 저장, 중복 검사, 태그/장면 후속 patch가 있다                         | `src/adapters/components/Homeroom/Records/InputMode.tsx:321`, `src/adapters/components/Homeroom/Records/InputMode.tsx:363`, `src/adapters/components/Homeroom/Records/InputMode.tsx:428`                                                      |
| 담임 wrapSave는 오류를 상태로 흡수하며 호출부는 그 뒤 resetForm을 실행한다                 | `src/adapters/hooks/useRecordSaveStatus.ts:44`, `src/adapters/components/Homeroom/Records/InputMode.tsx:417`                                                                                                                                  |
| 상위 탭은 조건부 마운트이고 담임에는 기존 dirty 경고와 상담 prefill이 있다                 | `src/adapters/components/ClassManagement/ClassRecordTab.tsx:58`, `src/adapters/components/Homeroom/HomeroomPage.tsx:45`, `src/adapters/components/Homeroom/HomeroomPage.tsx:61`, `src/adapters/components/Homeroom/Records/RecordsTab.tsx:49` |
| 생기부 화면 자체 학생 선택은 공유되지만 입력에서 받을 이동 계약이 없다                     | `src/adapters/components/RecordDraft/RecordDraftView.tsx:152`, `src/adapters/components/RecordDraft/RecordDraftView.tsx:396`                                                                                                                  |
| 저장된 sourceId를 후보에서 제외한다. 담임 후보 현재 필터는 학생 ID뿐이다                   | `src/usecases/studentRecords/collectEvidenceCandidates.ts:91`, `src/usecases/studentRecords/collectEvidenceCandidates.ts:121`                                                                                                                 |
| 보드는 거울을 첫 조작 때 저장하고, 영역은 단일 맥락/현재 필터 또는 빈 배열을 사용한다      | `src/adapters/components/RecordDraft/RecordEvidenceBoard.tsx:494`, `src/adapters/components/RecordDraft/RecordEvidenceBoard.tsx:542`                                                                                                          |
| 근거 add/addMany는 자체 sourceId 중복 검사가 없고 persist는 메모리를 먼저 바꾼다           | `src/adapters/stores/useRecordEvidenceStore.ts:117`, `src/adapters/stores/useRecordEvidenceStore.ts:159`, `src/adapters/stores/useRecordEvidenceStore.ts:187`                                                                                 |
| 교과 원본·주제 생성도 현재 메모리를 먼저 게시하며 주제 load 오류를 흡수한다                | `src/adapters/stores/useObservationStore.ts:100`, `src/adapters/stores/useInquiryThreadStore.ts:59`, `src/adapters/stores/useInquiryThreadStore.ts:68`                                                                                        |
| 동기화는 공용 파일 잠금으로 최신 체크섬을 확인하며 보드 reload는 현재 loaded를 직접 내린다 | `src/usecases/sync/SyncFromCloud.ts:773`, `src/usecases/sync/syncRegistry.ts:365`, `src/usecases/shared/fileWriteLock.ts:8`                                                                                                                   |
| 교과 원본 수정은 내용·장면, 삭제는 첨부 정리를 포함하며 근거를 연쇄 수정하지 않는다        | `src/adapters/components/ClassManagement/ObservationCard.tsx:23`, `src/adapters/components/ClassManagement/ObservationCard.tsx:36`                                                                                                            |
| 담임 조회 원본 편집에는 현재 장면 편집 상태가 없다                                         | `src/adapters/components/Homeroom/Records/useRecordInlineEdit.ts:30`, `src/adapters/components/Homeroom/Records/InlineRecordEditor.tsx:18`                                                                                                    |
| 근거 수정은 별도 patch이고 삭제하면 저장 sourceId가 없어져 원본 재노출이 가능하다          | `src/adapters/components/RecordDraft/RecordEvidenceBoard.tsx:810`, `src/adapters/components/RecordDraft/RecordEvidenceBoard.tsx:854`                                                                                                          |
| AI의 주제 선택 경로는 학생 근거를 threadId로 고르므로 영역 없음이 AI 제외를 뜻하지 않는다  | `src/adapters/components/RecordDraft/RecordDraftAiPanel.tsx:65`, `src/adapters/components/RecordDraft/RecordDraftAiPanel.tsx:260`                                                                                                             |
| 모바일 교과는 장면 입력이 있고 담임은 별도 간단 입력이다                                   | `src/mobile/components/Class/ObservationSheet.tsx:9`, `src/mobile/pages/students/RecordsSubTab.tsx:43`                                                                                                                                        |

모든 아래 변경은 **제안**이다. 기존 정책 확정으로 오인하지 않는다. `InquiryThread.ts:16`의 AI/담임 관련 오래된 주석보다 최신 ADR-085가 우선한다.

## 4. 화면·문구 계약

### 4.1 공통 입력 순서

`학생·날짜 → 관찰 내용 → 관찰 장면(선택) → 주제 연결(선택) → 분류·태그/상담 등 부가 정보 → 첨부 → 저장`

- 제목은 ‘메모 입력(선택사항)’ 대신 **‘관찰 내용’**. 담임 기존 분류만 저장하는 업무는 유지하므로 빈 본문 저장 규칙을 전면 강화하지 않는다. 본문이 없는 기록에는 주제 연결을 비활성화하고 ‘내용을 적으면 주제에 연결할 수 있어요’를 표시한다.
- 학생을 고르면 본문에 포커스. 교과 예시: ‘학생이 한 말과 행동, 그 뒤 달라진 점을 적어 주세요.’ 담임도 같은 사실 중심 안내를 사용하되 역할 수행·관계·자율/진로 활동 예시는 별도 도움말에 둔다.
- ‘관찰 장면’은 현재 값과 사용자 정의 값을 그대로 사용한다. 담임 기본 장면 확장은 알림/통계에 영향이 있으므로 이번에는 추가·개명하지 않는다. 도움말 예시를 보완하고 기존 ‘장면 추가’ 경로를 재사용한다. 입력과 담임 원본 수정에서도 동일 목록을 보여 준다. 근거: `observationSlots.ts:44`, `observationSlots.ts:54`.
- 교과 기존 기본 분류를 보존하고 ‘분류·태그’는 접을 수 있게 한다. 담임 분류는 상담 후속 조치 등 입력을 결정하므로 선택 상태를 한 줄에 항상 보이고 상세 입력만 접는다. 출결 입력 화면은 이번 재배치 대상에서 제외한다.

### 4.2 주제 선택 상태

| 상태                              | 표시/행동                                                                                                                                                                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 기본                              | ‘주제 연결(선택) · 나중에 근거 보드에서 묶어도 돼요’ / 미선택 저장 가능                                                                                                                                                                                                  |
| 학생 미선택·주제 로딩             | 선택 비활성화, 로딩 실패는 ‘주제를 불러오지 못했습니다 · 다시 시도’; 원본 저장은 가능                                                                                                                                                                                    |
| 단일 학생·단일 날짜·본문 있음     | 같은 studentRef·classId의 열려 있는 주제를 최근 수정 순으로 검색. ‘새 주제 만들기’를 보조 항목으로 제공                                                                                                                                                                  |
| 새 주제                           | 이름만 받는 작은 대화상자. 검색 가능한 동명 주제를 먼저 제시하고 중복 이름 자동 병합은 하지 않음. 확정 전에는 저장소 쓰기 0회. 실제 생성은 기록 저장 후 연결 단계                                                                                                        |
| 닫힌 주제                         | 기본 목록에서 제외. ‘마친 주제 포함’ 목록에서는 바로 연결하지 않고 ‘주제를 다시 열고 연결’ 제공. 다시 열기 저장 성공 이후에만 연결한다. 선택 후 다른 경로에서 닫혔어도 저장 직전 재검사하여 연결을 중단하고 같은 선택지를 안내한다(ADR-085 보강 2의 열린 주제 규칙 유지) |
| 학생 전환                         | 이전 학생의 저장 작업은 이전 학생 맥락으로 캡처. 새 학생에 주제 선택을 복사하지 않음. 보드에서 이어 쓰기 진입 시에만 그 학생 주제를 미리 채움                                                                                                                            |
| 다학생 또는 여러 날짜             | ‘여러 학생·날짜 기록은 저장 후 학생별 근거 보드에서 묶어 주세요’ / 선택 주제는 폼의 단일 입력 초안에만 보관하고 일괄 저장에는 전달하지 않음                                                                                                                              |
| 저장 도중 주제 삭제/소유권 불일치 | 원본은 보존, ‘기록은 저장됐지만 주제에 연결하지 못했습니다’ + ‘주제 다시 선택’ + ‘근거 보드 열기’                                                                                                                                                                        |

주제는 활동 묶음, 장면은 관찰의 성격, 분류·태그는 기존 업무 검색 축, 생기부 영역은 활용처다. 주제 선택으로 영역을 유추하지 않는다. 연결할 근거의 영역은 기존 보드 정책과 동일하게 단일 허용 영역이면 그 값, 그 외는 `[]`로 시작하고 ‘생기부 영역은 근거 보드에서 고를 수 있어요’를 표시한다. 영역 미지정을 AI 제외라고 안내하지 않는다. 기존 영역·제외 정책은 유지한다.

### 4.3 저장 후·최근 기록·보드 왕복

- 단일 저장: ‘기록을 저장했습니다’ 또는 ‘기록을 저장하고 “○○”에 연결했습니다’ + **‘근거 보드에서 보기’**. 클릭 시 같은 학생을 선택하고 대상 sourceId/evidenceId를 찾아 스크롤·포커스한다. 선택 주제가 있으면 해당 열을 연다. 저장만으로 탭을 강제 이동하지 않는다.
- 최근 기록: 소속은 원본의 threadId가 아니라 같은 소유자의 저장 근거를 sourceId로 조회하여 ‘주제 미지정’/주제명 표시. 고아 주제는 ‘주제 확인 중’ 설명과 미분류 표시, 원본 값을 임의 삭제하지 않음.
- 보드 열: **‘관찰 이어 쓰기’** → 해당 학생·주제의 빈 본문 입력. 기존 글을 복사하지 않는다. **‘원본 보기·수정’** → 해당 원본 카드/조회 편집으로 이동한다.
- 교과 이동 맥락은 ClassRecordTab, 담임은 HomeroomPage가 소유한다. 새 제안 타입 `RecordFlowIntent`는 `{requestId, context, classId?, studentRef, mode: 'board'|'compose'|'source', sourceId?, evidenceId?, threadId?}`. 폼 선택과 초안 AI 상태를 전역 영구 저장하지 않는다. 요청은 roster/source 로딩 및 학생 유효성 확인 후 한 번만 소비한다.
- 삭제된 학생/수업반이면 첫 학생에게 묵시적으로 연결하지 않고 ‘학생을 찾을 수 없습니다’를 표시한다. 대상 근거가 필터 밖이면 같은 학생의 ‘전체’ 필터로 전환하고 알려 준다.
- 교과 원본 진입: ClassRecordInputView의 최근 기록을 펼치고 ObservationCard에 대상 편집/포커스 요청 전달. 담임 원본 진입: RecordsTab을 조회 모드로 열고 SearchMode의 학생·날짜 필터를 맞춘 후 기존 `handleEdit(record)`로 진입. 기존 상담 RecordPrefill과 별도 의도로 구분한다.
- 기존 미저장 본문이 있을 때 이어 쓰기/원본 이동은 ‘저장 후 이동 / 계속 작성’으로 보호한다. 사용자가 별도로 폐기를 선택하는 기존 경로는 그대로 유지한다. 새 CTA가 기존 dirty guard를 우회하지 않도록 상위 전환 함수 하나를 통한다.
- 생기부 자동저장(현재 700ms)의 대기 작업을 반환 Promise가 있는 flush 계약으로 노출하고 새 왕복 이동 전에 성공을 기다린다. 실패하면 원래 화면에 머문다. 근거 편집 폼도 같은 보호 대상이다. 근거: `RecordDraftView.tsx:858`, `RecordDraftView.tsx:882`.

## 5. 저장·수명주기 계약

### 5.1 원본 저장 → 선택 연결

1. 원본을 기존 저장 경로로 저장해 성공한 `recordId`를 얻는다. 교과 명시 저장·학생 전환 자동 저장 모두 같은 저장 조정 함수(신규 제안 adapter hook)를 사용한다. 담임은 단일 저장에만 연결을 적용한다. `useObservationStore.ts:100`은 현재 메모리 게시가 `manage.add` 성공보다 빠르므로, 생성·수정의 게시를 기존 `ManageObservations` 저장 성공 뒤로 옮긴다. 실패 시 이 원본을 저장됐다고 표시하거나 다음 단계로 넘기지 않는다. 전체 스토어 스냅샷 rollback으로 다른 학생의 동시 저장을 되돌리지 않는다.
2. 첨부가 있으면 성공한 원본 ID에 붙인다. 현재 `ObservationForm.tsx:131`의 파일별 catch/toast와 void 반환을 **성공 파일의 attachmentId 및 실패 파일의 pendingKey·오류를 반환하는 계약**으로 바꾼다. 담임 `InputMode.tsx:90`도 같은 결과를 사용한다. 파일 선택 시 만든 세션 pendingKey를 써서 동명 파일을 혼동하지 않고, 성공 항목만 대기 목록에서 제거한다. 학생 전환 때 `pendingFilesRef`를 먼저 버리거나 `void commitPendingAttachments`로 완료를 분리하지 않는다. 이전 학생의 파일을 체크포인트로 옮겨 보관하고 결과를 기다린다. `useObservationAttachmentStore.ts:103`의 create 성공 후 게시 계약을 유지하며, repository create의 실패 시 해당 파일만 회수되는지 `JsonObservationAttachmentRepository.ts` 테스트로 확인한다. 일부 성공 뒤 재시도는 실패 파일만 수행한다.
3. 선택 주제가 없으면 근거를 생성하지 않는다. 원본은 보드에서 기존 거울 카드로 보인다. 선택했으면 저장 직전 원본·학생·주제를 다시 읽고 검증한 뒤 근거 연결 관문을 호출한다.
4. 연결 정본은 근거만 쓴다. `ObservationRecord.threadId`는 이번 신규 입력에서 쓰지 않고 `StudentRecord`에도 threadId를 추가하지 않는다. 기존 원본 threadId는 삭제하지 않는다.
5. 신규 제안 `ensureEvidenceFromSource` 관문은 **studentRef + sourceId**를 기존 후보 중복 억제와 같은 단위로 검사한다. 기존 레코드가 있으면 그 ID를 재사용하고 본문·영역·제외 플래그는 보존, 주제 이동만 기존 `moveToThread` 관문으로 수행한다. 같은 키인데 sourceType/classId가 다르거나 기존 중복이 2개 이상이면 임의 선택하지 않고 연결 오류를 표시한다. 기존 데이터 일괄 중복 삭제는 하지 않는다.
6. 새 근거 생성은 보드 거울 저장과 같은 후보 projection을 재사용하고 ownership를 저장 관문에서 재검사한다. 보드의 add/addMany 경로도 동일 sourceId 중복 차단을 사용하여 입력과 보드의 재진입이 겹쳐도 1개만 남긴다. 기존 수동 근거(sourceId 없음)는 대상 밖이다.
7. 새 주제는 저장된 근거가 확보된 뒤 기존 `moveToNewThread`의 공개 진입점을 재사용하되 **생성 자체도 결과 처리 범위 안**에 넣는다(현재 `useRecordEvidenceStore.ts:297` 생성은 이동 보상 try 밖). `useInquiryThreadStore.ts:59`의 생성·다시 열기·삭제는 아래 공용 잠금에서 실제 파일 읽기/저장 성공 후에만 게시한다. 생성 실패는 주제 생성 실패, 이동 실패는 연결 실패, 보상 삭제 실패는 정리 실패로 구분한다. 이동 실패 후 이번 작업이 만든 주제이고 여전히 연결 근거가 0개일 때만 보상 삭제한다. 다른 작업이 사용하기 시작한 주제는 보존한다. 삭제 실패/결과 불명확 때 ‘연결하지 못했습니다. 주제 상태를 확인해 주세요’와 해당 주제 확인 경로를 제공하며 디스크 확인 전 빈 주제가 남았다고 단정하지 않는다.
8. 원본·근거·주제 생성은 생성 시도 ID를 호출 작업이 보유하고 저장 성공 시 confirmed ID로 전환한다. 실패 후 재시도는 그 ID로 디스크 결과부터 확인하여 이미 성공한 작업을 새 ID로 반복하지 않는다. 읽기 실패는 재시도 중단, 부재 확인은 같은 ID로 재시도, 존재 확인은 소유권/내용 검증 후 해당 단계 성공으로 회복한다. 새 주제 생성/이동/보상 삭제 각각의 결과와 ID를 보관하며 보상 삭제 성공 후에만 주제 ID를 비운다. 영구 큐나 저장 스키마 추가 없이 해당 store add 반환/선택 ID 인자와 adapter 세션 상태의 최소 변경으로 구현한다.

### 5.2 실패를 성공으로 보이지 않게 하는 최소 보강

- 원본·첨부·주제·연결 결과를 `sourceAttempt(id)/sourceSaved(id)`, 파일별 `pendingKey→attachmentId|failed`, `threadAttempt(id)/threadSaved(id)/compensationResult`, `linked(evidenceId)` 체크포인트로 **현재 페이지 세션 메모리**에 보관한다. 연결만 실패하면 원본 내용을 편집 불가 저장 결과로 남기고 ‘연결 다시 시도’를 제공한다. 다음 일반 입력은 별도 빈 폼으로 시작 가능하며 재시도는 새 원본을 생성하지 않는다. 원본 저장이 확인됐지만 첨부가 일부 실패하면 ‘기록 저장됨 · 첨부 N개 다시 시도’로 표현하고 실패 파일과 캡처한 학생 맥락을 유지한다.
- 담임 `useRecordSaveStatus.wrapSave`는 성공 여부를 반환하도록 최소 확장하고 **호출부 전부를 검색**하여 현재 의미를 보존한다. InputMode의 resetForm은 필요한 저장 단계가 성공했을 때만 실행한다. 원본 실패/첨부 실패에서는 본문과 첨부를 보존한다. 이미 저장한 원본 ID가 있으면 그 단계부터 재시도한다. 다학생 저장의 부분 성공은 기존 중복 억제를 유지하며 각 학생 성공 ID를 구분하여 누락한 태그/장면 patch만 재시도한다.
- 근거·주제의 직렬화는 별도 store 전용 큐 대신 **기존 `src/usecases/shared/fileWriteLock.ts`의 공용 `withFileLock`**을 재사용한다. 키는 `src/usecases/sync/syncRegistry.ts`의 `SYNC_FILE_KEYS` 정본을 쓰고 근거/주제 키가 빠져 있으면 그 목록에만 추가한다. 공개 쓰기 진입점은 잠금 안에서 repository 최신 읽기→검증/순수 변환→저장→성공 데이터 게시를 수행한다. `get().records`로 next를 미리 계산하거나 파일 write만 잠그지 않는다. `JsonRecordEvidenceRepository.ts:12`/`JsonInquiryThreadRepository.ts`의 raw save를 감싸는 store 계층 한 곳만 잠금을 획득한다. 원본은 이미 공용 잠금을 쓰는 `src/usecases/classManagement/ManageObservations.ts`의 기존 잠금 경계를 유지하며 중첩 획득하지 않는다. 읽기 실패를 빈 파일로 간주하지 않는다. 담임 `src/adapters/stores/useStudentRecordsStore.ts:324`는 이미 원본 저장 성공 후 게시하므로 이 순서를 보존하고 전면 재작업하지 않는다.
- 근거 `moveToThread→setThread`, `moveToNewThread→setThread`는 잠금을 잡은 공개 함수가 같은 잠금을 잡는 공개 함수를 await하지 않는다. 공개 함수는 필요한 잠금을 한 번 획득하고 **잠금을 다시 잡지 않는 내부 변환/helper**만 호출한다. 주제 소유권·열림 상태 검증과 근거 이동에 두 파일이 필요하면 **주제→근거** 순서로만 잠그고 역순 경로를 두지 않는다. 원본 비교 적용처럼 원본도 필요한 경우 **원본→주제(필요할 때만)→근거**의 고정 순서를 따른다. 새 주제 생성→근거 이동→보상 삭제는 각 단계의 잠금을 풀고 다음 공개 단계로 넘어가며, 한 근거 잠금 안에서 주제 공개 저장을 기다리지 않는다. 보상 삭제의 ‘현재 사용 중인지’ 검사만 주제→근거 잠금에서 수행한다.
- 동기화는 `src/usecases/sync/SyncFromCloud.ts:773`의 같은 파일 잠금·checksum/CAS 정책을 그대로 유지한다. `src/usecases/sync/syncRegistry.ts:365`의 loaded 강제 변경 후 reload는 **해당 store의 force reload 진입점**으로 교체한다. 이 reload 역시 같은 공용 파일 잠금 안에서 최신 읽기→게시하여, 이전에 읽은 스냅샷을 뒤늦게 게시하지 않는다. 주제 reload도 동일 계약을 쓴다. 동기화가 먼저 끝나면 사용자 변환은 동기화된 파일을 읽고, 사용자 저장이 먼저 끝나면 현행 checksum 충돌 정책이 적용된다. 충돌 승자·병합 전략을 새로 만들지 않는다. `SyncFromCloud.ts`는 동작 변경 대상이 아니라 이 경합 통합 테스트의 실제 경로다.
- 위 직렬화의 보장 범위는 `fileWriteLock.ts:17`에 명시된 **동일 renderer JS context와 그 안의 동기화**다. 다른 프로세스/BrowserWindow까지의 원자성을 주장하지 않는다. 새 브릿지 쓰기나 다중 프로세스 CAS 도입은 이번 범위 밖이다.
- 소스 키 검사·중복 검사도 위 최신 읽기와 같은 잠금 안에서 수행한다. 저장 중 UI는 중복 클릭을 막는다. 현재 주제 load 오류 흡수(`useInquiryThreadStore.ts:68`) 및 근거 load 실패를 쓰기 성공으로 취급하지 않도록 명시 오류 반환/전파를 갖춘다. 관찰 load/reload도 이미 존재하는 `ManageObservations` 읽기와 성공 게시를 사용한다. 다른 store 전면 개편·새 잠금 엔진·영구 작업 큐는 범위 밖이며 이 보강은 선택 연결 B안의 실패 회복 약속에 필요한 경로만 대상으로 한다.
- 페이지를 닫기 전 미완료 첨부/연결은 상태를 알려 준다. 강제 종료 후 자동 재시도는 약속하지 않는다. 재실행하면 디스크에 성공한 원본은 보드 거울, 저장된 미분류 근거는 미분류로 보여 직접 연결할 수 있다. 이를 복구의 지속 경계로 삼는다.

### 5.3 원본·정리한 근거의 상태와 행동

정확한 변경 감지용 fingerprint/baseline을 **영구 저장하지 않는다**. 정규화한 현재 `{content, date, slots}`를 비교한다. 본문은 줄바꿈만 LF로 통일하고 실제 글자 차이는 유지한다. 날짜 부재는 빈 값과 동등, 장면은 중복 없는 정렬 집합으로 비교한다. 태그·category는 근거 본문 projection에 없으므로 비교하지 않는다. 비교 순수 함수는 도메인, 원본 수집은 adapter에 둔다.

비교창은 열 때 원본·근거의 ID/소유권과 위 3개 필드를 **확인 화면용 세션 값**으로 캡처한다. ‘원본 내용으로 바꾸기’를 누르면 원본→근거의 공용 잠금에서 양쪽 최신 데이터를 다시 읽고 캡처와 비교한다. 어느 쪽의 3개 필드 또는 소유권이 바뀌었으면 쓰기 0회, 비교 내용을 갱신하고 ‘확인 중 내용이 바뀌었습니다. 다시 확인해 주세요’를 표시하여 재확인을 받는다. 어느 한쪽이 삭제됐거나 읽기에 실패해도 쓰지 않는다. 주제·영역·제외만 바뀌었으면 반영 직전 최신 근거의 해당 값을 보존한다. 이는 영구 baseline/이력 추가가 아니라 열린 대화상자의 낡은 확인을 방지하는 검사다.

근거 update에는 **제안 타입** `sourceFields?: { content: string; date: string | null; slots: readonly string[] | null }`를 추가한다. `sourceFields` 부재는 세 필드 미변경, 명시 `date: null`/`slots: null`은 해당 키 제거, 값은 교체다. 현재 `undefined`를 ‘변경 없음’으로 처리하는 일반 patch와 구별하며 `[]`/빈 날짜를 무의미하게 저장하지 않는다. `sourceFields` 적용 시 현재 근거를 기준으로 나머지 속성을 유지하고 새 금지 표현 판정은 기존 content update 규칙대로 수행한다.

| 상태                           | 문구와 실제 동작                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 저장되지 않은 거울             | ‘원본 기록’ / 원본 변화가 그대로 반영. ‘근거 내용 다듬기’로 수정 시에만 별도 근거 생성. ‘원본 보기·수정’은 기존 원본 편집으로 이동                                                                                                                                                                                                                                                                                                                                                                                |
| 원본과 동일한 저장 근거        | ‘원본과 내용 같음’은 상세에서만 표시. 목록 주제 표시는 유지                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 현재 원본과 다른 저장 근거     | ‘원본과 내용이 달라요’ + ‘비교하기’. 어느 쪽이 언제 바뀌었다고 단정하지 않음                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 비교 대화상자                  | 왼쪽 ‘현재 원본’, 오른쪽 ‘정리한 근거’. 기본 ‘현재 근거 유지’. ‘원본 내용으로 바꾸기’는 바뀔 본문·날짜·장면을 보여 주고 위 적용 직전 재검증 성공 후 `sourceFields`로 그 3개 필드만 갱신. 최신 id·sourceId·studentRef·classId·threadId·areas·createdAt 보존. 기존 제외 플래그는 풀지 않고 새 금지 표현 판정은 현행 update 규칙대로 적용                                                                                                                                                                            |
| 원본 로딩/실패                 | ‘원본 확인 중’/‘원본을 불러오지 못했습니다 · 다시 시도’. 삭제됨으로 표시하지 않음                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 원본 로드 성공 후 해당 ID 없음 | ‘원본을 찾을 수 없습니다’. 근거는 그대로 보존, 비교 반영 버튼 없음. 삭제/동기화 지연/학년도 이동 중 무엇인지 단정하지 않음                                                                                                                                                                                                                                                                                                                                                                                        |
| 원본 내용 비어짐/출결로 바뀜   | 원본은 존재하므로 missing으로 처리하지 않음. 비교 화면에 실제 상태 표시, 빈 본문으로 근거를 덮는 버튼은 비활성화. 기존 근거 유지/정리한 근거 삭제 선택 가능                                                                                                                                                                                                                                                                                                                                                       |
| 원본 삭제                      | 기존 원본 화면에서 삭제. 연결 근거가 있으면 ‘정리한 생기부 근거는 남습니다’ 안내 추가. 원본·첨부 기존 삭제 동작 유지, 근거 연쇄 삭제 없음                                                                                                                                                                                                                                                                                                                                                                         |
| 출처 있는 저장 근거 삭제       | 버튼 ‘정리한 근거 삭제’. **원본 로드 성공·존재·자동 거울 적격이 모두 확인된 observation/studentRecord만** ‘원본은 남고 미분류에 다시 표시됩니다’. 원본 없음은 ‘정리한 근거만 삭제합니다’, 로드 실패/출결/공백 본문/비교 범위 밖 출처는 ‘정리한 근거만 삭제합니다. 원본은 이 동작으로 삭제하지 않습니다’. 뒤 조건에서는 재노출을 약속하지 않는다. 실제 근거만 제거. 5초 되돌리기는 주제/영역/제외 플래그까지 보존하며 동일 sourceId가 이미 재저장됐으면 새 근거를 만들거나 그 새 편집을 덮지 않고 기존 근거로 안내 |
| 직접 입력 근거 삭제            | 기존 삭제·되돌리기 유지. 원본 재노출 안내 없음                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

이번 원본 비교·편집 이동 범위는 `observation`/`studentRecord`만이다. 평가·과제물·첨부는 현행 출처 표시와 기존 조작을 유지한다. 원본 존재 확인은 후보 목록의 필터와 분리한다. 과거 저장 근거를 새로운 후보 제외 정책 때문에 ‘원본 없음’으로 오판하지 않는다.

담임 자동 거울 후보에는 **출결 및 공백 본문을 제외**한다. 기존 출결 원본/이미 저장한 근거를 삭제하거나 수정하지 않는다. 보드 후보·미분류 건수 모두 같은 적격성 함수를 사용하고 명시 가져오기의 기존 범위는 유지한다. 슬롯 미선택은 제외 조건이 아니다.

## 6. 순차 구현 단계와 파일 책임

각 단계는 같은 단일 구현 담당자가 앞 단계 검증을 받고 진행한다. 여러 에이전트 병렬 구현 금지. 신규 파일명은 제안이며 인수 시 기존 책임에 맞는 파일이 있으면 재사용한다.

| 단계                             | 작업·파일                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | 체크포인트                                                                                                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| S0 기준점 인수                   | `git status --short`, PROGRESS/DECISIONS, 최신 ADR-085·보드 v2 설계 확인. 위 사실/줄번호 갱신. `ObservationForm`, `InputMode`, `RecordEvidenceBoard`, 관련 store 실제 diff 인수. 기존 저장·첨부 반환값과 회귀 기준 확인                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 보드 v2 작업자가 해당 파일 인계하기 전 겹치는 코드 수정 금지. 알려진 기존 실패와 이번 실패를 구분한 기준 보고서. 불완전 인수면 계획만 유지                               |
| S1 연결·실패 계약                | `src/adapters/stores/useRecordEvidenceStore.ts`, `src/adapters/stores/useInquiryThreadStore.ts`, `src/adapters/stores/useObservationStore.ts`; `src/adapters/hooks/useRecordSaveStatus.ts` 및 wrapSave 호출부; **신규 제안** `src/adapters/hooks/useObservationEvidenceSave.ts`; `ObservationForm.tsx`, `InputMode.tsx` 저장/파일별 결과 연결. `src/usecases/sync/syncRegistry.ts`의 키·reload; 기존 `src/usecases/shared/fileWriteLock.ts`, `src/usecases/classManagement/ManageObservations.ts`, `src/adapters/repositories/JsonRecordEvidenceRepository.ts`, `src/adapters/repositories/JsonInquiryThreadRepository.ts`의 읽기/잠금 경계 재사용. `src/adapters/stores/useObservationAttachmentStore.ts`, `src/adapters/repositories/JsonObservationAttachmentRepository.ts`는 ID 회복/파일 생성 실패 회수에 필요한 반환 계약만 보강 | AC-04~09·19의 저장/동기화 부분. 원본/주제 생성 실패·첨부 일부 실패·주제 이동/보상 실패·동기화 interleaving readback. 중복 0·유령 0·중첩 잠금 교착 0 확인 후 UI 연결 확장 |
| S2 본문 우선 입력·선택 주제      | `ObservationForm.tsx`, `Homeroom/Records/InputMode.tsx`; **신규 제안** `src/adapters/components/RecordDraft/ObservationTopicPicker.tsx`; `InlineRecordEditor.tsx`, `useRecordInlineEdit.ts`, `recordUtils.ts`의 장면 전달 계약                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | AC-01~03·09. 교과 자동저장 포함 장면·주제·태그 보존, 담임 상담·다학생·다날짜 기존 저장 검증                                                                              |
| S3 같은 학생 왕복·원본 진입      | `ClassRecordTab.tsx`, `ClassRecordInputView.tsx`, `ClassRecordDraftView.tsx`, `ObservationCard.tsx`; `HomeroomPage.tsx`, `Records/RecordsTab.tsx`, `Records/SearchMode.tsx`, `Records/HomeroomRecordDraftTab.tsx`; `RecordDraftView.tsx`, `RecordEvidenceBoard.tsx`; **신규 제안** `src/adapters/components/RecordDraft/recordFlowIntent.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | AC-10~12. 필터 밖 대상·학생 삭제·로딩 지연·dirty/자동저장 실패에 대한 이동 통합 테스트                                                                                   |
| S4 원본 비교·삭제 의미·후보 정리 | **신규 제안** `src/domain/rules/evidenceSourceComparison.ts`, `src/adapters/hooks/useEvidenceSourceState.ts`, `src/adapters/components/RecordDraft/EvidenceSourceComparisonDialog.tsx`; `src/adapters/components/RecordDraft/RecordEvidenceBoard.tsx`, 근거 카드 구성요소; `src/adapters/stores/useRecordEvidenceStore.ts`의 원본→근거 잠금·apply 직전 비교·sourceFields 명시 삭제 patch; `src/usecases/studentRecords/collectEvidenceCandidates.ts`, 두 원본 카드 삭제 안내                                                                                                                                                                                                                                                                                                                                                           | AC-13~17. 대화상자 열림 중 양쪽 수정/삭제·최신 분류 보존·날짜/장면 명시 해제, 조건부 재노출 안내와 되돌리기 분리 검증                                                    |
| S5 화면 QA·문서·종합 확인        | `landing/src/content/docs.ts`, 필요 `landing/public/docs/screenshots/`; **신규 제안** `docs/03-analysis/observation-evidence-flow.analysis.md`, 월별 `docs/progress/2026-09.md` 및 PROGRESS 상태판                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | AC-18~20 및 모든 최종 게이트. 실제 스크린샷·검증 로그 남긴 뒤 완료 판정                                                                                                  |

`UnifiedRecordDraft`/기록 통합 변환을 새 입력 계약으로 전면 전환하지 않는다. 순수 비교 함수는 외부 의존성이 없는 domain에, 스토어 조정은 adapters에 둔다. usecases에서 store를 import하지 않는다. 근거: `docs/architecture-rules.md:15`.

## 7. 수락 기준과 의미 있는 검증

| ID    | 관찰 가능한 통과 조건                                                                                                                                                                                                                                                                      | 검증                                                                                                 |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| AC-01 | 학생·날짜 다음 본문이 나타나고 키보드만으로 본문→장면→저장이 가능하다. 주제/장면 미선택 저장 성공                                                                                                                                                                                          | 두 입력 컴포넌트 + 실제 키보드                                                                       |
| AC-02 | 분류·태그·장면 값이 뒤섞이지 않고 기존 상담 부가 정보·출결 입력·태그 통계 계약이 유지된다                                                                                                                                                                                                  | 담임 기존 통합 테스트 + 실제 상담 저장                                                               |
| AC-03 | 다학생·다날짜 저장은 학생별 원본을 만들며 단일 학생 주제를 다른 학생에게 쓰지 않는다                                                                                                                                                                                                       | 선택 2명×2일, 단일→다중→단일 전환                                                                    |
| AC-04 | 주제 없이 저장 시 원본 1개·근거 신규 0개. 선택 주제 저장 시 원본 1개·연결 근거 1개                                                                                                                                                                                                         | repo readback·통합                                                                                   |
| AC-05 | 학생 전환 자동저장과 명시 저장이 같은 원본/첨부/주제 결과를 만들고 다음 학생에 전파되지 않는다                                                                                                                                                                                             | 지연 Promise로 A 저장 중 B→C 전환                                                                    |
| AC-06 | 원본 생성 실패 후 메모리 유령 0·본문/선택 주제 유지·시도 ID 재확인 후 재시도 원본 1개. 첨부 3개 중 2번째 실패 시 성공한 파일 ID를 보존하고 재시도는 실패 파일만 수행. 학생 전환 자동저장도 동일하며 다음 학생 pending과 섞이지 않는다                                                      | 원본 repo 실패·파일별 부분 실패·교과 전환 중 실패 주입, 디스크/첨부 메타 readback                    |
| AC-07 | 같은 sourceId 연결/거울 조작 동시 요청 2회에도 같은 학생 근거는 1개. 별도 학생 레코드는 서로 보존                                                                                                                                                                                          | 스토어 경쟁 통합, 실제 저장 순서 제어                                                                |
| AC-08 | 근거·주제 저장 실패 후 메모리 유령 0, load 실패는 쓰기 0회. 동기화 교체/reload와 사용자 mutation을 양 순서로 끼워 넣어 최신 read 기반 파일/메모리가 일치하며 기존 checksum 충돌 정책을 유지한다. moveToThread/moveToNewThread/unclassify가 중첩 공개 잠금 await 없이 제한 시간 내 종료한다 | 실제 withFileLock·SyncFromCloud 경로를 쓰는 지연/실패 통합, 후속 mutation readback·명시 완료 timeout |
| AC-09 | 새 주제 취소 쓰기 0회. 생성 실패·이동 실패·보상 삭제 실패 각각 원본 보존·ID 체크포인트·readback/재시도 중복 주제 0. 보상 시 다른 기록이 사용한 주제는 보존. 다른 학생/삭제/선택 뒤 닫힌 주제 연결 거절; 다시 열기 성공 후에만 연결                                                         | store/picker 실패 주입, 저장 직전 주제 닫힘·다시 열기 실패/성공, 생성/보상 불확실 결과 조회          |
| AC-10 | 저장 CTA가 현재 roster 로드 뒤 같은 학생·같은 근거로 이동하고 한 요청을 두 번 소비하지 않는다                                                                                                                                                                                              | 실제 부모 경로 통합                                                                                  |
| AC-11 | 보드 ‘관찰 이어 쓰기’는 같은 학생·주제의 빈 입력, ‘원본 보기·수정’은 기존 원본 편집을 연다                                                                                                                                                                                                 | 교과/담임 왕복 E2E                                                                                   |
| AC-12 | 미저장 폼·첨부·700ms 초안 저장 중 이동 시 유실/다른 학생 저장 없음. 취소/저장 실패면 기존 화면 유지                                                                                                                                                                                        | fake timer 통합 + 실제 조작                                                                          |
| AC-13 | 원본만 수정/근거만 수정 양쪽 모두 ‘원본과 내용이 달라요’. 자동 내용 변경 0회                                                                                                                                                                                                               | 비교 단위·통합                                                                                       |
| AC-14 | 명시 반영은 content/date/slots만 변경하고 date/slots null은 키 제거, sourceFields 부재는 미변경. 대화상자 열린 뒤 원본 또는 근거의 3필드/소유권 수정·삭제 시 쓰기 0회와 재확인. 그동안 바뀐 주제·영역·AI 제외는 최신값 보존하고 금지 표현 재판정                                           | 양쪽 수정·삭제를 적용 직전에 주입, 빈 날짜/장면/부재 patch·최신 분류 필드별 단언                     |
| AC-15 | 로딩 실패와 source 없음 구분. 원본 삭제 후 정리 근거 남음. 과제·평가 출처에 신규 비교가 오표시되지 않음                                                                                                                                                                                    | 로딩 상태·타 source 테스트                                                                           |
| AC-16 | (a) 확인된 적격 원본: 재노출 안내→삭제→미분류 거울. (b) 원본 없음/조회 실패/출결/공백/평가·과제·첨부: 재노출 약속 없음. (c) 되돌리기: 중복 소스 없을 때 원래 주제·영역·제외 복구, 이미 재저장했으면 1개 유지하고 새 편집 보존. (d) 수동 삭제: 재노출 안내 없음                             | 네 시나리오를 별도 보드 통합 테스트로 검증                                                           |
| AC-17 | 출결·공백 본문은 자동 거울/그 건수에서 제외. 기존 원본·저장 근거·주제 미지정 관찰은 보존                                                                                                                                                                                                   | 후보·건수 회귀                                                                                       |
| AC-18 | 1280/1920, 큰 글꼴, 밝음/어두움/유리 모드에서 본문/버튼 잘림 없음. 새 dialog에 focus trap·Esc·원래 포커스 복귀·한국어 이름 존재                                                                                                                                                            | 로컬 HTTP 실제 렌더·스크린샷·키보드                                                                  |
| AC-19 | 모바일 교과 장면 기록·편집과 담임 간단 기록이 데스크톱 거울로 보이고 기존 주제 근거를 덮지 않는다. 모바일 변경을 반영한 sync reload와 데스크톱 연결/비교 적용이 겹쳐도 기존 snapshot 충돌 정책에 따른 최종 파일과 메모리가 일치한다                                                        | 모바일 fixture→실제 sync/reload→desktop readback, 반대 순서 interleaving + 모바일 뷰 확인            |
| AC-20 | 공개 /docs가 새 입력·주제 선택·원본/근거 차이·삭제 후 재노출 설명을 반영한다                                                                                                                                                                                                               | docs:check·landing build·문서 확인                                                                   |

### 확장 테스트 계획

- **단위:** 새 비교 순수 함수(장면 순서·빈 값·줄바꿈·소스 없음), 후보 적격성, 주제 소유권/소스 키 검증. 데이터 변환을 그대로 베낀 테스트 대신 차이가 사라지거나 다른 학생에게 붙는 실패를 겨냥한다.
- **통합:** 기존 `src/usecases/studentRecords/collectEvidenceCandidates.test.ts`, `src/adapters/components/RecordDraft/__tests__/RecordEvidenceBoard.test.tsx`, `src/adapters/components/ClassManagement/__tests__/observationSlotLifecycle.test.ts`, `src/adapters/stores/__tests__/useInquiryThreadStore.test.ts`, `src/adapters/stores/__tests__/useObservationStore.slots.test.ts`, `src/adapters/repositories/JsonObservationAttachmentRepository.test.ts`를 확장한다. **신규 제안** `src/adapters/stores/__tests__/recordEvidenceSourceLifecycle.test.ts`, `src/adapters/components/RecordDraft/__tests__/observationEvidenceFlow.test.tsx`에서 S1/S3 실제 부모·스토어 경로를 묶는다. 여기에 공용 fileWriteLock을 mock으로 생략하지 않은 동기화→변이/변이→동기화·reload 뒤늦은 게시·move 완료 timeout 테스트를 포함한다. 원본/주제 생성 오류, 첨부 부분 오류, 보상 오류는 각각 별도 readback 시나리오로 검증하고 비교창 stale 확인·명시 삭제·조건부 삭제 문구도 분리한다. 확정 경로는 S0의 기존 테스트 위치 확인 후 따른다.
- **E2E:** 가짜 학생 2명으로 ‘교과 관찰→주제→보드→원본 편집→비교 반영’, ‘담임 상담/관찰→주제→보드’, ‘2명×2일→개별 보드’를 실행한다. 실제 Electron 저장 및 재시작 readback 1회로 브라우저 메모리 성공과 구분한다. 모바일은 새 화면 제작 대신 기존 저장 호환 시나리오를 검증한다.
- **관측:** 테스트/QA 로그는 단계명·성공/실패·건수만 기록한다. 학생 이름·본문·source ID를 로그/분석 보고서에 쓰지 않는다. UI 오류 문구와 디스크 readback을 함께 증거로 남긴다. 새 원격 계측 이벤트는 추가하지 않는다.
- **전체 게이트:** `npx tsc --noEmit`(0 errors), `npm run lint`, `npm run test`, `npm run regression-check`; `landing`에서 `npm run docs:check`, `npm run build`. 수정 범위 개별 검증 후 전체 게이트를 한 번 실행하고 새 실패/변경이 있을 때만 재실행한다. 모든 게이트와 AC를 충족해야 구현 완료다.

## 8. 사전 실패 분석 3가지

| 실패 시나리오                                                                      | 조기 신호                                                                                  | 방지/복구                                                                                                                          |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| 주제 연결 추가 후 자동저장에서 A 기록이 B에게 붙는다                               | 명시 저장은 통과하지만 전환 저장 테스트가 없거나 저장 callback이 현재 studentRef를 읽는다  | 저장 시점 소유자·본문·주제 캡처, 스토어 ownership 재검사, AC-05·09·12를 S2 이전 필수                                               |
| ‘저장 실패’인데 원본·주제가 이미 보이거나 동기화 직후 연결이 사라진다              | 성공 전 memory set, 파일별 첨부 실패 흡수, store 전용 큐, 공개 잠금 중첩, 무조건 폼 초기화 | S1 공용 잠금·최신 read/성공 publish와 단계별 ID 체크포인트, AC-06~09·19. 앱 강제 종료 뒤 디스크에 남은 원본/근거로만 보드에서 복구 |
| 교사가 다듬은 근거를 원본 수정 감지라고 오해해 덮거나 삭제 후 재노출을 버그로 본다 | ‘원본 변경됨’ 표현, 자동 refresh effect, 삭제 안내에 원본 설명 없음                        | 현재 비교 표현만 사용·명시 비교 적용·삭제 이름/재노출 안내, AC-13~16                                                               |

## 9. ADR 제안 — 아직 채택하지 않음

- **Decision:** 기록 사실을 먼저 입력하고 주제는 보조 연결한다. 소속 정본은 근거만 유지한다. 신규 연결은 단일 학생·단일 날짜부터 지원한다. 원본과 근거는 현재 비교와 명시 반영으로 다루고 자동 동기화하지 않는다.
- **Drivers:** 입력 부담, 소유권/저장 회복, 현재 보드 계약과의 연속성.
- **Alternatives considered:** A(보드 이동만), B(선택 연결+현재 비교), C(원본 연결·기준 스냅샷/자동 동기화).
- **Why chosen:** B는 교사가 이미 아는 주제를 이어 쓰게 하면서 스키마 확장과 이력 엔진을 피한다. 실패 처리 범위는 추가 저장 경로에 필요한 만큼으로 제한한다.
- **Consequences:** 주제 선택 기록만 즉시 근거가 된다. 정리한 근거 삭제 후 확인된 적격 원본이 미분류로 다시 보이는 동작을 제품 문구로 명시한다. 닫힌 주제는 다시 열기 성공 후 연결한다. 현재 어느 쪽이 달라졌는지 시간 순서는 제공하지 않는다.
- **Follow-ups:** 실제 사용에서 다학생 공통 활동 연결 요구가 확인되면 별도 설계한다. 담임 장면 어휘 확장·모바일 주제 편집·정확한 변경 이력은 별도 작업이다. 구현 시 새 결정이 채택되면 당시 마지막 ADR 번호+1로 발행하고 DECISIONS 목록 갱신한다. 이 계획 단계에서는 번호 선점/정식 ADR 생성하지 않는다.

## 10. 실행 인계와 에이전트 배치

- 사용 가능한 종류: `default`, `worker`, `explorer`, `plan`, `metis`, `momus`, `librarian`, `lazycodex-executor`, `lazycodex-worker-low`, `lazycodex-worker-medium`, `lazycodex-worker-high`, `lazycodex-code-reviewer`, `lazycodex-qa-executor`, `lazycodex-gate-reviewer`, `lazycodex-clone-fidelity-reviewer`. Architect는 default를 읽기 전용 역할로 배정할 수 있다. 역할별 고정 모델/추론 설정은 도구 정의를 따른다.
- 합의 검토는 Planner → Architect → Critic 순서. Architect의 반대 논거/실제 tradeoff를 받은 뒤 Critic 검토. 수정 판정이면 같은 순서를 반복한다. 이번 요청에서 구현 에이전트/목표 실행을 자동 시작하지 않는다.
- **`$ralph` 후속:** 단일 구현 소유자 1명이 S0~S5 순차 수행. S1 저장 계약은 high 검토, S2~S4 구현은 medium 이상, 코드 리뷰는 읽기 전용 reviewer, 실기기 확인은 QA, 최종 gate reviewer가 증거를 재확인한다. 예시: `$ralph .omx/plans/observation-evidence-flow.plan.md 계획을 main에서 순차 구현하고 AC-01~20 및 검증 게이트를 완료해줘`.
- **Goal-Mode Follow-up Suggestions:** 장기 단계별 완료 추적이 필요하면 **`$ultragoal`**을 기본 권고한다. ‘관찰을 주제별 근거로 안전하게 이어 쓰기’라는 제품 목표로 S0~S5를 장부화하고 구현은 한 명이 순차 진행한다. 연구/성능 과제가 아니므로 `$autoresearch-goal`/`$performance-goal`로 바꾸지 않는다. 사용자가 요청하기 전 goal을 만들지 않는다.
- **`$team`/`omx team`:** 이 저장소는 병렬 구현을 금지하고 현재 Codex App은 tmux 밖이라 실행 불가다. 여기서는 실행하지 않는다. 향후 붙어 있는 tmux 환경과 사용자 요청이 모두 있으면 코드 수정이 없는 분석·리뷰·QA 증거 검토만 분담할 수 있다. 힌트: `$team`에 ‘본 계획을 읽기 전용으로 저장 안정성/사용성 검토’라고 명시하고 설치된 team skill의 실제 CLI 문법을 확인한다. `omx team` 시작 전 현재 tmux/지원 명령을 확인한다.
- **team verification:** 사용한다면 각 리뷰 담당자의 완료 상태·읽기 전용 준수(diff 0)·AC별 증거 경로를 leader가 수합하고 단일 QA 결과와 대조한다. 리뷰 결과만으로 구현 게이트 통과를 대체하지 않는다.

## 11. 인수 시 확인할 것과 정지 조건

일반 UX 선택은 위처럼 결정했으며 사용자에게 다시 묻지 않는다. 남은 것은 취향 질문이 아니라 S0에서 확인할 기술 사실이다: 최신 보드 v2 인계 여부, 이 계획 뒤 실제 파일 변경 여부, 기존 테스트 경로, 근거 카드가 분리된 최신 파일 위치. 첨부 실패 흡수와 원본/주제 optimistic publish 문제는 이미 확인했으므로 S1 해결 대상이며 다시 발견할 때까지 미루지 않는다. 앱 데이터가 가변인 상태이므로 인수 전에는 app code를 수정하지 않는다.

진행 중 다른 세션이 같은 파일을 다시 수정하면 해당 단계 구현을 멈추고 최신 diff를 읽어 인수 경계를 재확정한다. 자동 reset/락파일 삭제/검증 우회는 금지한다. 전체 게이트 실패를 기존 실패로 돌리려면 S0 동일 명령 출력 근거가 있어야 하며 실패 상태에서는 이 계획의 전체 구현 완료를 선언하지 않는다.

## 12. 1차 검토 반영 기록

| 검토 쟁점                                                  | 반영 위치                                               |
| ---------------------------------------------------------- | ------------------------------------------------------- |
| 닫힌 주제 직접 연결을 최신 ADR과 일치                      | §4.2, §5.2 잠금 직전 검증, AC-09, ADR 제안              |
| 원본·첨부·주제 생성/보상 성공 경계와 재시도 ID             | §5.1~5.2, S1, AC-06·09, 실패 주입/readback 계획         |
| 동기화 공용 파일 잠금·최신 읽기·reload 게시·중첩 대기 방지 | §5.2, S1 파일 책임, AC-08·19, 동일 JS context 한계 명시 |
| 비교창 stale 확인과 date/slots 명시 삭제                   | §5.3, S4, AC-14 및 대화상자 수정/삭제 테스트            |
| 원본 조건에 따른 삭제 후 재노출 안내                       | §5.3 상태표, S4, AC-16의 네 시나리오, ADR 제안          |

입력 재배치·선택 주제·같은 학생 왕복이라는 B안의 UX 범위는 유지했다. 안전성 보강은 이미 약속한 저장/반영 동작을 만족시키기 위한 최소 계약이며 마이그레이션·이력 엔진·영구 큐를 추가하지 않는다. S1 안전성 게이트 미달 시 A안만 별도로 인수할 수 있으나 B안 전체 완료로 간주하지 않는다.

## 13. 합의·문서 검증 기록

- 1차: Planner 초안 → Architect 보완 5건 → Critic ITERATE. 2차: Planner 수정 → Architect 승인 → Critic APPROVE. 승인 차단 사항 없음. 두 검토는 매회 순차 수행했다.
- 검토 증거: `.omx/drafts/observation-evidence-flow-architect-r1.md`, `.omx/drafts/observation-evidence-flow-critic-r1.md`, `.omx/drafts/observation-evidence-flow-architect-r2.md`, `.omx/drafts/observation-evidence-flow-critic-r2.md`.
- 계획 본문의 전체 경로 참조 53개 중 기존 경로 44개 확인, 9개는 신규 예정으로 표시. 줄 번호 범위 오류 0개, AC-01~20 존재 확인. 최종 저장 후 프로젝트 사본과 SHA-256 일치 확인 대상.
- 직전 분석에서 관련 기존 테스트 3개 파일/47개 통과를 확인했다. 이번 계획 작성에서는 앱 코드 변경·전체 구현 게이트·실기기 검증을 실행하지 않았다. 계획 승인과 구현 검증을 구별한다.
- 실행용 계획은 `.omx/plans/observation-evidence-flow.plan.md`, 프로젝트 보관 사본은 `docs/01-plan/features/observation-evidence-flow.plan.md`다. 다음 계획 변경 시 두 파일을 함께 갱신한다. 별도 정식 ADR은 아직 채택하지 않는다.
