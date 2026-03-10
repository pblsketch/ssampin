/** 오프라인 FAQ 데이터 — 네트워크 없이 로컬에서 답변 */

export interface FaqItem {
  readonly question: string;
  readonly answer: string;
  readonly keywords: readonly string[];
  readonly category: 'general' | 'timetable' | 'seating' | 'tools' | 'settings' | 'troubleshoot';
}

export const OFFLINE_FAQ: readonly FaqItem[] = [
  {
    question: '무료인가요?',
    answer: '네, 완전 무료예요. 광고도 없어요.',
    keywords: ['무료', '가격', '비용', '유료'],
    category: 'general',
  },
  {
    question: '인터넷 없이도 되나요?',
    answer: '날씨와 급식을 제외한 모든 기능이 오프라인에서 동작해요.',
    keywords: ['인터넷', '오프라인', '와이파이', '네트워크'],
    category: 'general',
  },
  {
    question: '시간표 연동은 어떻게 하나요?',
    answer: '설정(⚙️) → 시간표 설정에서 NEIS 자동 연동을 선택하세요. 학교명을 검색하고 학년/반을 선택하면 자동으로 시간표가 채워집니다. 직접 입력도 가능해요.',
    keywords: ['시간표', '연동', 'NEIS', '나이스', '설정'],
    category: 'timetable',
  },
  {
    question: '자리 배치는 어떻게 하나요?',
    answer: '사이드바 → 자리배치 메뉴에서 학생 명단을 등록한 후, 랜덤 배치 또는 드래그 앤 드롭으로 자리를 지정할 수 있어요.',
    keywords: ['자리', '좌석', '배치', '랜덤', '드래그'],
    category: 'seating',
  },
  {
    question: '데이터는 어디에 저장되나요?',
    answer: '내 컴퓨터에만 저장돼요. 서버로 전송되지 않아요.',
    keywords: ['데이터', '저장', '서버', '클라우드', '개인정보'],
    category: 'settings',
  },
  {
    question: '업데이트는 어떻게 하나요?',
    answer: '앱이 자동으로 새 버전을 알려줘요. 알림이 오면 "업데이트" 버튼만 누르면 돼요.',
    keywords: ['업데이트', '버전', '최신'],
    category: 'settings',
  },
  {
    question: '바이러스 경고가 떠요!',
    answer: '개인 개발 앱이라 Microsoft 인증서가 아직 없어요. "Microsoft Windows의 PC 보호" 화면이면 "추가 정보 → 실행"을 클릭하세요. "스마트 앱 컨트롤이 차단했습니다" 화면(Windows 11)이면 설치 파일 우클릭 → 속성 → "차단 해제" 체크 → 확인 후 다시 실행하세요.',
    keywords: ['바이러스', '경고', '차단', '보호', '스마트앱', '설치'],
    category: 'troubleshoot',
  },
  {
    question: 'PIN 잠금은 왜 필요한가요?',
    answer: '학생이 볼 수 있는 상황에서 담임메모나 성적 같은 민감한 정보를 보호할 수 있어요. 기능별로 잠금을 설정할 수 있어요.',
    keywords: ['PIN', '잠금', '비밀번호', '보호'],
    category: 'settings',
  },
  {
    question: '쌤도구는 뭔가요?',
    answer: '타이머, 랜덤 뽑기, 투표, 주관식 설문, 워드클라우드, 점수판, 룰렛, QR코드 등 수업에 바로 쓸 수 있는 15가지 교실 도구예요.',
    keywords: ['쌤도구', '도구', '타이머', '뽑기', '점수판', '룰렛'],
    category: 'tools',
  },
  {
    question: '급식 정보는 어떻게 나오나요?',
    answer: 'NEIS(나이스) 공식 API에서 자동으로 가져와요. 설정에서 학교만 검색하면 매일 급식이 표시돼요.',
    keywords: ['급식', '점심', '식단'],
    category: 'general',
  },
  {
    question: '위젯 모드가 뭔가요?',
    answer: '대시보드를 작은 창으로 항상 화면 위에 띄워놓을 수 있어요. 대시보드 우측 상단의 위젯 버튼을 클릭하면 됩니다.',
    keywords: ['위젯', '항상 위', '작은 창', '미니'],
    category: 'general',
  },
  {
    question: '메모 색상을 바꿀 수 있나요?',
    answer: '메모 카드 우측 상단의 팔레트 아이콘을 클릭하면 6가지 색상 중 선택할 수 있어요.',
    keywords: ['메모', '색상', '포스트잇', '컬러'],
    category: 'general',
  },
  {
    question: '과제수합은 어떻게 사용하나요?',
    answer: '수업 관리 페이지에서 과제를 생성한 후, QR코드를 학생들에게 보여주면 스마트폰으로 바로 제출할 수 있어요. 파일과 텍스트 제출을 모두 지원해요.',
    keywords: ['과제', '수합', '제출', '파일', 'QR'],
    category: 'tools',
  },
  {
    question: '과목 색상을 바꿀 수 있나요?',
    answer: '시간표에서 과목을 클릭하면 인라인 팔레트가 나타나요. 16가지 프리셋 색상 중 원하는 색을 선택하거나 기본값으로 되돌릴 수 있어요.',
    keywords: ['과목', '색상', '컬러', '팔레트', '시간표'],
    category: 'timetable',
  },
  {
    question: '짝꿍 배치는 어떻게 하나요?',
    answer: '좌석배치 페이지에서 "짝꿍 모드"를 활성화하면 2인 1조 짝꿍 배치를 자동으로 생성할 수 있어요. 내보내기에도 반영돼요.',
    keywords: ['짝꿍', '짝', '2인', '배치'],
    category: 'seating',
  },
  {
    question: '수업 관리는 뭔가요?',
    answer: '출석, 진도, 과제수합을 하나의 페이지에서 관리하는 기능이에요. 사이드바에서 수업 관리 메뉴를 선택하면 돼요.',
    keywords: ['수업', '관리', '출석', '진도', '과제'],
    category: 'tools',
  },
];

/**
 * 오프라인 FAQ에서 키워드 매칭으로 답변 검색
 * @returns 매칭된 FAQ 항목 (최대 3개), 없으면 빈 배열
 */
export function searchOfflineFaq(query: string): readonly FaqItem[] {
  const normalized = query.toLowerCase().trim();

  const scored = OFFLINE_FAQ.map((faq) => {
    let score = 0;
    for (const keyword of faq.keywords) {
      if (normalized.includes(keyword.toLowerCase())) score += 2;
    }
    // 질문 텍스트 부분 매칭
    const cleanQuestion = faq.question.replace(/[?？]/g, '').toLowerCase();
    if (normalized.includes(cleanQuestion)) {
      score += 5;
    }
    return { faq, score };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return scored.map((item) => item.faq);
}
