/**
 * RecordEvidence 엔티티 — 교사가 학생별로 모아 분류하는 "생기부 작성 근거 자료".
 *
 * 생활기록부 초안(RecordDraft)의 보조 입력 재료다. 교과 관찰기록·담임 누가기록 등 여기저기 흩어진
 * 데이터를 끌어오거나(import) 교사가 직접 서술해 등록하고, 각 근거가 어떤 생활기록부 영역(RecordArea)의
 * 근거인지 분류한다. AI 브릿지(MCP)는 이 근거를 읽어 영역별 초안을 작성한다(읽기 전용 노출 — 별도 작업 범위).
 *
 * RecordDraft.basisObservationIds(AI가 초안에 인용한 관찰 근거)와는 역할이 다르다:
 *  - RecordEvidence      = 교사가 학생별로 모아 영역 분류한 "작성 재료 창고"(편집 가능, 영역 N개).
 *  - basisObservationIds = 초안 1건에 붙은 출처 꼬리표(읽기 전용 provenance).
 *
 * 저장: record-evidence.json = { records: RecordEvidence[] }. 식별자(id)·시각은 어댑터(스토어)가 채운다.
 * 법정기록이 아닌 작업용 보조 자료이므로 교사가 자유롭게 등록·수정·삭제할 수 있다.
 */
import type { RecordArea } from './RecordDraft';

/** 근거 자료의 출처 종류 — 직접 입력(manual) 또는 흩어진 기존 데이터에서 끌어옴. */
export type EvidenceSourceType =
  | 'manual' // 교사 직접 서술
  | 'observation' // 교과 관찰기록(ObservationRecord)
  | 'studentRecord' // 담임 누가기록(StudentRecord)
  | 'assignment' // 학생 제출 과제물(Submission)
  | 'attachment' // 교사 저장 자료/학생 제출 파일(ObservationAttachment)
  | 'evaluation'; // 평가(수행평가·성적 — 질적 정보만, 점수 미포함)

export const EVIDENCE_SOURCE_TYPES: readonly EvidenceSourceType[] = [
  'manual',
  'observation',
  'studentRecord',
  'assignment',
  'attachment',
  'evaluation',
];

const EVIDENCE_SOURCE_TYPE_SET: ReadonlySet<string> = new Set(EVIDENCE_SOURCE_TYPES);

export function isEvidenceSourceType(v: unknown): v is EvidenceSourceType {
  return typeof v === 'string' && EVIDENCE_SOURCE_TYPE_SET.has(v);
}

/** 출처 종류 → UI 라벨(칩·필터용). */
export const EVIDENCE_SOURCE_LABELS: Readonly<Record<EvidenceSourceType, string>> = {
  manual: '직접 입력',
  observation: '관찰기록',
  studentRecord: '누가기록',
  assignment: '과제물',
  attachment: '첨부파일',
  evaluation: '평가',
};

