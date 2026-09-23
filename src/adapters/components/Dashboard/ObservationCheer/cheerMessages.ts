/**
 * 관찰 기록 응원 문구(ADR-135). 건수·비교·꾸중을 넣지 않는다(ADR-134).
 * 문구는 조정 가능하다. 뜻(응원·숫자 없음)은 고정이다.
 */
import { weekStartOf } from '@domain/rules/schoolCalendarDays';

/** 오늘 이 컴퓨터에서 처음 관찰 기록을 저장했을 때 — 핀이 손을 흔든다. */
export const FIRST_RECORD_MESSAGES: readonly string[] = [
  '오늘 첫 기록을 남겼어요',
  '좋은 시작이에요',
  '오늘도 기록으로 하루를 열었네요',
  '오늘의 관찰을 잘 붙잡아 두었어요',
  '기록을 시작했어요. 오늘도 힘내요',
  '오늘 한 장면이 남았어요',
];

/** 반 하나가 한 바퀴를 마쳤을 때 — 핀이 만세를 한다. `{반}` 자리에 카드 이름이 들어간다. */
export const LAP_MESSAGES: readonly string[] = [
  '{반}, 한 바퀴를 돌았어요!',
  '{반} 한 바퀴 완주! 고생 많으셨어요',
  '{반} 모두를 한 번씩 만났네요',
  '{반} 한 바퀴를 마쳤어요. 멋져요',
];

export const ZERO_RECORD_LINE = '첫 기록을 남겨 볼까요?';

export function streakLine(weeks: number): string {
  return `${weeks}주째 꾸준히`;
}

export function termWeeksLine(weeks: number): string {
  return `이번 학기 기록한 주 ${weeks}주`;
}

export function pickMessage(pool: readonly string[], seed: number): string {
  const idx = ((Math.floor(seed) % pool.length) + pool.length) % pool.length;
  return pool[idx] ?? pool[0] ?? '';
}

// ── 2·3차(ADR-137) ──

/** 쉬는 날 핀 줄 */
export const RESTING_LINE = '오늘은 쉬어요';

/**
 * 먼저 거는 말 — 핀 줄·토스트 문구. 모르는 종류는 null(그 말은 다른 작업이 문구를 단다).
 * 지난주 정리를 다음 등교일에 알릴 때는 "지난주"라고 말한다.
 */
export function talkNoticeText(
  talk: { readonly kind: string; readonly key: string },
  today: string,
): string | null {
  if (talk.kind === 'weekly') {
    return talk.key < weekStartOf(today) ? '지난주 정리가 왔어요' : '이번 주 정리가 왔어요';
  }
  if (talk.kind === 'retrospect') return '이번 학기 돌아보기가 왔어요';
  return null;
}

// ── 학교 달력 인사(돌아보기 spec 4-6, 설계 recap-work-and-moments §6·§8) ──

/** 끝 글자에 받침이 있으면 '이에요', 없으면 '예요'. 한글이 아니면 '이에요'. */
export function ieyo(word: string): string {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0);
  if (Number.isNaN(code) || code < 0xac00 || code > 0xd7a3) return '이에요';
  return (code - 0xac00) % 28 === 0 ? '예요' : '이에요';
}

function monthDayKo(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${m ?? ''}월 ${d ?? ''}일`;
}

/** 일정 제목의 끝 괄호(예: "(1일차)")를 떼어 한마디에 넣기 좋게. */
function cleanTitle(title: string): string {
  return title.replace(/\s*[(（][^()（）]*[)）]\s*$/, '').trim() || title.trim();
}

/**
 * 인사 한마디 — 종류마다 따뜻한 한 문장. 학생 이름은 없다. 문구는 조정 가능하다.
 * - 계절을 모르면 계절을 말하지 않는다(짐작 금지).
 * - 수능·앞당긴 스승의 날은 "내일"이 아니라 **날짜로** 말한다(그 앞 등교일이 바로 전날이 아닐 수 있다).
 */
export function momentGreeting(
  moment: {
    readonly kind: string;
    readonly title: string | null;
    readonly targetDate: string;
    readonly term: string;
  },
  today: string,
): string {
  switch (moment.kind) {
    case 'termStart':
      return moment.term.endsWith('-1')
        ? '새 학기가 시작됐어요. 좋은 한 해 보내세요'
        : '2학기가 시작됐어요. 다시 힘내 봐요';
    case 'vacationEve': {
      const title = (moment.title ?? '').replace(/\s+/g, '');
      if (title.includes('종업식')) return '한 학년을 마무리하는 날이에요. 정말 고생 많으셨어요';
      const month = Number(today.slice(5, 7));
      const summer =
        title.includes('여름') || (!title.includes('겨울') && (month === 7 || month === 8));
      const winter =
        title.includes('겨울') || (!title.includes('여름') && [12, 1, 2].includes(month));
      if (summer) return '여름방학이 시작돼요. 푹 쉬고 만나요';
      if (winter) return '겨울방학이 시작돼요. 따뜻하게 보내세요';
      return '방학이 시작돼요. 푹 쉬고 만나요';
    }
    case 'teachersDay':
      return moment.targetDate === today
        ? '오늘은 스승의 날이에요. 애쓰시는 선생님, 고맙습니다'
        : `${monthDayKo(moment.targetDate)}은 스승의 날이에요. 애쓰시는 선생님, 고맙습니다`;
    case 'suneungEve':
      return `${monthDayKo(moment.targetDate)}은 수능이에요. 감독 가시는 선생님들 힘내세요`;
    case 'schoolEvent': {
      const t = cleanTitle(moment.title ?? '행사');
      return `오늘은 ${t}${ieyo(t)}. 무사히 잘 마치시길!`;
    }
    case 'ceremony':
      return (moment.title ?? '').includes('졸업식')
        ? '오늘은 졸업식이에요. 그동안 고생 많으셨어요'
        : '오늘은 입학식이에요. 새로운 만남이 되시길';
    default:
      return '오늘도 좋은 하루 보내세요';
  }
}

/**
 * 그날 말의 알림 문구(핀 줄·토스트) — 인사가 들어 있으면(주인공이든 접힌 조각이든) 인사를 말한다.
 * 방학식 날은 늘 한 주 정리와 겹치므로, 이렇게 하지 않으면 방학 인사가 알림으로 한 번도 나가지 않는다.
 */
export function talkNotice(
  talk: {
    readonly main: { readonly kind: string; readonly key: string };
    readonly folded: readonly { readonly kind: string }[];
  },
  today: string,
  moment: Parameters<typeof momentGreeting>[0] | null,
): string | null {
  const hasMoment = talk.main.kind === 'moment' || talk.folded.some((c) => c.kind === 'moment');
  if (hasMoment && moment !== null) return momentGreeting(moment, today);
  return talkNoticeText(talk.main, today);
}
