#!/usr/bin/env node
/**
 * 쌤핀 챗봇 하드코딩 Q&A → 벡터 스토어 이전 스크립트
 *
 * 사용법: SUPABASE_URL=... EMBED_AUTH_TOKEN=... node scripts/ingest-chatbot-qa.mjs
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const EMBED_AUTH_TOKEN = process.env.EMBED_AUTH_TOKEN;

if (!SUPABASE_URL || !EMBED_AUTH_TOKEN) {
  console.error('환경변수 필요: SUPABASE_URL, EMBED_AUTH_TOKEN');
  process.exit(1);
}

// ── Q&A 문서 ─────────────────────────────────────────────────────────────────

const QA_DOCUMENTS = [
  // ── 위젯 ──────────────────────────────────────────────────────────────────
  {
    content: `Q: 위젯 모드를 어떻게 켜나요?\nA: 대시보드(메인 화면) 오른쪽 상단의 위젯 아이콘(📌)을 클릭하세요. → 위젯 전용 창이 열려요. → "항상 위에" 토글을 켜면 다른 프로그램 창 위에 항상 표시돼요.`,
    metadata: { source: 'system-qa', category: 'widget', title: 'Q: 위젯 모드 켜는 법' },
  },
  {
    content: `Q: 위젯에 어떤 정보가 보이나요?\nA: 현재 교시, 오늘 시간표, 다가오는 일정, 날씨, 급식, 메모가 표시돼요. 위젯 설정에서 보고 싶은 항목을 선택하거나 숨길 수 있어요.`,
    metadata: { source: 'system-qa', category: 'widget', title: 'Q: 위젯에 표시되는 정보' },
  },
  {
    content: `Q: 위젯 창 크기를 조절할 수 있나요?\nA: 위젯 창의 모서리를 드래그하여 크기를 조절할 수 있어요. 너무 작게 줄이면 일부 정보가 잘릴 수 있으니 적당한 크기로 맞춰 주세요.`,
    metadata: { source: 'system-qa', category: 'widget', title: 'Q: 위젯 창 크기 조절' },
  },
  {
    content: `Q: 위젯이 다른 창 뒤로 숨어요. 어떻게 하나요?\nA: 위젯 창 상단의 "항상 위에" 토글이 꺼져 있으면 다른 창에 가려질 수 있어요. 토글을 켜면 항상 앞에 표시돼요.`,
    metadata: { source: 'system-qa', category: 'widget', title: 'Q: 위젯이 다른 창 뒤로 숨는 문제' },
  },
  {
    content: `Q: 위젯에서 즐겨찾기를 추가하려면?\nA: 대시보드에서 원하는 항목(일정, 할일, 메모 등)에 있는 핀(📌) 아이콘을 클릭하면 즐겨찾기에 추가돼요. 즐겨찾기에 고정된 항목은 위젯에서도 바로 볼 수 있어요. 즐겨찾기 위젯 내에서 드래그 앤 드롭으로 카테고리 간 이동도 가능해요.`,
    metadata: { source: 'system-qa', category: 'widget', title: 'Q: 위젯 즐겨찾기 추가' },
  },
  {
    content: `Q: 위젯 모드에서 메모를 보려면?\nA: 위젯에 메모 항목이 표시돼요. 메모를 클릭하면 포커스되고, 좌우 화살표로 이전/다음 메모를 넘길 수 있어요.`,
    metadata: { source: 'system-qa', category: 'widget', title: 'Q: 위젯에서 메모 보기' },
  },
  {
    content: `Q: 위젯을 끄려면?\nA: 위젯 창의 X(닫기) 버튼을 클릭하면 위젯이 닫혀요. 메인 앱은 계속 실행 중이에요.`,
    metadata: { source: 'system-qa', category: 'widget', title: 'Q: 위젯 끄는 법' },
  },

  // ── 시간표 ────────────────────────────────────────────────────────────────
  {
    content: `Q: 시간표를 NEIS에서 자동으로 가져오려면?\nA: 1) 설정(⚙️) → NEIS 연동 메뉴로 이동 → 2) "학교 검색"에서 학교 이름을 입력하고 선택 → 3) 학년과 반을 선택 → 4) "시간표 불러오기" 버튼을 클릭하면 자동으로 채워져요.`,
    metadata: { source: 'system-qa', category: 'timetable', title: 'Q: NEIS 시간표 자동 가져오기' },
  },
  {
    content: `Q: 시간표를 직접 수정하려면?\nA: 시간표 페이지에서 수정하고 싶은 시간표 칸을 클릭하세요. → 과목명을 입력하거나 목록에서 선택하세요. → 변경 사항은 자동 저장돼요.`,
    metadata: { source: 'system-qa', category: 'timetable', title: 'Q: 시간표 직접 수정' },
  },
  {
    content: `Q: 교사 개인 시간표와 학급 시간표의 차이가 뭔가요?\nA: 학급 시간표는 담임 학급의 전체 시간표예요. 교사 시간표는 내가 수업하는 시간만 표시하고, 수업 장소(예: 과학실)도 함께 보여줘요. 시간표 페이지 상단 탭에서 전환할 수 있어요.`,
    metadata: { source: 'system-qa', category: 'timetable', title: 'Q: 교사 시간표 vs 학급 시간표 차이' },
  },
  {
    content: `Q: 과목별 색상을 바꾸려면?\nA: 두 가지 방법이 있어요. 1) 시간표 보기 모드에서 과목 셀을 바로 클릭하면 색상 변경 팝업이 나타나요(v1.8.1 신규). 2) 시간표 페이지 상단의 색상 설정 아이콘을 클릭 → 과목별 색상 모드에서 각 과목 옆의 색상 원을 클릭 → 16가지 프리셋 중 원하는 색상을 선택하세요.`,
    metadata: { source: 'system-qa', category: 'timetable', title: 'Q: 과목별 색상 변경' },
  },
  {
    content: `Q: 색상 모드를 학반별로 바꿀 수 있나요?\nA: 네, 시간표 색상 설정에서 "과목별 색상"과 "학반별 색상" 두 가지 모드 중 선택할 수 있어요. 학반별 색상은 교사 시간표에서 각 반을 구분할 때 유용해요.`,
    metadata: { source: 'system-qa', category: 'timetable', title: 'Q: 시간표 학반별 색상 모드' },
  },
  {
    content: `Q: 시간표를 내보내기(출력)하려면?\nA: 시간표 페이지 상단의 내보내기 아이콘을 클릭하세요. → Excel, PDF, HWPX(한글) 형식 중 선택해서 저장할 수 있어요.`,
    metadata: { source: 'system-qa', category: 'timetable', title: 'Q: 시간표 내보내기' },
  },
  {
    content: `Q: 교시 시간을 바꾸고 싶어요.\nA: 설정(⚙️) → 학교/학급 정보에서 교시별 시작·종료 시간을 직접 수정할 수 있어요. 여기서 설정한 시간이 대시보드의 현재 교시 판정에 반영돼요.`,
    metadata: { source: 'system-qa', category: 'timetable', title: 'Q: 교시 시간 변경' },
  },
  {
    content: `Q: 교사 시간표도 NEIS에서 자동으로 가져올 수 있나요?\nA: NEIS 자동 연동은 학급 시간표만 가능해요. 교사 개인 시간표는 개인정보에 해당하여 NEIS 공개 API에서 제공되지 않습니다. 시간표 페이지의 "교사" 탭에서 직접 입력해주세요.`,
    metadata: { source: 'system-qa', category: 'timetable', title: 'Q: 교사 시간표 NEIS 자동 연동' },
  },
  {
    content: `Q: 시간표를 입력했는데 위젯에 안 나와요\nA: 위젯의 시간표에는 "학급"과 "교사" 두 탭이 있어요. 입력한 시간표 종류와 보고 있는 탭이 다르면 빈 화면으로 보일 수 있습니다. 탭을 전환해보세요. 위젯 기본 탭은 "교사"이므로, 학급 시간표만 입력한 경우 "학급" 탭으로 바꿔야 보여요.`,
    metadata: { source: 'system-qa', category: 'timetable', title: 'Q: 시간표 입력 후 위젯에 안 나올 때' },
  },
  {
    content: `Q: 교사 시간표를 엑셀로 업로드하려면?\nA: 시간표 페이지에서 "교사" 탭을 선택 → 상단의 엑셀 업로드 아이콘 클릭 → 컴시간 양식의 엑셀 파일을 선택하면 자동으로 감지되어 시간표가 입력돼요. 엑셀 다운로드도 같은 위치에서 가능해요.`,
    metadata: { source: 'system-qa', category: 'timetable', title: 'Q: 교사 시간표 엑셀 업로드' },
  },
  {
    content: `Q: 담임메모에서 자리 배치로 학생을 선택할 수 있나요?\nA: 네! 담임메모(학생 기록) 입력 화면에서 학생 선택 영역 상단의 "번호 순" / "자리 배치" 토글을 사용하면 실제 좌석 배치도를 보면서 학생을 선택할 수 있어요.`,
    metadata: { source: 'system-qa', category: 'timetable', title: 'Q: 담임메모 자리배치 뷰 토글' },
  },

  // ── 좌석배치 ──────────────────────────────────────────────────────────────
  {
    content: `Q: 좌석 배치에서 분리 조건을 추가하고 싶어요\nA: 설정(⚙️) → 좌석 → "좌석 관계 설정"에서 할 수 있어요. "분리" 항목에서 떨어뜨리고 싶은 학생 두 명을 선택하고 최소 거리를 설정하세요. 설정한 조건은 "랜덤 배치" 시 자동 반영됩니다.`,
    metadata: { source: 'system-qa', category: 'seating', title: 'Q: 좌석 분리 조건 추가' },
  },
  {
    content: `Q: 특정 학생을 특정 자리에 고정하려면?\nA: 설정(⚙️) → 좌석 → "좌석 관계 설정"에서 "고정 좌석"을 선택하세요. 학생을 선택하고 원하는 좌석 위치를 지정하면, 랜덤 배치 시에도 해당 자리가 유지돼요.`,
    metadata: { source: 'system-qa', category: 'seating', title: 'Q: 특정 학생 좌석 고정' },
  },
  {
    content: `Q: 특정 학생을 앞자리에 앉히려면?\nA: 설정(⚙️) → 좌석 → "좌석 관계 설정"에서 "영역 고정"을 선택하세요. 맨앞줄, 앞 2줄, 뒤 2줄, 왼쪽/오른쪽, 가운데 등 영역을 지정할 수 있어요.`,
    metadata: { source: 'system-qa', category: 'seating', title: 'Q: 특정 학생 앞자리 영역 고정' },
  },

  // ── 설정 ──────────────────────────────────────────────────────────────────
  {
    content: `Q: 학교를 처음 설정하려면?\nA: 설정(⚙️) → 학교/학급 정보 → "학교 검색"에서 학교 이름을 입력하세요. → 목록에서 학교를 선택하면 NEIS 코드가 자동 연결돼요. 학원이나 대안학교는 "직접 설정"을 선택하면 돼요.`,
    metadata: { source: 'system-qa', category: 'settings', title: 'Q: 학교 초기 설정' },
  },
  {
    content: `Q: 테마를 변경하려면?\nA: v1.6.4부터 기본 테마가 밝고 깔끔한 Notion 스타일 라이트 테마로 바뀌었어요. 설정(⚙️) → 테마에서 다크, 라이트, 파스텔, 네이비, 포레스트, 선셋, 모노 등 프리셋을 선택하거나, "커스텀"으로 직접 색상을 조합할 수 있어요. 위젯 스타일에서는 카드 모서리, 간격, 배경색, 글꼴 등도 세밀하게 조절할 수 있어요.`,
    metadata: { source: 'system-qa', category: 'settings', title: 'Q: 테마 변경' },
  },
  {
    content: `Q: 폰트를 바꾸려면?\nA: 설정(⚙️) → 폰트에서 11가지 한글 폰트 중 선택하세요. Noto Sans KR, 프리텐다드, IBM Plex, 나눔고딕, 나눔스퀘어, 고운돋움, SUIT, 원티드, 페이퍼로지, 카카오큰글씨, 스포카 중에서 골라요.`,
    metadata: { source: 'system-qa', category: 'settings', title: 'Q: 폰트 변경' },
  },
  {
    content: `Q: PIN 잠금을 설정하려면?\nA: 설정(⚙️) → PIN 잠금에서 기능별로 잠금을 설정할 수 있어요. 시간표, 좌석배치, 일정, 학생기록, 급식, 메모, 할일, 수업관리, 북마크 각각 잠금을 켜거나 끌 수 있어요. PIN 번호는 4자리 숫자로 설정해요.`,
    metadata: { source: 'system-qa', category: 'settings', title: 'Q: PIN 잠금 설정' },
  },
  {
    content: `Q: 날씨 지역을 바꾸려면?\nA: 설정(⚙️) → 날씨 지역에서 전국 83개 시/군 단위로 선택할 수 있어요. 도별로 그룹핑되어 있어서 원하는 지역을 쉽게 찾을 수 있어요.`,
    metadata: { source: 'system-qa', category: 'settings', title: 'Q: 날씨 지역 변경' },
  },
  {
    content: `Q: 사이드바 메뉴 순서를 바꾸거나 숨기려면?\nA: 설정(⚙️) → 사이드바에서 드래그 앤 드롭으로 메뉴 순서를 변경하거나, 토글로 특정 메뉴를 숨길 수 있어요.`,
    metadata: { source: 'system-qa', category: 'settings', title: 'Q: 사이드바 메뉴 순서/숨기기' },
  },
  {
    content: `Q: 행사 알림 팝업이 자꾸 떠요. 끄려면?\nA: 설정(⚙️) → 행사 알림에서 "다가오는 행사 알림" 토글을 꺼 주세요. 그러면 앱 시작 시 행사 알림 팝업이 뜨지 않아요.`,
    metadata: { source: 'system-qa', category: 'settings', title: 'Q: 행사 알림 팝업 끄기' },
  },
  {
    content: `Q: PC 시작할 때 쌤핀 외에 빈 창이 하나 더 떠요.\nA: v1.7.2에서 수정된 문제예요. 설정 → 앱 정보에서 최신 버전으로 업데이트해 주세요. 업데이트 후 자동 시작 시 쌤핀만 정상적으로 실행돼요. 자동 업데이트가 안 되면 ssampin.com에서 최신 버전을 수동 다운로드해 주세요.`,
    metadata: { source: 'system-qa', category: 'settings', title: 'Q: 시작 시 빈 창 추가 생성 문제' },
  },
  {
    content: `Q: 앱을 켤 때 잠깐 회색 화면이 보여요.\nA: v1.7.2에서 스플래시 스크린이 추가되어, 앱이 로드되는 동안 쌤핀 로고가 표시돼요. 회색 화면이 보이면 최신 버전으로 업데이트해 주세요.`,
    metadata: { source: 'system-qa', category: 'settings', title: 'Q: 앱 시작 시 회색 화면' },
  },

  // ── 일정 ──────────────────────────────────────────────────────────────────
  {
    content: `Q: 일정을 새로 추가하려면?\nA: 일정 페이지에서 캘린더의 날짜를 클릭하거나 "+" 버튼을 눌러요. → 제목, 날짜, 시간, 카테고리(수업·행사·시험·개인 등)를 입력 → 저장하면 돼요.`,
    metadata: { source: 'system-qa', category: 'schedule', title: 'Q: 일정 추가' },
  },
  {
    content: `Q: NEIS 학사일정을 자동으로 불러오려면?\nA: 설정(⚙️) → NEIS 연동에서 학교가 설정되어 있으면, 일정 페이지에서 "NEIS 학사일정 불러오기" 버튼을 클릭하세요. 학교 공식 일정이 자동으로 추가돼요.`,
    metadata: { source: 'system-qa', category: 'schedule', title: 'Q: NEIS 학사일정 자동 불러오기' },
  },
  {
    content: `Q: 구글 캘린더와 일정을 동기화하려면?\nA: 1) 설정(⚙️) → 캘린더 동기화로 이동 → 2) "Google 계정 연동" 버튼을 클릭하여 구글 로그인 → 3) 동기화할 캘린더를 선택 → 4) 구글 캘린더 일정이 쌤핀에 자동으로 표시돼요. 쌤핀에서 구글 캘린더 일정을 수정하거나 삭제할 수도 있어요.`,
    metadata: { source: 'system-qa', category: 'schedule', title: 'Q: Google 캘린더 동기화' },
  },
  {
    content: `Q: 일정에 교시를 지정할 수 있나요?\nA: 네! 일정 추가/편집 시 교시 범위를 선택할 수 있어요. 시작 교시와 종료 교시를 지정하면 "3~5교시"처럼 범위로 표시돼요. 한 교시만 선택하면 해당 교시만 표시됩니다.`,
    metadata: { source: 'system-qa', category: 'schedule', title: 'Q: 일정에 교시 지정' },
  },
  {
    content: `Q: D-Day를 설정하려면?\nA: 일정을 추가하거나 기존 일정을 편집할 때 "D-Day로 표시" 옵션을 켜세요. 대시보드에 해당 일정까지 남은 일수가 표시돼요.`,
    metadata: { source: 'system-qa', category: 'schedule', title: 'Q: D-Day 설정' },
  },
  {
    content: `Q: 일정을 검색하려면?\nA: 일정 페이지 상단의 검색 아이콘을 클릭 → 키워드를 입력하면 전체 일정에서 검색돼요. 연도 필터를 사용하면 특정 연도 일정만 볼 수도 있어요.`,
    metadata: { source: 'system-qa', category: 'schedule', title: 'Q: 일정 검색' },
  },

  // ── 할일 ──────────────────────────────────────────────────────────────────
  {
    content: `Q: 할 일에 시간을 설정할 수 있나요?\nA: 할 일 추가/수정 시 ⏰ 시간 입력란에서 HH:mm 형식으로 시간을 지정할 수 있습니다. 시간이 설정된 할 일은 시간순으로 정렬됩니다.`,
    metadata: { source: 'system-qa', category: 'todo', title: 'Q: 할일 시간 설정' },
  },
  {
    content: `Q: 할 일에서 시간표 수업이나 일정도 같이 볼 수 있나요?\nA: 할 일 페이지 상단의 "통합 보기"에서 📚 수업, 📅 일정 체크박스를 켜면 됩니다. 오늘의 시간표 교시와 일정이 할 일 목록에 시간순으로 통합 표시됩니다. 대시보드 할 일 위젯에서도 동일하게 동작합니다.`,
    metadata: { source: 'system-qa', category: 'todo', title: 'Q: 할일 통합 보기(수업·일정)' },
  },
  {
    content: `Q: 할일 순서를 바꾸고 싶어요\nA: 할일 항목을 길게 누르거나 드래그하면 순서를 변경할 수 있어요. 상단의 정렬 버튼으로 "우선순위 순"과 "D-Day 순" 전환도 가능합니다.`,
    metadata: { source: 'system-qa', category: 'todo', title: 'Q: 할일 순서 변경' },
  },
  {
    content: `Q: 대시보드 미니 캘린더 위젯은 뭔가요?\nA: 대시보드 위젯으로, 이번 달 캘린더에서 일정이 있는 날짜를 한눈에 확인할 수 있습니다. 날짜를 클릭하면 해당 날짜의 일정이 팝업으로 표시되어 바로 확인할 수 있어요.`,
    metadata: { source: 'system-qa', category: 'todo', title: 'Q: 대시보드 미니 캘린더 위젯' },
  },
  {
    content: `Q: 대시보드 일정 위젯의 표시 기간을 바꿀 수 있나요?\nA: 네! v1.7.2부터 일정 위젯의 표시 기간을 변경할 수 있어요. 기본 14일에서 원하는 기간으로 설정할 수 있습니다. 일정 위젯 카드의 설정 아이콘을 클릭하면 표시 기간을 변경할 수 있어요.`,
    metadata: { source: 'system-qa', category: 'todo', title: 'Q: 대시보드 일정 위젯 표시 기간 변경' },
  },

  // ── 동기화 ────────────────────────────────────────────────────────────────
  {
    content: `Q: Google Drive 동기화를 처음 설정하려면?\nA: 1) 설정(⚙️) → Google Drive 동기화로 이동 → 2) "Google 계정 연동" 버튼 클릭 → 3) Google 로그인 및 권한 허용 → 4) 동기화가 자동으로 시작돼요. 데이터가 Google Drive에 백업되고, 다른 기기에서도 같은 계정으로 접근할 수 있어요.`,
    metadata: { source: 'system-qa', category: 'sync', title: 'Q: Google Drive 동기화 초기 설정' },
  },
  {
    content: `Q: 동기화가 안 될 때 어떻게 하나요?\nA: 다음 순서로 확인해 보세요: 1) 인터넷 연결 상태를 확인하세요. → 2) 설정 → Google Drive 동기화에서 계정이 연결되어 있는지 확인하세요. → 3) "수동 동기화" 버튼을 눌러 보세요. → 4) 그래도 안 되면 Google 계정을 해제했다가 다시 연동해 보세요. → 5) 여전히 안 되면 앱을 재시작해 보세요. → 6) 학교 컴퓨터에서만 안 되는 경우, "Google 계정 연결" 클릭 후 30초 정도 기다리면 "다른 방법으로 로그인" 안내가 나타나요. 이 방법(PKCE 방식)으로 진행하면 보안 프로그램 차단을 우회할 수 있어요. (v1.8.2 이상)`,
    metadata: { source: 'system-qa', category: 'sync', title: 'Q: 동기화 안 될 때 해결 방법' },
  },
  {
    content: `Q: 모바일에서 PC 데이터를 보려면?\nA: 1) PC 쌤핀에서 먼저 Google Drive 동기화를 설정하세요. → 2) 모바일(m.ssampin.com)에서 같은 Google 계정으로 로그인하세요. → 3) 자동으로 PC 데이터가 동기화돼요. 별도 서버 없이 Google Drive를 통해 연결돼요.`,
    metadata: { source: 'system-qa', category: 'sync', title: 'Q: 모바일에서 PC 데이터 보기' },
  },
  {
    content: `Q: 데이터를 백업/복원하려면?\nA: Google Drive 동기화를 사용하면 자동 백업돼요. 수동으로 백업하려면 설정(⚙️) → Google Drive 동기화에서 "수동 동기화" 버튼을 클릭하세요. 다른 PC에서 복원하려면 같은 Google 계정으로 로그인하면 자동 복원돼요.`,
    metadata: { source: 'system-qa', category: 'sync', title: 'Q: 데이터 백업/복원' },
  },
  {
    content: `Q: Google Drive 동기화를 해제하려면?\nA: 설정(⚙️) → Google Drive 동기화 → "연동 해제" 버튼을 클릭하세요. 해제해도 로컬 데이터는 그대로 유지돼요. Google Drive에 저장된 백업 파일도 삭제되지 않아요.`,
    metadata: { source: 'system-qa', category: 'sync', title: 'Q: Google Drive 동기화 해제' },
  },
  {
    content: `Q: Google 로그인할 때 "확인되지 않은 앱" 경고가 나와요.\nA: v1.8.1부터 구글 제3자 데이터 안전팀의 공식 보안 심사를 통과했어요! 🎉 Google Drive 동기화와 Google 캘린더 연동 모두 구글이 승인한 안전한 서비스예요. 혹시 이전 버전에서 경고가 나왔다면 최신 버전으로 업데이트해 주세요.`,
    metadata: { source: 'system-qa', category: 'sync', title: 'Q: 확인되지 않은 앱 경고' },
  },
  {
    content: `Q: Google 동기화는 안전한가요?\nA: 네, 쌤핀은 구글 OAuth 인증 심사를 공식 통과했어요. drive.file(쌤핀이 생성한 파일만 접근)과 calendar(캘린더 읽기/쓰기) 두 가지 권한만 사용하며, 다른 파일이나 이메일 등에는 접근하지 않아요.`,
    metadata: { source: 'system-qa', category: 'sync', title: 'Q: Google 동기화 안전성' },
  },

  // ── 일반 ──────────────────────────────────────────────────────────────────
  {
    content: `Q: 조종례 안내사항을 적어둘 수 있나요?\nA: 대시보드 상단의 메시지 배너를 활용하세요. 클릭하면 바로 편집 가능해요. 아이콘과 색상도 변경 가능합니다.`,
    metadata: { source: 'system-qa', category: 'general', title: 'Q: 조종례 안내사항 메시지 배너' },
  },
  {
    content: `Q: 과제/신청서 제출 여부를 체크하려면?\nA: 담임업무 → 설문/체크리스트에서 O/X 체크리스트를 만들어 학생별로 체크할 수 있어요.`,
    metadata: { source: 'system-qa', category: 'general', title: 'Q: 과제 제출 여부 체크리스트' },
  },

  // ── 트러블슈팅 ────────────────────────────────────────────────────────────
  {
    content: `Q: 학교 컴퓨터에서 구글 연결이 안 돼요 / "구글 계정 연결 중"에서 멈춰요\nA: 학교 보안 프로그램(V3, 알약, 방화벽 등)이 구글 로그인 과정을 차단하는 경우에요. 해결 방법:\n1) "Google 계정 연결" 버튼을 클릭하세요.\n2) 30초 정도 기다리면 "다른 방법으로 로그인하기" 안내가 자동으로 나타나요.\n3) 안내에 따라 브라우저에서 코드를 복사·붙여넣기 하면 연결이 완료돼요.\n💡 이 방법(PKCE 폴백)은 v1.8.2 이상에서 지원돼요. 버전이 낮으면 ssampin.com에서 최신 버전을 다운로드해 주세요.`,
    metadata: { source: 'system-qa', category: 'troubleshooting', title: 'Q: 학교 컴퓨터 구글 연결 안 됨' },
  },
  {
    content: `Q: 개인 컴퓨터에서는 되는데 학교 컴퓨터에서만 안 돼요\nA: 학교 컴퓨터에는 보안 프로그램이 설치되어 있어서 구글 연결 과정의 일부가 차단될 수 있어요. "학교 컴퓨터에서 구글 연결이 안 돼요" 답변을 참고해 주세요. 시간표, 메모, 좌석 배치 등 핵심 기능은 구글 연동 없이도 모두 사용 가능해요! 😊`,
    metadata: { source: 'system-qa', category: 'troubleshooting', title: 'Q: 학교 컴퓨터에서만 구글 연결 안 됨' },
  },

  // ── v1.9.4 신규 ──────────────────────────────────────────────────────────
  {
    content: `Q: 자리뽑기에서 빈 자리를 지정할 수 있나요?\nA: 네! 자리뽑기에서 특정 좌석을 '빈 자리'로 지정하면 그 자리는 아무도 배정되지 않아요. 또한 특정 학생을 원하는 자리에 고정한 채 나머지 학생만 랜덤 배치할 수도 있어요.`,
    metadata: { source: 'system-qa', category: 'tools', title: 'Q: 자리뽑기 빈자리·학생 고정' },
  },
  {
    content: `Q: 메모를 보관(아카이브)할 수 있나요?\nA: 네! 메모 카드 상단의 메뉴에서 '보관'을 선택하면 화면에서 사라지고 보관함으로 이동해요. 보관함에서 다시 꺼내거나 완전히 삭제할 수 있어요.`,
    metadata: { source: 'system-qa', category: 'memo', title: 'Q: 메모 보관(아카이브)' },
  },
  {
    content: `Q: 수업 관리에서 출석 체크를 할 수 있나요?\nA: 네! 수업 관리 좌석배치도에서 출석 체크 모드를 켜면 좌석을 클릭해서 출석/결석/지각을 바로 체크할 수 있어요.`,
    metadata: { source: 'system-qa', category: 'class-management', title: 'Q: 수업 관리 출석 체크 모드' },
  },
  {
    content: `Q: 모바일에서 학생 연락처로 전화를 걸 수 있나요?\nA: 네! 모바일 앱에서 학생 정보를 열면 등록된 연락처를 확인하고 바로 전화를 걸 수 있어요.`,
    metadata: { source: 'system-qa', category: 'mobile', title: 'Q: 모바일 학생 연락처 전화' },
  },
  {
    content: `Q: 할일 반복 설정을 나중에 바꿀 수 있나요?\nA: 네! 할일 수정 모달에서 반복 주기를 변경하거나 반복을 완전히 해제할 수 있어요.`,
    metadata: { source: 'system-qa', category: 'todo', title: 'Q: 할일 반복 설정 변경·해제' },
  },
  {
    content: `Q: 상담 예약에서 공강 시간만 열 수 있나요?\nA: 네! 상담 일정 생성 시 '수업 시간 제외' 옵션을 켜면 시간표에 수업이 없는 교시만 상담 가능 시간으로 설정돼요.`,
    metadata: { source: 'system-qa', category: 'homeroom', title: 'Q: 공강 시간 상담 제외' },
  },
];

// ── 기능 요약 문서 ────────────────────────────────────────────────────────────

const FEATURE_DOCUMENTS = [
  {
    content: `📋 대시보드: 현재 교시·시간표, 다가오는 일정, 할일, 급식, 날씨를 한눈에 보는 메인 화면. 메시지 배너, 위젯 모드(일반/항상 위에), 7가지 테마 + 커스텀 테마 지원.`,
    metadata: { source: 'feature-summary', category: 'dashboard', title: '대시보드 기능 요약' },
  },
  {
    content: `📌 위젯 모드: 대시보드를 작은 창으로 띄워 다른 프로그램 위에 항상 표시. 현재 교시, 시간표, 일정, 날씨, 급식, 메모 등 표시. 즐겨찾기 위젯에 원하는 항목 고정 가능.`,
    metadata: { source: 'feature-summary', category: 'widget', title: '위젯 모드 기능 요약' },
  },
  {
    content: `📅 시간표: 학급 시간표(5일 × N교시) + 교사 개인 시간표. NEIS 자동 연동(학교 검색 → 학년/반 선택), 과목별/학반별 색상 모드, 색상 커스터마이징(16가지), 보기 모드에서 과목 셀 클릭으로 색상 즉시 변경, 교사 시간표 수업 장소 표시, 교사 시간표 엑셀 업로드/다운로드(컴시간 양식 자동 감지).`,
    metadata: { source: 'feature-summary', category: 'timetable', title: '시간표 기능 요약' },
  },
  {
    content: `🪑 자리배치: 드래그 앤 드롭 자리 교환, 조건부 랜덤 배치(구역·분리·인접·고정), 짝꿍 모드(2인/3인), 실행 취소(20단계), 교사 시점 보기, Excel/한글 내보내기(좌우 반전 옵션).`,
    metadata: { source: 'feature-summary', category: 'seating', title: '자리배치 기능 요약' },
  },
  {
    content: `📆 일정 관리: 캘린더 + 리스트 뷰(일/주/월/학기/연), 일정 검색(키워드+연도 필터), 카테고리(수업·행사·시험·개인), NEIS 학사일정 자동 연동, 구글 캘린더 동기화, D-Day 카운트다운, 교시 범위 선택(시작~종료 교시 지정).`,
    metadata: { source: 'feature-summary', category: 'schedule', title: '일정 관리 기능 요약' },
  },
  {
    content: `👨‍🏫 담임 업무 (5개 탭): 학생 기록(카테고리별 상담·행동·학업 기록, 후속 조치, 번호순/자리배치 뷰 토글), 설문/체크리스트(교사·학생 응답 모드, QR/URL, PIN 인증), 상담 예약(위자드 UI, 시간표 연동 자동 차단), 과제 수합(QR/URL 제출), 자리배치.`,
    metadata: { source: 'feature-summary', category: 'homeroom', title: '담임 업무 기능 요약' },
  },
  {
    content: `📚 수업 관리: 수업반 생성·관리, 명렬표(NEIS 호환 양식, 엑셀 업로드 헤더 자동 감지, 미리보기 모달), 좌석배치(출석 체크 모드), 진도·출결 관리(진도 기록 날짜별 그룹 헤더), 출결 태그 색상 구분, 설문/체크리스트, 과제 수합(Google Drive 연동), 결번 학생 표시.`,
    metadata: { source: 'feature-summary', category: 'class-management', title: '수업 관리 기능 요약' },
  },
  {
    content: `📝 메모: 포스트잇 스타일(6가지 색상), 위치 이동·회전, 크기 조절 + 기본 크기 복원, 위젯 모드에서 이전/다음 내비게이션, 보관(아카이브) 기능.`,
    metadata: { source: 'feature-summary', category: 'memo', title: '메모 기능 요약' },
  },
  {
    content: `✅ 할일: 우선순위(높음/보통/낮음/없음), 카테고리, 마감일, 반복 설정(수정 모달에서 변경·해제 가능), 하위 작업, 수동 정렬, 보관함.`,
    metadata: { source: 'feature-summary', category: 'todo', title: '할일 기능 요약' },
  },
  {
    content: `🍱 급식: NEIS API에서 매일 학교 급식 자동 조회, 알레르기 정보 표시.`,
    metadata: { source: 'feature-summary', category: 'meal', title: '급식 기능 요약' },
  },
  {
    content: `🔗 북마크: URL 북마크를 그룹별 관리, 이모지/파비콘 아이콘 지원.`,
    metadata: { source: 'feature-summary', category: 'bookmark', title: '북마크 기능 요약' },
  },
  {
    content: `🔧 쌤도구 (14가지+): 타이머(종료 예고 알림), 랜덤 뽑기, 신호등, 점수판, 룰렛, 주사위, 동전 던지기, QR코드 생성, 활동 기호, 투표, 설문/체크리스트, 워드클라우드, 자리 뽑기, 과제 수합.`,
    metadata: { source: 'feature-summary', category: 'tools', title: '쌤도구 기능 요약' },
  },
  {
    content: `🔗 공유 기능: 과제/상담/설문 공유 시 자동 URL 숏링크 생성, 커스텀 URL 입력 가능.`,
    metadata: { source: 'feature-summary', category: 'share', title: '공유 기능 요약' },
  },
  {
    content: `📤 내보내기: 좌석배치표·시간표를 Excel/PDF/HWPX(한글)로 내보내기. 학생 기록을 Excel/HWPX/생활기록부용 Excel로 내보내기(기간·카테고리·학생 필터). 조회 탭 검색 결과 Excel 내보내기.`,
    metadata: { source: 'feature-summary', category: 'export', title: '내보내기 기능 요약' },
  },
  {
    content: `⚙️ 설정: 학교/학급 정보(NEIS 검색, 직접 설정으로 학원/유치원/대안학교 지원), 교시 시간, 좌석 배치(행×열, 짝꿍), NEIS 연동(시간표·급식·학사일정), 날씨 지역(전국 83개 시/군), PIN 잠금(기능별), 테마(Notion 라이트 기본 + 7 프리셋 + 커스텀), 위젯 스타일(카드 모서리·간격·배경색·글꼴 등 세밀 커스터마이징), 폰트(11가지 한글 폰트), Google Drive 동기화, 사이드바 순서/숨기기, 행사 알림 on/off, 자동 시작, 방해 금지, 앱 정보·릴리즈 노트.`,
    metadata: { source: 'feature-summary', category: 'settings', title: '설정 기능 요약' },
  },
  {
    content: `📱 쌤핀 모바일: 스마트폰에서 시간표·출결·메모·할일·일정 조회 가능한 PWA(m.ssampin.com). Google Drive로 PC 데이터와 자동 동기화. 모바일에서 출결 체크 가능. iOS Safari 완전 지원(v1.8.1에서 안정화).`,
    metadata: { source: 'feature-summary', category: 'mobile', title: '모바일 앱 기능 요약' },
  },
  {
    content: `💾 데이터 저장: 모든 데이터 로컬 저장(서버 전송 없음), Google Drive 동기화로 백업/복원 + 모바일 연동, 오프라인 완전 동작(날씨·급식·과제수합·동기화 제외), Windows 데스크톱(Electron) + 모바일 웹앱(PWA).`,
    metadata: { source: 'feature-summary', category: 'data-storage', title: '데이터 저장 기능 요약' },
  },
];

// ── 임베딩 함수 ───────────────────────────────────────────────────────────────

async function ingestDocuments(documents) {
  const BATCH_SIZE = 10;
  let total = 0;

  for (let i = 0; i < documents.length; i += BATCH_SIZE) {
    const batch = documents.slice(i, i + BATCH_SIZE);

    const response = await fetch(`${SUPABASE_URL}/functions/v1/ssampin-embed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${EMBED_AUTH_TOKEN}`,
      },
      body: JSON.stringify({
        action: 'upsert',
        documents: batch,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`배치 ${Math.floor(i / BATCH_SIZE) + 1} 실패:`, error);
      continue;
    }

    total += batch.length;
    console.log(`✅ ${total}/${documents.length} 문서 임베딩 완료`);

    // Rate limit 방지
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\n🎉 총 ${total}개 문서 임베딩 완료!`);
}

async function main() {
  const allDocs = [...QA_DOCUMENTS, ...FEATURE_DOCUMENTS];
  console.log(`📚 총 ${allDocs.length}개 문서 임베딩 시작...`);
  console.log(`   Q&A: ${QA_DOCUMENTS.length}개, 기능 요약: ${FEATURE_DOCUMENTS.length}개\n`);
  await ingestDocuments(allDocs);
}

main().catch(console.error);
