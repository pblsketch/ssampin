/**
 * 쌤도구 카탈로그 — 더보기 화면과 검색이 함께 쓰는 단일 출처.
 *
 * 그룹을 "교실 도구 / 관리 도구" 에서 **언제 쓰는가** 기준으로 다시 나눴다.
 * 선생님이 도구를 찾는 순간은 대개 "지금 수업 중인가, 준비 중인가, 정리 중인가"라서
 * 그 축이 이름표보다 잘 맞는다.
 *
 * 목록 순서는 고정이다. 사용 빈도로 자리가 바뀌면 손이 기억하지 못한다.
 * 바뀌는 것은 화면 맨 위 "최근 사용" 줄뿐이다.
 */
export interface ToolItem {
  /** App.tsx 의 moreSub 키와 동일 (예: 'tool-timer') */
  readonly id: string;
  readonly icon: string;
  readonly name: string;
  readonly desc: string;
  /** 검색용 별칭 — 이름과 다르게 부르는 말들 */
  readonly aliases?: readonly string[];
}

export interface ToolGroup {
  readonly title: string;
  readonly tools: readonly ToolItem[];
}

export const TOOL_GROUPS: readonly ToolGroup[] = [
  {
    title: '수업 중에 바로',
    tools: [
      { id: 'tool-traffic-light', icon: 'traffic', name: '신호등', desc: '활동 시작과 멈춤' },
      { id: 'tool-timer', icon: 'timer', name: '타이머', desc: '시간 제한 활동에 딱!' },
      {
        id: 'tool-random',
        icon: 'shuffle',
        name: '랜덤뽑기',
        desc: '누가 발표할까?',
        aliases: ['뽑기', '추첨'],
      },
      { id: 'tool-dice', icon: 'casino', name: '주사위', desc: '운에 맡겨볼까?' },
      { id: 'tool-coin', icon: 'paid', name: '동전', desc: '앞? 뒤?' },
      { id: 'tool-roulette', icon: 'donut_large', name: '룰렛', desc: '돌려돌려 돌림판' },
      { id: 'tool-scoreboard', icon: 'scoreboard', name: '점수판', desc: '팀별 점수 관리' },
    ],
  },
  {
    title: '준비하고 정리할 때',
    tools: [
      {
        id: 'tool-grouping',
        icon: 'groups',
        name: '모둠 편성기',
        desc: '조건별 모둠 구성',
        aliases: ['조편성', '모둠'],
      },
      {
        id: 'tool-work-symbols',
        icon: 'front_hand',
        name: '활동 기호',
        desc: '수업 모드를 한눈에',
        aliases: ['수업기호'],
      },
      {
        id: 'tool-score-allocator',
        icon: 'calculate',
        name: '배점 계산기',
        desc: '지필 문항 배점 설계',
        aliases: ['점수배분', '배점'],
      },
    ],
  },
  {
    title: '모으고 평가할 때',
    tools: [
      {
        id: 'tool-assignment',
        icon: 'assignment',
        name: '과제 수합',
        desc: '학생 과제 제출 현황 확인',
        aliases: ['숙제'],
      },
      {
        id: 'tool-survey',
        icon: 'poll',
        name: '설문/체크리스트',
        desc: '설문 응답 현황 확인',
        aliases: ['설문조사'],
      },
      {
        id: 'tool-rubric',
        icon: 'grading',
        name: '수행평가 채점',
        desc: '평가지 점수 입력',
        aliases: ['루브릭', '채점'],
      },
      {
        id: 'tool-qrcode',
        icon: 'qr_code_2',
        name: 'QR코드',
        desc: 'URL을 QR로 변환',
        aliases: ['큐알'],
      },
    ],
  },
];

export const ALL_TOOLS: readonly ToolItem[] = TOOL_GROUPS.flatMap((g) => g.tools);

export function findTool(id: string): ToolItem | undefined {
  return ALL_TOOLS.find((t) => t.id === id);
}

/**
 * 도구 검색.
 *
 * 이름·설명·별칭을 본다. 한글은 자모 분해 검색까지 가면 복잡해지므로, 14개 규모에서
 * 실제로 필요한 "앞부분 몇 글자" 수준(부분 문자열)으로 충분하다.
 * 빈 검색어는 빈 배열이 아니라 null 을 돌려준다 — "검색 중이 아님"과 "결과 없음"은
 * 화면에서 다르게 다뤄야 한다.
 */
export function searchTools(query: string): readonly ToolItem[] | null {
  const q = query.trim().toLowerCase();
  if (q === '') return null;
  return ALL_TOOLS.filter((t) => {
    if (t.name.toLowerCase().includes(q)) return true;
    if (t.desc.toLowerCase().includes(q)) return true;
    return (t.aliases ?? []).some((a) => a.toLowerCase().includes(q));
  });
}
