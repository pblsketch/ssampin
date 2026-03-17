/** 오프라인 FAQ 데이터 — 네트워크 없이 로컬에서 답변 */

export interface FaqItem {
  readonly question: string;
  readonly answer: string;
  readonly keywords: readonly string[];
  readonly category: 'general' | 'timetable' | 'seating' | 'tools' | 'settings' | 'troubleshoot' | 'homeroom' | 'class-management' | 'schedule' | 'export' | 'bookmark';
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
    answer: '날씨, 급식, 과제 수합을 제외한 모든 기능이 오프라인에서 동작해요.',
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
    answer: '타이머, 랜덤 뽑기, 투표, 주관식 설문, 워드클라우드, 점수판, 룰렛, QR코드 등 수업에 바로 쓸 수 있는 다양한 교실 도구예요.',
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
    answer: '수업반을 만들어 명렬표, 좌석배치, 진도 관리, 출결을 하나의 페이지에서 관리하는 기능이에요. 과제 수합 도구도 여기서 연결돼요. 사이드바에서 수업 관리 메뉴를 선택하면 돼요.',
    keywords: ['수업', '관리', '출석', '진도', '과제'],
    category: 'tools',
  },
  {
    question: '담임 업무 메뉴에는 뭐가 있나요?',
    answer: '담임 업무는 4가지 탭으로 구성돼요: ① 학생 기록 (상담/행동/학업 기록), ② 설문/체크리스트 (교사용 체크 또는 학생 공유), ③ 상담 예약 (시간대 설정 → 학생/학부모 예약), ④ 자리배치예요.',
    keywords: ['담임', '업무', '기록', '상담', '설문'],
    category: 'homeroom',
  },
  {
    question: '상담 예약은 어떻게 만드나요?',
    answer: '담임 업무 → 상담 예약 탭에서 상담 유형(학부모/학생), 방법, 시간대를 설정하면 공유 URL이 생성돼요. QR코드나 링크를 보내면 학생/학부모가 직접 예약할 수 있어요.',
    keywords: ['상담', '예약', '학부모', '시간대', 'QR'],
    category: 'homeroom',
  },
  {
    question: '설문이나 체크리스트는 어떻게 쓰나요?',
    answer: '담임 업무 → 설문/체크리스트 탭에서 만들 수 있어요. 교사 모드(화면에서 직접 체크)와 학생 공유 모드(QR/URL로 학생이 직접 응답) 두 가지가 있어요.',
    keywords: ['설문', '체크리스트', '체크', '응답', '공유'],
    category: 'homeroom',
  },
  {
    question: '수업반 좌석배치는 어떻게 하나요?',
    answer: '수업 관리 → 해당 수업반 선택 → 좌석배치 탭에서 수업반 전용 좌석을 배치할 수 있어요. 담임 교실 좌석과는 별도로 관리돼요.',
    keywords: ['수업반', '수업', '좌석', '배치', '관리'],
    category: 'class-management',
  },
  {
    question: '진도 관리는 어떻게 하나요?',
    answer: '수업 관리 → 해당 수업반 → 진도 관리 탭에서 수업 날짜, 교시, 단원, 차시를 기록할 수 있어요. 완료/예정/건너뜀 상태로 관리해요.',
    keywords: ['진도', '관리', '수업', '단원', '차시'],
    category: 'class-management',
  },
  {
    question: '자리 배치 조건(제약)은 뭔가요?',
    answer: '랜덤 배치 시 조건을 설정할 수 있어요: ① 구역 지정 (특정 학생을 앞줄/뒷줄에), ② 분리 (사이 나쁜 학생 떨어뜨리기), ③ 인접 (함께 앉히기), ④ 고정 좌석 (특정 자리에 고정).',
    keywords: ['조건', '제약', '구역', '분리', '인접', '고정', '랜덤'],
    category: 'seating',
  },
  {
    question: '일정을 검색할 수 있나요?',
    answer: '일정 관리 페이지 오른쪽 패널에서 검색 입력란에 키워드를 입력하면 전체 일정에서 검색할 수 있어요. 연도 버튼으로 특정 연도의 일정만 필터링할 수도 있어요.',
    keywords: ['검색', '일정 검색', '찾기', '일정 찾기', '연도'],
    category: 'schedule',
  },
  {
    question: 'NEIS 학사일정 연동은 어떻게 하나요?',
    answer: '설정 → 캘린더 → NEIS 학사일정에서 학교를 검색하고 연동을 활성화하면, 학교 행사/시험/방학 일정이 자동으로 캘린더에 표시돼요.',
    keywords: ['NEIS', '학사일정', '학사', '일정', '연동', '캘린더'],
    category: 'schedule',
  },
  {
    question: 'D-Day는 어떻게 설정하나요?',
    answer: '일정 관리 페이지에서 D-Day를 추가할 수 있어요. 제목, 날짜, 이모지를 설정하고 대시보드에 핀으로 고정하면 남은 일수가 표시돼요.',
    keywords: ['디데이', 'D-Day', 'dday', '카운트다운', '남은'],
    category: 'schedule',
  },
  {
    question: '테마를 바꿀 수 있나요?',
    answer: '설정 → 테마에서 7가지 프리셋(다크, 라이트, 파스텔, 네이비, 포레스트, 선셋, 모노) 중 선택하거나, 커스텀 테마로 직접 색상을 지정할 수 있어요.',
    keywords: ['테마', '다크', '라이트', '색상', '모드', '배경'],
    category: 'settings',
  },
  {
    question: '폰트를 바꿀 수 있나요?',
    answer: '설정 → 폰트에서 11가지 한글 폰트 중 선택할 수 있어요: Noto Sans KR, 프리텐다드, IBM Plex, 나눔고딕, 나눔스퀘어, 고운돋움, SUIT, 원티드, 페이퍼로지, 카카오큰글씨, 스포카.',
    keywords: ['폰트', '글꼴', '글씨', '글자'],
    category: 'settings',
  },
  {
    question: '사이드바 메뉴를 바꿀 수 있나요?',
    answer: '설정 → 메뉴 설정에서 사이드바 메뉴의 순서를 드래그로 바꾸거나, 사용하지 않는 메뉴를 숨길 수 있어요.',
    keywords: ['사이드바', '메뉴', '순서', '숨기기', '정렬'],
    category: 'settings',
  },
  {
    question: '북마크는 어떻게 쓰나요?',
    answer: '사이드바 → 북마크 메뉴에서 자주 쓰는 웹사이트 URL을 그룹별로 저장하고 관리할 수 있어요. 이모지 아이콘도 설정 가능해요.',
    keywords: ['북마크', '즐겨찾기', '링크', 'URL', '웹사이트'],
    category: 'bookmark',
  },
  {
    question: '내보내기는 어떤 형식을 지원하나요?',
    answer: '좌석배치표와 시간표를 Excel(.xlsx), PDF, HWPX(한글) 형식으로 내보낼 수 있어요. 사이드바 → 내보내기 메뉴에서 사용하세요.',
    keywords: ['내보내기', '엑셀', 'Excel', 'PDF', '한글', 'HWPX', '출력', '인쇄'],
    category: 'export',
  },
  {
    question: '출결 관리는 어떻게 하나요?',
    answer: '수업 관리 → 해당 수업반에서 교시별 출결(출석/결석/지각)을 기록할 수 있어요. 수업반별로 별도 관리돼요.',
    keywords: ['출결', '출석', '결석', '지각', '관리'],
    category: 'class-management',
  },
  {
    question: '행사 알림을 끌 수 있나요?',
    answer: '설정 → 일반 탭에서 "행사 알림 팝업"을 끌 수 있어요. 꺼두면 앱 시작 시 다가오는 행사 알림 팝업이 뜨지 않아요.',
    keywords: ['행사', '알림', '팝업', '끄기', '알림 끄기'],
    category: 'settings',
  },
  {
    question: '교사 시점 보기가 뭔가요?',
    answer: '자리배치에서 "교사 시점" 버튼을 누르면, 교단에서 학생들을 바라보는 방향으로 좌석이 좌우 반전되어 표시돼요. 실제 교실에서 학생을 찾을 때 유용해요.',
    keywords: ['교사', '시점', '보기', '반전', '교단'],
    category: 'seating',
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
