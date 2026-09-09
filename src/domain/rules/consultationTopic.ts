/**
 * 상담 주제 — 교사가 미리 만든 선택지와, 학부모·학생이 직접 적은 글을 한 칸에 담는 규칙.
 *
 * ## 왜 한 칸인가
 *
 * 예약자가 남기는 상담 주제는 `consultation_bookings.memo_encrypted` 한 칸에
 * **관리 키로 잠긴 채** 들어간다. 서버는 이 값을 풀 수 없다(ADR-060·095).
 * 고른 주제도 "학교폭력" 처럼 민감할 수 있으므로 평문 칸을 새로 만들지 않고
 * 같은 잠긴 칸 안에 넣는다. 그래서 예약 RPC·엣지 함수·내보내기·캘린더 경로가
 * 하나도 바뀌지 않는다.
 *
 * ## 담는 모양
 *
 * ```
 * [주제] 학교생활 · 교우관계
 * 요즘 친구 문제로 힘들어하는 것 같습니다.
 * ```
 *
 * - 첫 줄이 `[주제] ` 로 시작하면 그 줄이 **고른 주제**, 나머지가 **직접 적은 글**이다.
 * - 접두사가 없으면 통째로 직접 적은 글이다 — 이 기능 이전에 들어온 예약이 그렇다.
 *   그래서 옛 예약도 그대로 열린다.
 *
 * ## 여기 있는 이유 (레이어)
 *
 * 이 파일은 domain 이라 외부 의존성이 없다. 학부모 예약 화면은 별도 Next.js
 * 프로젝트(`landing/`)라 이 파일을 import 할 수 없어 **같은 규칙이 한 벌 더 있다**:
 * `landing/src/components/booking/consultationTopic.ts`. 한쪽을 고치면 반드시
 * 다른 쪽도 고칠 것 — 접두사·구분자가 어긋나면 선생님 화면에서 주제가 글자로 보인다.
 */

/** 고른 주제 줄임을 알리는 접두사. 예약자가 직접 적은 글과 구분하는 유일한 표식. */
export const TOPIC_PREFIX = '[주제] ';

/** 고른 주제들을 잇는 구분자. */
export const TOPIC_SEPARATOR = ' · ';

/** 교사가 만들 수 있는 선택지 최대 개수. 예약 화면이 스크롤 덩어리가 되지 않는 선. */
export const MAX_TOPIC_OPTIONS = 10;

/** 선택지 한 개의 최대 글자 수. 예약 화면에서 한 줄에 들어가는 길이. */
export const MAX_TOPIC_OPTION_LENGTH = 20;

/** 예약자가 고른 주제 + 직접 적은 글. */
export interface ConsultationTopic {
  /** 교사가 만든 선택지 중 예약자가 고른 것들. 없으면 빈 배열. */
  readonly topics: readonly string[];
  /** 예약자가 직접 적은 글. 없으면 빈 문자열. */
  readonly note: string;
}

/**
 * 선택지 한 개를 저장 가능한 글자로 다듬는다.
 *
 * 줄바꿈·연속 공백을 한 칸으로 눕히고, **구분자와 같은 모양(` · `)을 없앤다.**
 * 선생님이 "진로 · 진학" 이라고 한 항목으로 적으면 예약자가 그것을 골랐을 때
 * "진로" 와 "진학" 두 개로 쪼개져 보인다 — 뜻이 상하지 않게 가운뎃점만 붙여 둔다.
 * 줄바꿈이 남으면 첫 줄만 주제로 읽혀 나머지가 메모로 새어 나간다.
 */
function sanitizeTopicOption(raw: string): string {
  return raw.replace(/\s+/g, ' ').split(TOPIC_SEPARATOR).join('·').trim();
}

/**
 * 교사가 입력한 선택지 목록을 저장 가능한 모양으로 다듬는다.
 *
 * 글자 다듬기 → 빈 항목 제거 → 길이 자르기 → 중복 제거 → 개수 제한.
 * 중복 판정은 **다듬은 뒤의 글자**로 한다. "학교생활 " 과 "학교생활" 은 같은 것이다.
 */
export function normalizeTopicOptions(raw: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of raw) {
    const trimmed = sanitizeTopicOption(item).slice(0, MAX_TOPIC_OPTION_LENGTH).trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
    if (result.length >= MAX_TOPIC_OPTIONS) break;
  }
  return result;
}

/**
 * 고른 주제와 직접 적은 글을 저장할 한 덩어리로 만든다.
 *
 * 둘 다 비어 있으면 빈 문자열 — 호출부는 이때 암호화 자체를 하지 않는다.
 */
export function composeConsultationTopic(selectedTopics: readonly string[], note: string): string {
  const topics = selectedTopics.map((t) => t.trim()).filter((t) => t.length > 0);
  const trimmedNote = note.trim();
  if (topics.length === 0) return trimmedNote;
  const head = `${TOPIC_PREFIX}${topics.join(TOPIC_SEPARATOR)}`;
  return trimmedNote ? `${head}\n${trimmedNote}` : head;
}

/**
 * 저장된 상담 주제를 고른 주제와 직접 적은 글로 나눈다.
 *
 * 접두사가 없으면 전부 직접 적은 글로 본다(이 기능 이전 예약).
 */
export function parseConsultationTopic(memo: string | undefined | null): ConsultationTopic {
  const raw = (memo ?? '').trim();
  if (!raw) return { topics: [], note: '' };
  if (!raw.startsWith(TOPIC_PREFIX)) return { topics: [], note: raw };

  const newlineIdx = raw.indexOf('\n');
  const headLine = newlineIdx === -1 ? raw : raw.slice(0, newlineIdx);
  const note = newlineIdx === -1 ? '' : raw.slice(newlineIdx + 1).trim();
  const topics = headLine
    .slice(TOPIC_PREFIX.length)
    .split(TOPIC_SEPARATOR)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  return { topics, note };
}

/**
 * 엑셀 내보내기·캘린더 설명처럼 **한 줄만 들어가는 자리**를 위한 표기.
 *
 * 줄바꿈을 넣으면 CSV 칸이 깨지므로 여기서 한 줄로 눕힌다.
 */
export function formatConsultationTopicLine(memo: string | undefined | null): string {
  const { topics, note } = parseConsultationTopic(memo);
  const head = topics.join(', ');
  if (head && note) return `${head} / ${note}`;
  return head || note;
}
