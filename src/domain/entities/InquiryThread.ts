/**
 * InquiryThread 엔티티 — 학생 한 명의 **한 주제에 대한 기록 줄기(탐구 흐름)**.
 *
 * 왜 필요한가: 관찰·과제·평가 낱장은 서로 연결되지 않은 채 근거 창고에 한 줄로 쌓인다. AI 는 그
 * 자루를 통째로 받고, 그 구조가 "활동 나열형" 세특을 만든다. 좋은 세특은 질문으로 이어진 **하나의
 * 탐구 서사**를 깊게 쓴 것이다(`docs/03-analysis/record-draft-flow-v2-inquiry-thread.analysis.md` §2·§5).
 * 이 엔티티가 그 "이어짐"의 단위다. 초안은 흐름 하나를 입력으로 받는다.
 *
 * 만드는 자리: **근거 창고에서 묶는 것이 기본 경로**다(오너 결정 2026-09-04). 주제는 기록이 몇 개
 * 쌓인 뒤에야 드러나기 때문이다. 입력 시점의 "이 흐름에 붙일까요?"는 보조 경로.
 * ★ADR-072 결정 6 과 충돌하지 않는다 — 그 결정은 "슬롯을 학기말에 창고에서 분류하는 배치"를 폐기했다.
 *   슬롯은 기록 하나의 속성이라 쌓는 순간 탭 한 번이 맞고, 주제는 다르다.
 *
 * 불가침:
 *  - **선택이다.** 낱장 기록은 흐름 없이도 그대로 저장된다. 필수로 만들면 입력이 막힌다.
 *  - **AI 가 흐름을 자동 생성하지 않는다.** 묶기는 교사가 하고, 제안은 키워드 포함 검사까지다.
 *  - **담임 행특에는 쓰지 않는다.** 행특은 "탐구"가 아니라 "사람"이다. `classId` 는 수업반 컨텍스트.
 *
 * 저장: inquiry-threads.json = { records: InquiryThread[] }. 동기화(snapshot)·보관함·학년도 전환 대상.
 * 낱장 쪽 연결은 `ObservationRecord.threadId?` · `RecordEvidence.threadId?`(선택 필드)로 건다.
 */

export type InquiryThreadStatus = 'open' | 'closed';

export interface InquiryThread {
  readonly id: string;
  /** 학생 신원 키 — RecordDraft·RecordEvidence 와 동일 체계(담임=Student.id / 수업반='tc:{classId}:{studentKey}'). */
  readonly studentRef: string;
  /** 수업반 컨텍스트의 TeachingClass.id. */
  readonly classId?: string;
  /**
   * 주제 이름. 후보의 1순위는 **수행평가 이름**(오너 결정) — 교사가 평가계획서에 이미 정해 둔 말이라
   * 학기 내내 같은 이름으로 부른다. 그다음 과제 제목·성취기준 키워드.
   */
  readonly title: string;
  /**
   * 매칭 키워드 — 미분류 근거에 "이것도 이 주제?" 를 띄우는 문자열 검사용. 루브릭 요소 이름·성취기준
   * 핵심어·교사가 직접 적은 말. **성취기준 원문 문장은 넣지 않는다**(복사형 세특의 몸통이 된다).
   */
  readonly keywords: readonly string[];
  /** 연결된 2022 개정 성취기준 코드(예: '[9수02-15]'). 코드만, 원문은 별도 번들에서 찾는다. */
  readonly standardCodes?: readonly string[];
  /**
   * 교사의 평가적 기술 키워드 — 세특 끝에 오는 "역량 명명". **분야를 붙인 형태**를 권장한다
   * ("경제 현상에 대한 자료 해석력"). AI 가 짓지 않고 교사가 적는다.
   */
  readonly competencyKeywords?: readonly string[];
  /** 다음 탐구 메모 — 남은 질문·다음 학기로 이어 볼 것(과제 집착력의 근거가 된다). */
  readonly nextNotes?: string;
  readonly status: InquiryThreadStatus;
  /** 학기 epoch 스탬프('2026-1'). 생성 시 부착. 구 데이터 부재 허용. */
  readonly term?: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface InquiryThreadData {
  readonly records: readonly InquiryThread[];
}

const INQUIRY_THREAD_STATUSES: ReadonlySet<string> = new Set(['open', 'closed']);

export function isInquiryThreadStatus(v: unknown): v is InquiryThreadStatus {
  return typeof v === 'string' && INQUIRY_THREAD_STATUSES.has(v);
}

/**
 * 키워드 목록 정규화 — 공백 정리·빈 값 제거·중복 제거(첫 등장 순서 보존).
 * 매칭은 `includes` 문자열 검사이므로 대소문자·공백이 어긋나면 조용히 못 찾는다. 저장 직전에 부른다.
 */
export function normalizeThreadKeywords(keywords: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of keywords) {
    const v = k.trim();
    if (v.length === 0 || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}