export interface RecordEvidence {
  readonly id: string;
  /** 학생 신원 키 — RecordDraft 와 동일 체계(담임=Student.id / 수업반='tc:{classId}:{studentKey}'). */
  readonly studentRef: string;
  /** 이 자료가 근거가 되는 생활기록부 영역들(1개 이상). 한 근거가 여러 영역의 근거일 수 있다. */
  readonly areas: readonly RecordArea[];
  /** 근거 내용(자유 서술 또는 끌어온 원문). */
  readonly content: string;
  /** 근거 일자(YYYY-MM-DD, 선택). */
  readonly date?: string;
  /** 출처 종류. 미지정(기존 데이터)은 manual 로 간주한다. */
  readonly sourceType?: EvidenceSourceType;
  /** 끌어온 원본 레코드 id(observation/studentRecord 등). manual 이면 미사용. */
  readonly sourceId?: string;
  /** 수업반 컨텍스트의 TeachingClass.id(담임이면 미사용). */
  readonly classId?: string;
  /**
   * 원본 기록에서 이어받은 관찰 슬롯("어떤 장면인가").
   * 끌어오기(import)에서 원본의 slots 를 그대로 싣는다 — 창고에서 슬롯이 사라지면
   * AI 가 근거를 읽을 때 갈래를 잃는다. 원본에 없으면 이 칸도 만들지 않는다.
   */
  readonly slots?: readonly string[];
  /**
   * AI 에 보내지 않는다는 표시(기재 금지 항목이 섞였을 때). 없으면 보낸다 — 기존 데이터 호환.
   *
   * ★프롬프트로는 못 막는다. 실측에서 금지 항목을 시스템 프롬프트에 전부 열거하고 사용자 턴
   * 끝에 다시 강조해도 모델이 세특 본문에 그대로 옮겨 적었다(2/2 → 보강 후에도 2/2 실패).
   * 그래서 **애초에 안 보낸다**(ADR-072 결정 5).
   *
   * 저장 시 `detectProhibitedTerms` 로 자동 표시하되, **교사가 켜고 끌 수 있다** — 자동 판정은
   * 오탐이 나기 마련이고, 되돌릴 수 없는 안전장치는 기능을 죽인다.
   */
  readonly excludedFromAi?: boolean;
  /**
   * 이 근거가 속한 탐구 흐름(`InquiryThread.id`). **근거 창고에서 주제로 묶는 것이 기본 경로**다
   * (오너 결정 2026-09-04) — 창고의 분류 축이 생기부 영역 탭 하나뿐이라 "주제" 축을 여기로 더한다.
   * 없으면 미분류. 부재는 빈 값이 아니다(병합에서 덮지 말 것).
   * ★브릿지 `normalizeRecord` 화이트리스트에도 같이 넣어야 AI 가 흐름 단위로 읽을 수 있다.
   */
  readonly threadId?: string;
  /**
   * 선생님이 이 근거에서 읽은 것 — 카드에 붙는 한 줄 메모(ADR-103, 상한 `NARRATIVE_NOTE_MAX`).
   *
   * ★**카드를 따라간다.** 다른 장면·다른 주제로 옮겨도 메모는 그대로다.
   * ★**원본 기록(관찰 탭)에는 쓰지 않는다.** 원본은 사실이고 이 메모는 해석이다.
   * ★요청서에 실린다 — 자유 글이라 보낼 때 본문과 **같은 세션으로** 가린다.
   */
  readonly note?: string;
  /**
   * 이 근거에서 **다른 근거로 이어지는 연결**(근거 지도, ADR-106). 앞 근거가 연결을 갖는다(from 쪽 소유).
   *
   * ★주제 소유(`threadId`)와 **독립**이다 — 다른 주제의 근거와도 이을 수 있고, 연결이 소유를 바꾸지 않는다.
   * ★상대 근거가 지워지면 연결은 **남는다**(읽는 자리 `resolveEvidenceEdges` 가 가린다). 지운 근거를 [되돌리기]로
   *   살리면 연결도 그대로 돌아온다. 근거 파일 하나에 사니 동기화·백업·학년도 전환이 근거와 같은 축으로 간다.
   * ★AI 는 연결을 저장하지 않는다 — 제안은 점선이고 [적용] 때 `source: 'ai'` 로 들어온다.
   * ★브릿지 미러에는 아직 안 실린다(`ENTITY_FIELD_CONTRACT` 의 notMirrored).
   */
  readonly links?: readonly EvidenceLink[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** 근거 → 근거 연결 하나. 뒤 근거의 id 와 선생님이 적은 이음말(설명). */
export interface EvidenceLink {
  readonly toId: string;
  /** 이음말 — 자유 글. "변화"·"뒷받침"·"다른 모습" 칩은 입력 지름길일 뿐이다. 상한 `NARRATIVE_NOTE_MAX`. */
  readonly note?: string;
  /** 누가 만들었나. 없으면 선생님. AI 제안을 적용한 연결은 `'ai'` — 화면이 배지로 알린다. */
  readonly source?: 'teacher' | 'ai';
}

export interface RecordEvidenceData {
  readonly records: readonly RecordEvidence[];
}

/**
 * 이 근거가 그 영역에 들어가는가. **영역을 하나도 정하지 않은 근거(유형 미지정)는 어느 영역에도 들어간다.**
 *
 * ★예전에는 `areas.includes(area)` 로만 걸러, 영역 없이 저장된 근거(보드에서 '전체'로 둔 채 저장한 원본,
 *   엑셀 업로드)가 초안 화면·AI 요청서 어디에도 안 나왔다. 근거 정리에서는 보이는데 초안 화면에서는
 *   사라져 "두 화면이 동기화되지 않는다"로 보였다(오너 제보 2026-09-11). 끌 수 없는 필터는 소실처럼 보인다.
 */
export function evidenceInArea(evidence: Pick<RecordEvidence, 'areas'>, area: RecordArea): boolean {
  return evidence.areas.length === 0 || evidence.areas.includes(area);
}

/**
 * 영역 목록 정규화 — 중복 제거(첫 등장 순서 보존). 입력 검증/저장 직전 호출해 같은 영역 중복 분류를 막는다.
 */
export function normalizeEvidenceAreas(areas: readonly RecordArea[]): RecordArea[] {
  const seen = new Set<RecordArea>();
  const out: RecordArea[] = [];
  for (const a of areas) {
    if (!seen.has(a)) {
      seen.add(a);
      out.push(a);
    }
  }
  return out;
}

/**
 * 근거의 영역 분류 유효성 — 1개 이상이고, 모두 허용 영역(맥락별 areasForContext 결과) 안에 있어야 한다.
 * 담임이 교과 세특 영역을 근거로 분류하는 것 같은 작성주체 위반을 막는다.
 */
export function areEvidenceAreasValid(
  areas: readonly RecordArea[],
  allowed: readonly RecordArea[],
): boolean {
  if (areas.length === 0) return false;
  const allowedSet = new Set(allowed);
  return areas.every((a) => allowedSet.has(a));
}
