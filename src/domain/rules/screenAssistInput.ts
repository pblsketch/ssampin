/**
 * 쌤핀 AI — 입력 안전장치 (**경고 전용. 차단하지 않는다.**)
 *
 * ★이 파일은 전송 여부를 결정하지 않는다. 판정 결과만 돌려준다.
 *
 * 2026-08-21 오너 결정으로 "전송 차단"에서 "경고 + 상시 가시화"로 바뀌었다(ADR-061 결정 7-4 보정).
 * 철회 사유 두 가지:
 *
 * 1. **오탐이 기능을 죽인다.** "진단"을 막으면 "진단평가 일정 알려줘"가 막힌다. 학교에서 흔한 말이라
 *    정상 업무 질문이 계속 걸린다. **안 쓰이는 안전장치는 안전하지 않다.**
 * 2. 차단의 논거였던 "경고는 무시된다"가 이 화면에는 맞지 않는다. 여기 경고는 한 번 뜨는 팝업이
 *    아니라 **입력창 위에 상시로 떠 있는 「나갈 문장」 줄**의 상태 변화다.
 *
 * ★차단이 전부 사라진 것은 아니다 — 이름은 자동 삭제되고, 연락처·주민번호는 `assertNoPii`(그물 ③)가
 * 계속 막는다. **기계가 확실히 판정하는 것은 막고, 사람의 맥락 판단이 필요한 것만** 여기로 내렸다.
 *
 * 설계: docs/02-design/features/ssampin-ai.input-guard.design.md
 */

/** 경고 심각도. 어느 쪽이든 **전송을 막지 않는다.** */
export type AssistInputSeverity = 'caution' | 'serious';

/** 걸린 표현의 갈래 — 화면에 "무슨 이야기인지" 한국어로 알려주기 위한 값 */
export type AssistInputCategory = 'family' | 'health' | 'safety' | 'counseling' | 'crisis';

interface KeywordDef {
  readonly word: string;
  readonly category: AssistInputCategory;
  readonly severity: AssistInputSeverity;
}

/**
 * 경고 대상 — **주의 30 · 심각 2 = 32개**.
 *
 * ⚠️ 설계 문서(`ssampin-ai.input-guard.design.md` §3)는 "24개"로 세는데, 그건 표에서
 * `약물 / 복용`·`수급 / 기초생활` 처럼 **묶어 적은 개념 수**다. 여기서는 실제로 문자열을
 * 맞춰 봐야 하므로 **개별 단어로 펼쳤다.** 내용은 같고 세는 단위만 다르다.
 *
 * ★오너 확정(2026-08-21): **이 목록을 그대로 쓰고 실사용 후 조정한다.**
 * 차단이 아니라 경고라서 **넓게 잡는 대가가 작다** — 오탐이 나도 노란 줄이 잠깐 뜰 뿐이고
 * 선생님은 그대로 보낼 수 있다. 그래서 허용목록(예외 처리)도 만들지 않는다.
 * 유일한 예외는 아래 `SKIP_IF_NEARBY` 하나다.
 */
const KEYWORDS: readonly KeywordDef[] = [
  // ── 가정 형태·경제 (10)
  { word: '실직', category: 'family', severity: 'caution' },
  { word: '해고', category: 'family', severity: 'caution' },
  { word: '이혼', category: 'family', severity: 'caution' },
  { word: '재혼', category: 'family', severity: 'caution' },
  { word: '별거', category: 'family', severity: 'caution' },
  { word: '한부모', category: 'family', severity: 'caution' },
  { word: '조손', category: 'family', severity: 'caution' },
  { word: '위탁가정', category: 'family', severity: 'caution' },
  { word: '수급', category: 'family', severity: 'caution' },
  { word: '기초생활', category: 'family', severity: 'caution' },
  // ── 건강 (9)
  { word: '병명', category: 'health', severity: 'caution' },
  { word: '진단', category: 'health', severity: 'caution' },
  { word: '수술', category: 'health', severity: 'caution' },
  { word: '입원', category: 'health', severity: 'caution' },
  { word: '약물', category: 'health', severity: 'caution' },
  { word: '복용', category: 'health', severity: 'caution' },
  { word: '정신과', category: 'health', severity: 'caution' },
  { word: '심리치료', category: 'health', severity: 'caution' },
  { word: '우울', category: 'health', severity: 'caution' },
  // ── 안전·법 (8)
  { word: '학대', category: 'safety', severity: 'caution' },
  { word: '폭력', category: 'safety', severity: 'caution' },
  { word: '학폭', category: 'safety', severity: 'caution' },
  { word: '가출', category: 'safety', severity: 'caution' },
  { word: '소년원', category: 'safety', severity: 'caution' },
  { word: '보호처분', category: 'safety', severity: 'caution' },
  { word: '장애 등급', category: 'safety', severity: 'caution' },
  { word: '특수교육대상', category: 'safety', severity: 'caution' },
  // ── 상담 (3) — "상담" 단독은 넣지 않는다. 쌤핀에 상담예약 기능이 있어 정상 업무어다.
  { word: '상담 내용', category: 'counseling', severity: 'caution' },
  { word: '상담 기록', category: 'counseling', severity: 'caution' },
  { word: '상담일지', category: 'counseling', severity: 'caution' },
  // ── 되돌릴 수 없는 것 (2) — 확인 한 단계를 더 둔다. 그래도 결국 보낼 수 있다.
  { word: '자해', category: 'crisis', severity: 'serious' },
  { word: '자살', category: 'crisis', severity: 'serious' },
];

