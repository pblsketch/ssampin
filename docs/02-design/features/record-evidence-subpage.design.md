# record-evidence-subpage — 설계서 (Design v1.0)

- 상태: Phase 1 구현 완료 (2026-06-24)
- 계획: [Plan](../../01-plan/features/record-evidence-subpage.plan.md) · 결정: [ADR-014](../../../DECISIONS.md)

## 1. 데이터 모델

`src/domain/entities/RecordEvidence.ts`

```ts
type EvidenceSourceType = 'manual' | 'observation' | 'studentRecord' | 'assignment' | 'evaluation';

interface RecordEvidence {
  id: string;
  studentRef: string; // 담임=Student.id / 수업반=tc:{classId}:{studentKey} (RecordDraft 동일 체계)
  areas: readonly RecordArea[]; // 1개 이상, 복수 분류 가능
  content: string;
  date?: string; // YYYY-MM-DD
  sourceType?: EvidenceSourceType; // 미지정=manual
  sourceId?: string; // 끌어온 원본 레코드 id
  classId?: string; // 수업반 컨텍스트
  createdAt: number;
  updatedAt: number;
}
interface RecordEvidenceData {
  records: readonly RecordEvidence[];
}
```

- 검증 헬퍼: `normalizeEvidenceAreas`(중복 제거·순서 보존), `areEvidenceAreasValid(areas, allowed)`(비어있지 않고 허용 영역 부분집합 — 담임이 세특을 근거로 분류하는 작성주체 위반 차단).
- 저장키 `record-evidence`(별도 파일, 기존 `record-drafts` 무영향, 마이그레이션 불필요·additive).

## 2. 레이어 배선 (RecordDraft 수직 슬라이스 미러)

- `domain/repositories/IRecordEvidenceRepository.ts` — `getRecordEvidence` / `saveRecordEvidence`.
- `adapters/repositories/JsonRecordEvidenceRepository.ts` — `storage.read/write('record-evidence')`.
- `adapters/stores/useRecordEvidenceStore.ts` — Zustand. `load`(loaded 가드) / `add`(영역 정규화·UUID·시각 부여) / `update`(부분 패치) / `remove` / `exists` / `getByStudentRef` / `getByArea`. 통째 저장(persist) — 미로드 상태 저장 시 기존 파일 유실 방지(load 선행).
- `adapters/di/container.ts` — `export const recordEvidenceRepository`.

## 3. UI

### 3.1 모드 토글 (RecordDraftView)

`RecordDraftView`(담임·수업반 공용)에 `viewMode: 'draft' | 'evidence'` 상태 추가. 상단 바에 [초안 | 근거 자료] 세그먼트 토글. `evidence`면 `<RecordEvidenceView ... headless />` 렌더(상단 바·토글은 부모가 제공), 아니면 기존 초안 본문(유형 탭+입력 리스트). 복사·내보내기 버튼은 draft 모드에서만 노출.

### 3.2 RecordEvidenceView (신규, master-detail)

- 유형(area) 탭 — `areasForContext(level, author)`로 제한(작성주체 결속). 탭 배지=선택 학생의 해당 영역 근거 수.
- 좌: 학생 목록(번호·이름·활성 영역 근거 수 배지). 우: 선택 학생의 활성 영역 근거.
- 근거 등록/수정 폼 — 내용 textarea + 영역 다중 토글(기본=활성 영역) + 날짜. 저장 시 `add`/`update`.
- 끌어오기 — 담임=`useStudentRecordsStore.records`(studentId=Student.id 필터), 수업반=`useObservationStore`(studentId=studentKey, classId 필터). 후보를 `{id,date,content,label}`로 정규화, 이미 `sourceId`로 추가된 항목은 "추가됨" 비활성. 추가 시 `sourceType`/`sourceId` 보존.
- 삭제 — `remove(id)`.

## 4. basisObservationIds 와의 관계

- `RecordEvidence` = 교사 큐레이션 창고(편집 가능, areas N개).
- `RecordDraft.basisObservationIds` = 초안에 붙은 AI 인용 출처(읽기 전용 provenance).
- 화면 라벨("초안" / "근거 자료")로 구분, 데이터·생애주기 분리.

## 5. 디자인 시스템 준수

- 모든 색·간격 `sp-*` 토큰(하드코딩 HEX 없음), material-symbols 아이콘, 한국어 UI. 기존 `RecordDraftView` 시각 규칙(탭·칩·배지·ring) 재현.

## 6. Phase 2 경계 (미착수)

AI가 근거 기반 초안을 쓰려면 별도 저장소 `ssampin-ai-bridge`에 읽기 도구 `get_record_evidence`를 추가하고 번들(`electron/ai-bridge/index.mjs`)을 재생성한다. 쓰기 계약 SSOT(`scripts/contract/aiBridgeWriteContract.def.mjs`)는 읽기 도구라 불변. 초안↔근거 양방향 꼬리표(`basisEvidenceIds`)는 더 큰 크로스레포 변경이라 후속.
