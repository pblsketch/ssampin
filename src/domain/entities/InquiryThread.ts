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
 *  - **AI 는 흐름을 저장하지 않는다.** 묶기·장면 배치·주제 잇기를 **제안**할 수는 있지만(ADR-085 수정,
 *    ADR-103), 화면에 점선으로 뜰 뿐이고 [적용] 을 누르기 전에는 파일에 아무것도 쓰이지 않는다.
 *  - **행특에도 쓴다**(ADR-103 이 옛 금지를 뒤집었다). 다만 틀이 다르다 — 행특은 "탐구"가 아니라
 *    "사람"이라 생활 틀(특성·장면·성장·평가)을 쓴다(`narrativeFrames.ts`). `classId` 는 수업반 컨텍스트.
 *
 * 저장: inquiry-threads.json = { records: InquiryThread[] }. 동기화(snapshot)·보관함·학년도 전환 대상.
 * 낱장 쪽 연결은 `ObservationRecord.threadId?` · `RecordEvidence.threadId?`(선택 필드)로 건다.
 */
import type { NarrativeRole } from '../rules/narrativeParagraphs';
import type { RecordModuleId } from './RecordWritingStyle';

export type InquiryThreadStatus = 'open' | 'closed';

/**
 * 서사 장면 하나 — **초안 문단 하나에 대한 지시**(ADR-103).
 *
 * ★"장면 = 문단"은 지시이지 보장이 아니다. 모델은 근거가 없는 장면을 건너뛴다
 *   (`RecordWritingStyle.ts` 의 같은 경고). 그래서 초안 문단의 표식 배열은 장면 역할 배열의
 *   **부분수열**이면 정상이고, 순서가 뒤바뀌면 실패다.
 * ★`role` 은 형광펜 4색과 **같은 저장값**이다. 틀 이름(특성·장면·성장)은 화면 라벨일 뿐이고
 *   요청서로 나가는 표식은 언제나 `[평가] [동기] [과정] [결과]` 넷이다.
 */
export interface NarrativeScene {
  readonly id: string;
  /** 틀 자리. 저장값 4종 고정 — 색·표식·파서가 이 값을 그대로 쓴다. */
  readonly role: NarrativeRole;
  /** 세부 카테고리(작성 방식 카탈로그의 요소 id). 없으면 틀 이름만 쓴다. */
  readonly moduleId?: RecordModuleId;
  /** 선생님이 직접 적은 장면 이름. 카테고리 대신 또는 덧붙여 쓴다. */
  readonly label?: string;
  /**
   * 이 장면에서 선생님이 읽은 것. 요청서에 실린다 — **자유 글이라 보낼 때 가린다.**
   * 상한 `NARRATIVE_NOTE_MAX`.
   */
  readonly note?: string;
  /**
   * 메모의 출처. AI 서사 초안 [적용]으로 들어온 메모는 `'ai'`(화면이 배지로 알린다),
   * 선생님이 손대면 `'teacher'`. 없으면 선생님이 쓴 것으로 본다(옛 자료 호환).
   */
  readonly noteSource?: 'ai' | 'teacher';
  /**
   * **앞 장면에서 이 장면으로** 넘어가는 이음말(ADR-108) — "질문이 실험으로 이어짐" 같은 장면 사이의 서사.
   * 첫 장면에는 뜻이 없다(앞 장면이 없다). 자유 글이라 요청서에 실을 때 가린다. 상한 `NARRATIVE_NOTE_MAX`.
   * ★근거 사이가 아니라 **장면 사이**다. 근거의 앞뒤는 장면 안 차례가 말한다(오너 결정 2026-09-11).
   */
  readonly leadIn?: string;
  /**
   * 이 장면에 놓인 근거들, 순서대로.
   * ★**소유 판정은 여기서 하지 않는다.** 이 목록이 가리키는 근거가 정말 이 주제 것인지는
   *   읽는 자리(`narrativeScenes.scenesOf`)가 한 곳에서 가린다 — 근거 파일과 주제 파일이
   *   다른 시점에 내려올 수 있고, 소유를 바꾸는 쓰기는 근거 파일 쪽에 있기 때문이다.
   */
  readonly evidenceIds: readonly string[];
}

/**
 * 앞 주제와의 연결 — "기초 탐구에서 심화로" 같은 **주제 사이의 서사**(오너 결정 2026-09-10).
 * 앞 주제는 하나만 둔다(고리를 만들 수 없게). 뒤 주제는 여럿일 수 있다.
 */
export interface NarrativeLink {
  readonly fromThreadId: string;
  /** 이음말. 자유 글이고 화면의 칩은 입력 지름길일 뿐이다. 상한 `NARRATIVE_NOTE_MAX`. */
  readonly note?: string;
}

/** 장면 메모·이음말·근거 메모의 글자 수 상한(오너 결정 2026-09-10). 요청서 분량 예산에도 든다. */
export const NARRATIVE_NOTE_MAX = 200;

/**
 * 한 주제에 둘 수 있는 장면 수 상한.
 * ★「작성 구성」 블록이 요청서에 실려 명령줄(32,767자)에 나가므로 길이가 계산 가능해야 한다.
 */
export const NARRATIVE_SCENE_MAX = 20;

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
  /**
   * 서사 장면 목록(ADR-103). **없으면 예전과 똑같이 동작한다** — 부재는 "기본 뼈대"와 같고
   * 요청서는 기준선 그대로다. 장면을 안 쓰는 선생님에게 아무것도 달라지지 않는다.
   */
  readonly scenes?: readonly NarrativeScene[];
  /** 이 주제가 이어받는 앞 주제. 없으면 독립 줄기. */
  readonly link?: NarrativeLink;
  /**
   * 화면 차례 — 근거 지도 주제 머리의 ↑↓ 로 정한다(오너 요청 2026-09-11). 작을수록 위.
   * 없으면 만든 차례 그대로이고, 정한 주제들 **뒤**에 온다. 이어진 뒤 주제는 이 값이 아니라 앞 주제를 따른다.
   * ★초안 내용과는 무관하다(이어진 흐름의 차례는 `link` 가 정한다).
   */
  readonly order?: number;
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
/**
 * 화면에 늘어놓는 차례 — 열린 주제 먼저, 그다음 선생님이 ↑↓ 로 정한 `order`, 정하지 않은 주제는
 * 그 뒤에 만든 차례대로. 근거 지도·보드·초안 화면의 주제 칩·[근거] 탭이 모두 이 차례를 쓴다.
 */
export function sortThreadsForDisplay<T extends Pick<InquiryThread, 'status' | 'order'>>(
  threads: readonly T[],
): T[] {
  return threads
    .map((t, i) => ({ t, i }))
    .sort((a, b) => {
      if (a.t.status !== b.t.status) return a.t.status === 'open' ? -1 : 1;
      const ao = a.t.order ?? Number.MAX_SAFE_INTEGER;
      const bo = b.t.order ?? Number.MAX_SAFE_INTEGER;
      return ao !== bo ? ao - bo : a.i - b.i;
    })
    .map((x) => x.t);
}

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