/**
 * 유일한 예외 — 심각 키워드 **바로 뒤에** "예방"이 붙으면 심각도를 주의로 내린다.
 *
 * ★"문장 어딘가에 있으면"이 아니라 **붙어 있을 때만**이다(설계 §2.3: `자살예방교육`·`자해예방`).
 * 전역 검사로 만들었다가 *"자살 시도한 학생이 있는데, 예방 교육 자료 있나요?"* 가
 * **경고 0건**이 되는 구멍이 잡혔다.
 *
 * ★그리고 **삭제가 아니라 강등**이다. `자살예방교육` 도 화면에는 주의로 표시된다 —
 * 아무 표시도 없으면 선생님은 무엇이 나가는지 알 수 없다(이 설계의 목적은 가시화다).
 */
const DOWNGRADE_SUFFIX = '예방';

/** 화면에 그대로 쓰는 한국어 라벨 */
const CATEGORY_LABEL: Readonly<Record<AssistInputCategory, string>> = {
  family: '가정 형편 이야기',
  health: '건강 이야기',
  safety: '안전·법적 사안',
  counseling: '상담 내용',
  crisis: '되돌릴 수 없는 내용',
};

/** 걸린 구간 하나. `start`·`end` 로 화면에서 밑줄을 긋고 그 부분만 지울 수 있다. */
/**
 * 질문 한 건의 글자 수 상한.
 *
 * ★서버(`supabase/functions/_shared/assistRequest.ts` 의 `LIMITS.maxTurnChars`)와 **같아야 한다.**
 * 앱이 더 관대하면 선생님은 길게 써서 보낸 뒤에야 거절당한다 — 왕복 한 번을 버리는 셈이다.
 * 두 숫자가 어긋나지 않는지는 `assistContract.qa.test.ts` 가 지킨다.
 */
export const ASSIST_MAX_QUESTION_CHARS = 2_000;

export interface AssistInputFinding {
  readonly word: string;
  readonly category: AssistInputCategory;
  /** 화면에 보여줄 한국어 (예: '가정 형편 이야기예요') */
  readonly label: string;
  readonly severity: AssistInputSeverity;
  readonly start: number;
  readonly end: number;
}

/**
 * 판정 결과.
 *
 * ★`blocked` 같은 필드가 **없다.** 이 함수는 전송 여부를 결정하지 않는다.
 * 화면은 이 결과로 「나갈 문장」 줄의 색과 문구만 바꾼다.
 */
export interface AssistInputScreening {
  readonly findings: readonly AssistInputFinding[];
  /** 가장 높은 심각도. 걸린 게 없으면 null. `serious` 면 화면이 확인 한 단계를 더 띄운다. */
  readonly severity: AssistInputSeverity | null;
}

const CLEAN: AssistInputScreening = { findings: [], severity: null };

/**
 * 입력 문장을 훑어 **주의를 줄 만한 표현**을 찾는다.
 *
 * 전송을 막지 않는다. 부르는 쪽은 이 결과를 화면에 표시할 뿐이고,
 * 선생님이 그대로 보내면 그대로 나간다.
 */
export function screenAssistInput(text: string): AssistInputScreening {
  if (!text) return CLEAN;

  const findings: AssistInputFinding[] = [];

  for (const def of KEYWORDS) {
    let from = 0;
    for (;;) {
      const at = text.indexOf(def.word, from);
      if (at < 0) break;
      const end = at + def.word.length;
      // 심각 키워드 바로 뒤에 "예방"이 붙으면 주의로 내린다(삭제하지 않는다).
      const downgraded = def.severity === 'serious' && text.startsWith(DOWNGRADE_SUFFIX, end);
      findings.push({
        word: def.word,
        category: def.category,
        label: CATEGORY_LABEL[def.category],
        severity: downgraded ? 'caution' : def.severity,
        start: at,
        end,
      });
      from = end;
    }
  }

  if (findings.length === 0) return CLEAN;

  findings.sort((a, b) => a.start - b.start);
  const severity: AssistInputSeverity = findings.some((f) => f.severity === 'serious')
    ? 'serious'
    : 'caution';

  return { findings, severity };
}

/** 화면의 `[이 부분 지우기]` 가 쓰는 순수 함수. 질문을 통째로 날리지 않는다. */
export function removeFinding(text: string, finding: AssistInputFinding): string {
  return `${text.slice(0, finding.start)}${text.slice(finding.end)}`;
}

/** 테스트·문서가 목록 크기를 검증할 수 있게 노출한다(값 자체는 수정 불가). */
export const ASSIST_INPUT_KEYWORDS: readonly Readonly<KeywordDef>[] = KEYWORDS;
