export type DocCategory = 'start' | 'features' | 'sync' | 'troubleshooting' | 'reference';

export interface DocImage {
  readonly src: string;
  readonly alt: string;
}

export interface DocCallout {
  readonly title: string;
  readonly body: string;
  readonly tone?: 'info' | 'warning' | 'success';
}

export interface DocSection {
  readonly id: string;
  readonly title: string;
  readonly body?: readonly string[];
  readonly steps?: readonly string[];
  readonly bullets?: readonly string[];
  readonly callout?: DocCallout;
  readonly image?: DocImage;
}

export interface DocArticle {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly category: DocCategory;
  readonly lastUpdated: string;
  readonly image?: DocImage;
  readonly quickLinks?: readonly { readonly title: string; readonly href: string }[];
  readonly sections: readonly DocSection[];
  readonly related?: readonly string[];
}

export interface DocNavGroup {
  readonly title: string;
  readonly items: readonly string[];
}

export const docsNavGroups: readonly DocNavGroup[] = [
  {
    title: '시작하기',
    items: [
      'start',
      'start/install-windows',
      'start/install-macos',
      'start/first-run',
      'start/school-neis',
      'start/data-safety',
    ],
  },
  {
    title: '주요 기능',
    items: [
      'features/dashboard',
      'features/timetable',
      'features/schedule',
      'features/homeroom',
      'features/class-management',
      'features/seating',
      'features/memo',
      'features/todo',
      'features/meals',
      'features/tools',
      'features/my-apps',
      'features/bookmarks-export',
      'features/settings',
      'features/security-pin',
      'features/widget-mode',
      'features/mobile',
      'features/ai-bridge',
      'features/markdown-converter',
      'features/attachments',
    ],
  },
  {
    title: '백업과 연동',
    items: ['sync/google-drive', 'sync/google-calendar', 'sync/google-tasks', 'sync/data-location'],
  },
  {
    title: '문제 해결',
    items: [
      'troubleshooting',
      'troubleshooting/download-help',
      'troubleshooting/windows-smartscreen',
      'troubleshooting/windows-smart-app-control',
      'troubleshooting/v3-antivirus',
      'troubleshooting/macos-security',
      'troubleshooting/neis',
      'troubleshooting/google-sync',
      'troubleshooting/display-widget',
    ],
  },
  {
    title: '참고',
    items: ['faq', 'releases', 'contact'],
  },
];

export const docsArticles: readonly DocArticle[] = [
  {
    slug: 'start',
    title: '쌤핀 시작하기',
    description: '설치, 첫 실행, 학교 설정, 데이터 보관 방식을 처음부터 차근차근 안내합니다.',
    category: 'start',
    lastUpdated: '2026-06-23',
    image: { src: '/docs/screenshots/dashboard.png', alt: '쌤핀 대시보드 첫 화면' },
    quickLinks: [
      { title: 'Windows 설치', href: '/docs/start/install-windows' },
      { title: 'macOS 설치', href: '/docs/start/install-macos' },
      { title: '학교와 NEIS 설정', href: '/docs/start/school-neis' },
      { title: '데이터는 어디에 저장되나요?', href: '/docs/start/data-safety' },
    ],
    sections: [
      {
        id: 'what-is-ssampin',
        title: '쌤핀은 어떤 앱인가요?',
        body: [
          '쌤핀은 시간표, 좌석배치, 일정, 메모, 할 일, 담임 기록, 수업 관리, 급식, 날씨, 쌤도구를 한곳에 모아 두는 교사용 데스크톱 대시보드입니다.',
          '기본 데이터는 선생님 컴퓨터에 저장됩니다. Google Drive 동기화를 켠 경우에만 선생님이 연결한 Google 계정으로 백업과 기기 간 동기화가 진행됩니다.',
        ],
      },
      {
        id: 'first-path',
        title: '처음 사용 순서',
        steps: [
          'PC 또는 Mac에 쌤핀을 설치합니다.',
          '첫 실행에서 학교, 학년, 반 정보를 입력합니다.',
          'NEIS에서 시간표, 급식, 학사일정을 가져올지 선택합니다.',
          '담임 업무와 수업 관리에 학생 명단을 넣습니다.',
          '대시보드에서 자주 보는 위젯을 켜고 순서를 정리합니다.',
        ],
      },
      {
        id: 'works-offline',
        title: '인터넷 없이도 쓸 수 있는 범위',
        body: [
          '시간표 직접 입력, 좌석배치, 메모, 할 일, 담임 기록, 수업 기록, 내보내기, PIN 잠금은 인터넷 없이도 사용할 수 있습니다.',
          '날씨, 급식 자동 조회, NEIS 불러오기, Google Drive/Calendar/Tasks 연동, 공유 링크가 필요한 기능은 인터넷 연결이 필요합니다.',
        ],
      },
    ],
    related: ['features/dashboard', 'start/install-windows', 'start/data-safety'],
  },
  {
    slug: 'start/install-windows',
    title: 'Windows에 설치하기',
    description: 'Windows 10/11에서 쌤핀을 다운로드하고 보안 경고를 지나 설치하는 방법입니다.',
    category: 'start',
    lastUpdated: '2026-06-23',
    sections: [
      {
        id: 'download',
        title: '설치 파일 받기',
        steps: [
          'ssampin.com에서 Windows 다운로드 버튼을 누릅니다.',
          '파일 이름이 `ssampin-Setup.exe`인지 확인합니다.',
          '다운로드가 끝나면 설치 파일을 실행합니다.',
        ],
      },
      {
        id: 'smartscreen',
        title: 'Microsoft Windows의 PC 보호 화면이 뜰 때',
        body: [
          '개인 개발 앱은 Microsoft 인증서가 아직 없으면 SmartScreen 경고가 보일 수 있습니다.',
          '쌤핀 공식 홈페이지에서 받은 설치 파일이라면 `추가 정보`를 누른 뒤 `실행`을 선택합니다.',
        ],
        callout: {
          tone: 'warning',
          title: '설치 파일 출처 확인',
          body: '메신저나 블로그에서 받은 파일이 아니라 ssampin.com 또는 GitHub Releases에서 받은 파일인지 먼저 확인하세요.',
        },
      },
      {
        id: 'silent-block',
        title: '더블클릭해도 아무 반응이 없을 때',
        body: [
          'V3, 알약 같은 백신이 설치 파일을 조용히 차단한 경우가 많습니다.',
          '백신의 실시간 감시를 잠시 중지하고 설치한 뒤, 설치가 끝나면 다시 켜 주세요.',
        ],
      },
    ],
    related: [
      'troubleshooting/download-help',
      'troubleshooting/windows-smartscreen',
      'troubleshooting/v3-antivirus',
    ],
  },
  {
    slug: 'start/install-macos',
    title: 'macOS에 설치하기 (베타 지원)',
    description:
      'Apple Silicon과 Intel Mac에서 내 칩에 맞는 DMG 파일을 고르고 보안 경고를 해결합니다.',
    category: 'start',
    lastUpdated: '2026-07-08',
    sections: [
      {
        id: 'beta-notice',
        title: 'macOS는 베타 지원입니다',
        body: [
          'macOS 버전은 현재 베타로 제공됩니다. Apple 개발자 인증서가 없어 첫 실행 시 보안 경고가 표시되지만, 앱 자체는 안전합니다. 자동 업데이트도 지원되지 않아 새 버전은 직접 내려받아 설치합니다.',
        ],
      },
      {
        id: 'choose-file',
        title: '내 Mac에 맞는 파일 고르기',
        bullets: [
          '먼저 화면 왼쪽 위 사과(🍎) 메뉴에서 이 Mac에 관하여를 열어 칩 항목을 확인합니다.',
          '칩이 Apple M1, M2, M3, M4로 표시되면: Apple Silicon용 DMG 파일을 받습니다.',
          '칩(또는 프로세서)이 Intel Core로 표시되면: Intel 버전 받기 링크를 사용합니다.',
          '칩에 맞지 않는 파일을 받으면 "이 버전의 macOS에서 작동하는지 확인하려면 개발자에게 문의하십시오"라는 오류가 나며 실행되지 않습니다.',
        ],
      },
      {
        id: 'gatekeeper',
        title: '개발자를 확인할 수 없음 경고',
        steps: [
          '쌤핀을 더블클릭해 실행을 시도합니다.',
          '경고 창에서 완료를 클릭합니다. 휴지통으로 이동은 누르지 않습니다.',
          '시스템 설정을 열고 개인정보 보호 및 보안으로 이동해 아래로 스크롤합니다.',
          '쌤핀 항목 옆의 그래도 열기를 클릭하고 Mac 암호를 입력합니다.',
        ],
      },
      {
        id: 'privacy',
        title: '한 번만 허용하면 됩니다',
        body: [
          '그래도 열기로 한 번 실행하면 이후에는 경고 없이 실행됩니다. 예전에 안내되던 Control+클릭 → 열기 방법은 최신 macOS(15 이상)에서는 더 이상 동작하지 않습니다.',
        ],
      },
    ],
    related: ['troubleshooting/macos-security', 'start/data-safety'],
  },
  {
    slug: 'start/first-run',
    title: '첫 실행과 온보딩',
    description: '처음 켰을 때 학교, 학급, 시간표를 설정하는 흐름입니다.',
    category: 'start',
    lastUpdated: '2026-06-23',
    sections: [
      {
        id: 'wizard',
        title: '온보딩에서 정하는 것',
        bullets: [
          '학교 정보: 급식, 학사일정, NEIS 시간표 자동 불러오기에 사용합니다.',
          '학년/반: 학급 시간표와 담임 업무의 기본 기준이 됩니다.',
          '기본 위젯: 대시보드에서 처음 보여줄 정보를 정합니다.',
        ],
      },
      {
        id: 'skip',
        title: '나중에 바꿀 수 있나요?',
        body: [
          '학교, 학급, 시간표, 테마, 위젯은 모두 설정에서 다시 바꿀 수 있습니다. 처음부터 완벽히 입력하지 않아도 괜찮습니다.',
        ],
      },
    ],
    related: ['start/school-neis', 'features/settings', 'features/dashboard'],
  },
  {
    slug: 'start/school-neis',
    title: '학교와 NEIS 설정',
    description: '학교 검색, 학급 시간표, 급식, 학사일정 자동 연동의 기준을 설정합니다.',
    category: 'start',
    lastUpdated: '2026-06-23',
    sections: [
      {
        id: 'school',
        title: '학교 검색',
        body: [
          '설정에서 학교명을 검색하면 NEIS에 등록된 학교를 찾을 수 있습니다. 지역과 학교급을 함께 확인하면 같은 이름의 학교를 구분하기 쉽습니다.',
        ],
      },
      {
        id: 'neis-range',
        title: 'NEIS로 가져올 수 있는 것',
        bullets: ['학급 시간표', '급식 정보', '학사일정'],
        callout: {
          tone: 'info',
          title: '교사 개인 시간표',
          body: '교사 개인 시간표는 NEIS 공개 API에서 제공되지 않습니다. 교사 탭에서 직접 입력하거나 엑셀 업로드를 사용하세요.',
        },
      },
      {
        id: 'manual-school',
        title: '학교가 검색되지 않을 때',
        body: [
          '유치원, 학원, 일부 대안학교처럼 NEIS에 등록되지 않은 기관은 직접 입력으로 사용할 수 있습니다. 이 경우 NEIS 자동 조회 기능은 제한됩니다.',
        ],
      },
    ],
    related: ['features/timetable', 'features/meals', 'troubleshooting/neis'],
  },
  {
    slug: 'start/data-safety',
    title: '데이터 저장과 개인정보',
    description: '쌤핀 데이터가 어디에 저장되고, 언제 외부 서비스와 연결되는지 설명합니다.',
    category: 'start',
    lastUpdated: '2026-06-23',
    sections: [
      {
        id: 'local-first',
        title: '기본은 내 컴퓨터 저장',
        body: [
          '쌤핀의 기본 데이터는 선생님 PC 안에 저장됩니다. 쌤핀 자체 서버로 학생 이름, 상담 내용, 기록을 전송하지 않습니다.',
        ],
      },
      {
        id: 'google-exception',
        title: 'Google 연동을 켰을 때',
        body: [
          'Google Drive 동기화를 켜면 선생님 Google Drive에 백업 파일이 저장됩니다. Google Calendar나 Tasks를 연결하면 일정과 할 일이 해당 Google 서비스와 동기화됩니다.',
        ],
      },
      {
        id: 'attachments',
        title: '첨부 파일',
        body: [
          '관찰 기록과 출결 증빙 첨부는 기본적으로 로컬에 저장됩니다. Drive 동기화를 켜면 첨부 메타와 바이너리도 동기화 대상에 포함됩니다.',
        ],
      },
    ],
    related: ['sync/data-location', 'sync/google-drive', 'features/security-pin'],
  },
  {
    slug: 'features/dashboard',
    title: '대시보드',
    description: '오늘 필요한 정보를 한 화면에서 확인하고 위젯을 정리합니다.',
    category: 'features',
    lastUpdated: '2026-06-23',
    image: { src: '/docs/screenshots/dashboard.png', alt: '쌤핀 대시보드 화면' },
    sections: [
      {
        id: 'overview',
        title: '대시보드에서 보는 것',
        body: [
          '시간표, 일정, 할 일, 급식, 날씨, 학급 정보, 메시지 배너, 자주 쓰는 쌤도구를 한 화면에서 볼 수 있습니다.',
        ],
      },
      {
        id: 'widgets',
        title: '위젯 정리',
        steps: [
          '대시보드에서 편집 모드를 켭니다.',
          '필요한 위젯을 추가하거나 숨깁니다.',
          '드래그해서 자주 보는 정보를 위쪽으로 옮깁니다.',
          '글씨 크기와 표시 옵션을 조정합니다.',
        ],
      },
      {
        id: 'message',
        title: '오늘의 메시지 배너',
        body: [
          '조회, 종례, 수업 안내처럼 학생에게 보여줄 문장을 대시보드 상단에 크게 띄울 수 있습니다.',
        ],
      },
    ],
    related: ['features/widget-mode', 'features/timetable', 'features/todo'],
  },
  {
    slug: 'features/timetable',
    title: '시간표',
    description:
      '학급 시간표와 교사 시간표를 입력하고 NEIS, 컴시간, 엑셀, 색상, 변동 시간표를 관리합니다.',
    category: 'features',
    lastUpdated: '2026-08-11',
    image: { src: '/docs/screenshots/timetable.png', alt: '쌤핀 시간표 화면' },
    sections: [
      {
        id: 'tabs',
        title: '학급 시간표와 교사 시간표',
        body: [
          '학급 탭은 NEIS 자동 불러오기를 사용할 수 있습니다. 컴시간을 쓰는 학교라면 학급 탭에서 컴시간에서 불러올 수도 있는데, 이때는 교시별 담당 교사까지 함께 채워집니다(NEIS에는 없는 정보).',
          '교사 개인 시간표는 NEIS에서 제공되지 않으므로, 교사 탭에서 컴시간으로 불러오거나 직접 입력·엑셀 업로드로 채웁니다.',
          '컴시간에서 불러올 때 교시 시작 시각(일과시간)도 함께 가져와 자동으로 맞출 수 있습니다. 불러온 표는 바로 저장되지 않고 미리보기로 확인한 뒤 적용되며, 기존에 입력해 둔 시간표는 되돌리기로 보존됩니다.',
        ],
      },
      {
        id: 'change-sync',
        title: '시간표 변경 자동 감지',
        body: [
          '컴시간이나 NEIS에서 시간표가 바뀌면, 앱을 켤 때(또는 시간표 화면의 "컴시간 변동 확인" 버튼)에 변경을 감지해 무엇이 어떻게 바뀌었는지 알려드립니다.',
          '대시보드와 위젯의 새로고침 버튼을 눌러도 함께 확인합니다. 대시보드에서는 결과가 화면 오른쪽 아래 알림으로, 위젯에서는 아래쪽 안내 띠로 표시되며, 바뀐 내용이 있으면 눌러서 바로 검토할 수 있습니다.',
          '변경 내용은 확인 후 적용하기 전까지 기존 시간표를 덮어쓰지 않습니다. 원하면 설정에서 "조용히 자동 반영"으로 바꿀 수도 있습니다. 컴시간은 실시간 통지를 제공하지 않아, 앱 시작 시(하루 1회)와 직접 누르는 버튼으로 확인합니다.',
        ],
      },
      {
        id: 'new-term',
        title: '새 학기 시간표로 바꾸기',
        body: [
          '학기가 바뀌어도 시간표는 저절로 바뀌지 않습니다. 쌤핀은 지금 쓰는 시간표 한 벌만 가지고 있어서, 2학기가 시작되면 새 시간표를 직접 불러오거나 입력해 주셔야 합니다.',
          '학급 시간표와 교사 시간표는 따로 관리되므로, 둘 다 쓰신다면 탭을 바꿔 가며 각각 갱신해 주세요.',
        ],
        steps: [
          '시간표 화면 위쪽에서 바꿀 탭(학급 또는 교사)을 먼저 고릅니다.',
          '오른쪽 위 [불러오기]를 누르고 우리 학교가 쓰는 원본(NEIS·컴시간·압핀)을 고릅니다.',
          'NEIS는 기간을 고르는 단계가 있습니다. 이미 개학했다면 "이번 주"를 그대로 두고, 아직 개학 전이라면 "직접 선택"으로 개학 이후의 한 주(월~금)를 지정하세요.',
          '미리보기로 새 학기 시간표가 맞는지 확인한 뒤 적용합니다. 적용하기 전까지 기존 시간표는 그대로 남아 있고, 적용한 뒤에도 되돌리기로 되돌릴 수 있습니다.',
        ],
        callout: {
          title: '불러왔는데 지난 학기 표 그대로이거나 "시간표 데이터가 없습니다"라고 나온다면',
          body: '학교 담당 선생님이 아직 NEIS나 시간표 프로그램(컴시간·압핀)에 새 학기 시간표를 등록하지 않았을 수 있습니다. 쌤핀은 학교가 올려 둔 시간표를 그대로 받아오기 때문에, 원본이 아직 없으면 어떤 방법으로도 불러올 수 없습니다. 이럴 때는 [직접 편집]으로 새 시간표를 손으로 입력해 두고 쓰시다가, 학교에서 등록이 끝난 뒤 다시 불러오시면 됩니다.',
          tone: 'warning',
        },
      },
      {
        id: 'edit',
        title: '바로 편집하기',
        bullets: [
          '과목 칸을 눌러 과목명을 수정합니다.',
          '교시 시간 영역을 눌러 시작과 종료 시간을 조정합니다.',
          '점심 위치는 표 안의 이동 버튼으로 바꿀 수 있습니다.',
          '보기 모드에서도 과목 색상을 빠르게 바꿀 수 있습니다.',
        ],
      },
      {
        id: 'override',
        title: '변동 시간표',
        body: [
          '행사, 시험, 단축수업처럼 특정 날짜만 달라지는 시간표는 변동 시간표로 관리합니다. 기본 시간표를 바꾸지 않고 해당 날짜에만 다르게 표시할 수 있습니다.',
        ],
      },
    ],
    related: ['start/school-neis', 'features/dashboard', 'troubleshooting/neis'],
  },
  {
    slug: 'features/schedule',
    title: '일정 관리',
    description: '학교 일정, 개인 일정, D-Day, Google Calendar 연동을 함께 관리합니다.',
    category: 'features',
    lastUpdated: '2026-06-23',
    image: { src: '/docs/screenshots/schedule.png', alt: '쌤핀 일정 관리 화면' },
    sections: [
      {
        id: 'views',
        title: '일정 보기 방식',
        body: [
          '월간, 목록, 검색 흐름으로 일정을 확인합니다. 같은 날짜의 일정은 수동으로 순서를 정리할 수 있습니다.',
        ],
      },
      {
        id: 'sources',
        title: '일정 출처',
        bullets: ['직접 입력한 일정', 'NEIS 학사일정', 'Google Calendar 일정', '학생 생일과 D-Day'],
      },
      {
        id: 'google-write',
        title: 'Google Calendar와의 관계',
        body: [
          '현재 쌤핀은 Google Calendar 일정을 가져오는 것뿐 아니라, 연결된 상태에서 일정 생성, 수정, 삭제도 동기화합니다.',
        ],
        callout: {
          tone: 'success',
          title: '일정 동기화 범위',
          body: 'Google Calendar를 연결하면 쌤핀에서 만든 일정 변경 사항도 함께 반영됩니다.',
        },
      },
    ],
    related: ['sync/google-calendar', 'troubleshooting/google-sync', 'features/todo'],
  },
  {
    slug: 'features/homeroom',
    title: '담임 업무',
    description:
      '학생 기록, 관찰 기록 알림, 설문/체크리스트, 상담 예약, 출결, 담임 좌석을 관리합니다.',
    category: 'features',
    lastUpdated: '2026-07-13',
    image: { src: '/docs/screenshots/homeroom.png', alt: '쌤핀 담임 업무 화면' },
    sections: [
      {
        id: 'records',
        title: '학생 기록',
        body: [
          '상담, 행동, 학업, 출결 관련 기록을 학생별로 남깁니다. 기록 탭은 [출결 | 누가기록 | 통계 | 조회]로 나뉘며 첫 화면은 출결입니다.',
        ],
        bullets: [
          '출결이 아닌 기록은 누가기록에서 큰 분류 하나를 고르고, 세부 내용을 태그로 여러 개 붙이는 방식입니다. 입력칸에 원하는 단어를 적고 Enter를 누르면 나만의 분류·태그를 바로 만들어 다음에도 이어 쓸 수 있습니다.',
          '상단의 태그 관리에서 태그를 추가·이름변경·삭제할 수 있고, 이름변경·삭제는 이미 작성한 기록에도 자동으로 반영됩니다(기본 제공 태그는 삭제되지 않습니다).',
          '통계에서 결석·지각·칭찬·상담 같은 숫자 칸을 누르면, 화면을 옮기지 않고 그 자리에서 해당 기록의 날짜·사유·교시·메모를 모아 볼 수 있습니다.',
          '조회는 [찾아보기]와 [검토] 두 화면으로 나뉩니다. 찾아보기는 학생별 타임라인·결과 요약·바로 수정·엑셀 내보내기를 지원하고, 검토는 나이스 반영·서류 제출·후속조치가 남은 기록만 모아 체크박스로 골라 한 번에 처리합니다.',
        ],
      },
      {
        id: 'record-reminder',
        title: '관찰 기록 알림',
        body: [
          '학생 관찰 기록을 놓치지 않도록, 오랫동안 기록이 비어 있는 학생을 찾아 살짝 알려주는 기능입니다. 기본은 꺼져 있고 설정 > 관찰 기록 알림에서 켤 수 있습니다.',
        ],
        bullets: [
          "담임은 기록이 오래 빈 학생을 '미기록 N명'처럼 은은하게 알려주고, 수업(교과) 반은 수업이 끝난 직후 그 반에서 아직 관찰이 없는 학생을 짚어 줍니다. 알림에서 바로 그 학생의 기록을 남길 수 있습니다.",
          '대시보드 배지와 컴퓨터 알림(OS 알림) 중 원하는 방식을 고를 수 있고, 알림 팝업은 화면 오른쪽 아래에 떠서 하던 일을 계속하면서 확인할 수 있습니다.',
          "'가볍게 / 보통 / 꼼꼼히' 프리셋으로 빈도와 요일(예: 평일만)을 정하거나 직접 설정하고, 지금 뜬 알림은 '나중에'로 전체 또는 그 학생만 1시간 뒤·오후에·내일로 미루거나 잠시 멈출 수 있습니다.",
          '기록 문장을 대신 써 주지는 않습니다. 언제·누구를 기록하면 좋을지 짚어주는 데까지만 돕고, 실제 내용은 선생님이 직접 씁니다.',
        ],
      },
      {
        id: 'record-draft',
        title: '생활기록부 초안과 근거 자료',
        body: [
          '학생 기록을 바탕으로 생활기록부 초안을 영역별(자율·진로·행동특성·세부능력 및 특기사항 등)로 작성합니다. 초안 화면 위쪽의 [초안 | 근거 자료] 토글로 두 화면을 오갈 수 있습니다.',
        ],
        bullets: [
          "'근거 자료'는 초안을 쓰기 전에 그 바탕이 되는 자료를 학생별로 모아두는 곳입니다. 직접 적어 넣거나, 담임은 누가기록에서·수업(교과)에서는 관찰기록에서 이미 적어둔 내용을 끌어와 담을 수 있습니다.",
          '각 근거는 자율·진로·행동특성·세부능력 및 특기사항 등 생기부 유형으로 분류하며, 한 근거를 여러 영역에 함께 분류할 수도 있습니다. 위쪽 유형 탭으로 영역별로 모아 봅니다.',
          "엑셀로 한 번에 등록할 수 있습니다. [양식 다운로드]로 명단이 채워진 엑셀을 받아 '관찰 내용'만 적어 올리면 되고, 한 칸 안에서 줄바꿈(Alt+Enter)하면 줄마다 별개의 근거로 등록됩니다. 올린 근거는 '미분류'에 모이며 클릭으로 유형을 지정합니다.",
          '근거 자료는 작업용 보조 자료라 언제든 수정·삭제할 수 있고, 담임 기록과 수업(교과) 기록에서 각각 따로 관리됩니다. 점수·석차 같은 숫자는 담지 않도록 안내합니다.',
        ],
      },
      {
        id: 'survey-booking',
        title: '설문과 상담 예약',
        bullets: [
          '설문/체크리스트는 교사가 직접 체크하거나 학생 공유 링크로 응답을 받을 수 있습니다.',
          '상담 예약은 상담 유형, 시간대, 예약자 정보를 단계별로 설정합니다.',
          '시간표와 겹치는 시간은 자동으로 막아 상담 시간을 잡기 쉽게 합니다.',
          '상담 예약 링크는 원할 때 즉시 마감하거나, 지정한 날짜(기본: 마지막 상담일 다음날)에 자동으로 마감되도록 설정할 수 있습니다. 마감해도 예약 명단과 내보내기는 그대로 유지되며, 마감·보관하면 학부모 예약 화면에는 "마감되었습니다"가 표시됩니다.',
        ],
      },
      {
        id: 'attendance',
        title: '담임 출결',
        body: [
          "기록 탭의 '출결' 화면에서 오늘 출결을 표로 입력합니다. 팔레트에서 종류(결석·지각·조퇴·결과)와 사유(질병·인정·미인정·기타)를 고른 뒤 칸을 누르면 규정에 맞는 교시까지 자동으로 채워지고, 자동 저장이라 저장 버튼이 필요 없습니다.",
        ],
        bullets: [
          '학생 이름을 누르면 하루 전체(예: 결석은 조회부터 종례까지)가 한 번에 입력되고, 실수는 Ctrl+Z로 되돌릴 수 있습니다.',
          "'3번 지각, 12번 결석'처럼 글로 적어 한 번에 넣는 빠른 입력과, 여러 학생을 선택해 같은 출결을 일괄 적용하는 기능이 있습니다. 여러 날짜(기간) 출결도 출결 화면 안에서 입력하며 주말은 자동으로 건너뜁니다.",
          '[명렬 | 좌석] 전환으로 교실 좌석 배치 그대로 출결을 확인할 수 있습니다.',
          '통계에서 생활기록부(나이스) 기준으로 접어 계산한 집계 표와 사유별 상세, A4 인쇄(요약/상세)를 제공하고, PDF·한글(HWPX)·엑셀로 내보낼 수 있습니다. 개근 파악 뷰로 개근 학생도 바로 추립니다.',
          '증빙서류가 필요한 출결에는 신청서·보고서·증빙자료를 종류별로 체크하는 목록이 있고, 같은 달에 같은 사유 키워드를 다시 입력하면 조용히 알려줍니다.',
        ],
      },
    ],
    related: ['features/attachments', 'features/security-pin', 'features/seating'],
  },
  {
    slug: 'features/class-management',
    title: '수업 관리',
    description: '수업반별 명렬표, 좌석, 진도, 출석부, 과제수합, 성적 분석, 루브릭을 관리합니다.',
    category: 'features',
    lastUpdated: '2026-08-11',
    image: { src: '/docs/screenshots/class-management.png', alt: '쌤핀 수업 관리 화면' },
    sections: [
      {
        id: 'class',
        title: '수업반 만들기',
        body: [
          '과목이나 반 단위로 수업반을 만들고, 명렬표를 넣으면 수업반 전용 좌석배치, 진도, 출결, 기록을 관리할 수 있습니다.',
        ],
      },
      {
        id: 'archive',
        title: '수업반 보관하기',
        body: [
          '학기가 끝나 더 쓰지 않는 수업반은 삭제하지 말고 보관하세요. 보관하면 목록과 선택 화면에서만 숨겨지고, 출결·진도·기록은 전부 그대로 남아 언제든 다시 볼 수 있습니다.',
        ],
        bullets: [
          '수업반 카드의 메뉴(⋮)에서 "보관"을 누르면 목록 아래 "보관된 수업반" 칸으로 이동합니다.',
          '여러 반을 정리할 때는 체크박스로 골라 한 번에 보관할 수 있습니다.',
          '보관된 반을 누르면 출결·진도·기록을 그대로 볼 수 있고(읽기 전용), "보관 해제"를 누르면 활성 목록 맨 아래로 돌아옵니다.',
          '같은 반의 다른 과목은 함께 보관되지 않습니다 — 필요한 과목만 골라 보관하세요.',
          '보관하기 전에 폰이나 다른 컴퓨터를 먼저 동기화해 두면 안전합니다. 시간표는 자동으로 바뀌지 않으니 새 학기 시간표는 따로 갱신해 주세요.',
        ],
      },
      {
        id: 'progress-attendance',
        title: '진도와 출결',
        bullets: [
          '진도 관리는 날짜, 교시, 단원, 차시, 상태를 기록합니다.',
          '진도를 추가할 때 "다른 반에도 함께 기록"에서 반을 고르면, 같은 내용이 그 반들에도 한 번에 들어갑니다. 날짜와 교시는 각 반의 시간표에 맞춰 자동으로 정해지고(그날 수업이 없으면 가장 가까운 다음 수업으로), 저장 전에 어디에 들어갈지 미리 보여줍니다. 이미 진도가 있는 자리는 덮어쓰지 않고 건너뜁니다.',
          '이미 만들어 둔 진도 계획을 통째로 옮길 때는 "다른 반에서 불러오기"를 사용합니다.',
          '출석부는 학생과 교시를 연결해 수업 시간별 출결을 입력합니다.',
          'NEIS 대표값 변환과 Excel 내보내기를 지원합니다.',
        ],
      },
      {
        id: 'assessment',
        title: '성적 분석과 루브릭',
        body: [
          '지필 성적 분석, 배점 계산, 수행평가 루브릭 만들기와 채점을 수업반 안에서 이어서 사용할 수 있습니다.',
        ],
      },
    ],
    related: ['features/attachments', 'features/tools', 'features/seating'],
  },
  {
    slug: 'features/seating',
    title: '좌석배치',
    description: '담임 교실과 수업반 좌석을 만들고, 제약 조건과 히스토리를 활용합니다.',
    category: 'features',
    lastUpdated: '2026-06-23',
    image: { src: '/docs/screenshots/seating.png', alt: '쌤핀 좌석배치 화면' },
    sections: [
      {
        id: 'modes',
        title: '좌석 보기 방식',
        bullets: ['격자 좌석배치', '모둠 레이아웃', '명렬표 보기', '교사 시점 보기'],
      },
      {
        id: 'random',
        title: '랜덤 배치와 조건',
        body: [
          '분리, 인접, 영역 고정, 고정 좌석 조건을 설정해 두면 랜덤 배치 때 자동으로 반영됩니다.',
        ],
      },
      {
        id: 'history',
        title: '이전 자리 피하기',
        body: [
          '자리배치 히스토리를 활용하면 직전 자리와 너무 비슷한 배치를 피할 수 있습니다. 이름 학습 모드와 자유 배치 모드도 함께 사용할 수 있습니다.',
        ],
      },
    ],
    related: ['features/homeroom', 'features/class-management', 'features/bookmarks-export'],
  },
  {
    slug: 'features/memo',
    title: '메모',
    description: '포스트잇처럼 메모를 만들고, 이미지, 링크, 리치 텍스트, 공유 보드를 사용합니다.',
    category: 'features',
    lastUpdated: '2026-06-23',
    image: { src: '/docs/screenshots/memo.png', alt: '쌤핀 메모 화면' },
    sections: [
      {
        id: 'basic',
        title: '메모 만들기',
        body: [
          '메모 화면에서 새 메모를 추가하고 위치, 크기, 색상, 글자 크기를 조정합니다. 리치 텍스트, 이미지 첨부, 링크 삽입을 지원합니다.',
        ],
      },
      {
        id: 'archive',
        title: '보관과 정리',
        body: [
          '지금은 필요 없지만 지우고 싶지 않은 메모는 보관할 수 있습니다. 격자 정렬로 흩어진 메모를 빠르게 정리할 수도 있습니다.',
        ],
      },
      {
        id: 'share',
        title: '교실 화면에 공유',
        body: [
          '메모 공유 보드를 만들면 전자칠판이나 TV에 고정 링크로 메모를 띄울 수 있습니다. 공유 데이터는 선생님 Google Drive에 저장됩니다.',
        ],
      },
    ],
    related: ['sync/google-drive', 'features/widget-mode'],
  },
  {
    slug: 'features/todo',
    title: '할 일',
    description:
      '기본 할 일, 자연어 빠른 입력, 우선순위 매트릭스, 날짜별 정리, 통합 보기, 프로 모드, Google Tasks 동기화를 사용합니다.',
    category: 'features',
    lastUpdated: '2026-06-24',
    image: { src: '/docs/screenshots/todo.png', alt: '쌤핀 할 일 화면' },
    sections: [
      {
        id: 'basic',
        title: '기본 할 일 관리',
        bullets: [
          '마감일, 시간, 중요도, 카테고리를 설정합니다.',
          '오늘, 예정, 날짜별 그룹으로 확인합니다.',
          '드래그해서 순서를 바꾸거나 D-Day 순으로 정렬합니다.',
        ],
      },
      {
        id: 'quick-add',
        title: '자연어 빠른 입력과 우선순위 매트릭스',
        bullets: [
          '“내일 3시 학년부 회의 !높음 #업무 매주 월수금”처럼 한 줄로 적으면 날짜·시간·중요도·카테고리·반복을 자동으로 알아채 채워 줍니다. 인식된 내용은 칩으로 미리 보이고, 끄기 토글로 글자 그대로 저장할 수도 있습니다.',
          '우선순위 매트릭스 보기에서 할 일을 “지금 하기 / 계획하기 / 빠르게 처리 / 천천히 정리” 네 칸으로 나눠 보고, 카드를 끌어 옮기면 우선순위가 바로 바뀝니다.',
          '“이번 주 한눈에” 요약 카드가 완료·진행 중·이번 주 마감·마감 임박·지난 마감·새로 추가 개수를 모아 보여 줍니다.',
          '반복 할 일은 여러 요일 지정(매주 월수금)과 매월 말일 처리를 지원합니다. 모두 외부 AI 없이 앱 안에서 동작합니다.',
        ],
      },
      {
        id: 'timeline',
        title: '통합 보기',
        body: [
          '할 일 화면에서 수업과 일정을 함께 켜면 오늘의 흐름을 시간순으로 볼 수 있습니다. 대시보드 위젯에서도 같은 흐름을 확인할 수 있습니다.',
        ],
      },
      {
        id: 'pro',
        title: '프로 모드',
        body: [
          '칸반, 테이블, 타임라인 뷰로 복잡한 프로젝트를 관리합니다. 프로 모드를 켜고 끄더라도 기존 할 일 데이터는 유지됩니다.',
        ],
      },
      {
        id: 'tasks',
        title: 'Google Tasks 연동',
        body: [
          'Google Tasks와 양방향으로 동기화하면 쌤핀에서 만든 할 일을 Google Tasks에서도 볼 수 있고, Google Tasks에서 삭제한 항목은 쌤핀에도 반영됩니다.',
        ],
      },
    ],
    related: ['sync/google-tasks', 'features/schedule', 'features/dashboard'],
  },
  {
    slug: 'features/meals',
    title: '급식',
    description: 'NEIS 급식과 직접 입력 급식을 함께 확인합니다.',
    category: 'features',
    lastUpdated: '2026-06-23',
    image: { src: '/docs/screenshots/meal.png', alt: '쌤핀 급식 화면' },
    sections: [
      {
        id: 'neis',
        title: '자동 급식',
        body: [
          '학교 정보가 설정되어 있으면 NEIS 공식 API에서 급식 정보를 가져옵니다. 중식뿐 아니라 학교가 등록한 조식, 석식도 표시합니다.',
        ],
      },
      {
        id: 'manual',
        title: '수동 입력',
        body: [
          'NEIS에 등록되지 않은 급식이나 간식은 직접 입력할 수 있습니다. 자동 급식과 수동 급식을 함께 보는 모드도 지원합니다.',
        ],
      },
    ],
    related: ['start/school-neis', 'troubleshooting/neis'],
  },
  {
    slug: 'features/tools',
    title: '쌤도구',
    description: '수업 중 바로 쓰는 27가지 교실 도구를 정리하고 실행합니다.',
    category: 'features',
    lastUpdated: '2026-06-24',
    image: { src: '/docs/screenshots/tools-grid.png', alt: '쌤핀 쌤도구 목록 화면' },
    sections: [
      {
        id: 'count',
        title: '현재 도구 수',
        body: ['쌤도구에는 수업 중 바로 실행할 수 있는 교실 도구 27가지가 들어 있습니다.'],
      },
      {
        id: 'list',
        title: '도구 목록',
        bullets: [
          '자리뽑기, 랜덤뽑기, 타이머, 활동기호, 룰렛, QR코드, 워드클라우드',
          '주사위, 객관식 설문, 점수판, 신호등, 주관식 설문, 복합 유형 설문',
          '교실약속정하기, 과제수합, 동전던지기, 모둠 편성기',
          '가치수직선 토론, 신호등 토론, 칠판, 협업 보드',
          '숲소리, PBL스케치, 서명받기, 서식, 마크다운 변환기, 배점 계산기',
        ],
      },
      {
        id: 'signature-retention',
        title: '서명받기 보관과 삭제',
        body: [
          '서명받기는 구글시트 등록부에서 서명 이미지를 불러올 수 있도록 서명 이미지를 공개 링크로 보관합니다.',
          '서명을 더 받지 않을 때 세션을 마감하면 30일, 60일, 90일 또는 직접 설정한 기간 뒤 서명 이미지만 자동 삭제됩니다. 마감 전에는 서명 이미지만 삭제할 수 없습니다.',
          '마감된 세션에서는 서명 이미지만 즉시 삭제할 수 있습니다. 이때 명단, 서명 완료 여부, 서명 시각 기록은 유지됩니다.',
        ],
        callout: {
          title: '삭제 전 확인',
          body: '서명 이미지를 삭제하면 기존 구글시트의 서명 칸이 더 이상 보이지 않을 수 있고, 삭제한 이미지는 복구할 수 없습니다.',
          tone: 'warning',
        },
      },
      {
        id: 'organize',
        title: '자주 쓰는 도구 정리',
        body: [
          '쌤도구 페이지에서 순서를 바꾸거나 숨길 수 있고, 대시보드와 위젯에는 자주 쓰는 도구를 바로 꺼낼 수 있습니다.',
        ],
      },
    ],
    related: ['features/markdown-converter', 'features/class-management'],
  },
  {
    slug: 'features/my-apps',
    title: '내가 만든 앱',
    description: 'AI로 만든 나만의 HTML 웹앱을 쌤핀에 등록해 격리된 환경에서 실행합니다.',
    category: 'features',
    lastUpdated: '2026-07-03',
    sections: [
      {
        id: 'what',
        title: '내가 만든 앱이란',
        body: [
          '쌤도구 맨 아래 "내가 만든 앱"에서, 선생님이 직접 만든 HTML 웹앱을 등록해 쌤핀 안에서 바로 실행할 수 있습니다.',
          '타이머, 활동판, 간단한 게임처럼 원하는 도구를 직접 만들어 아이콘과 이름을 붙여 보관하고, 필요할 때 클릭 한 번으로 실행합니다.',
        ],
      },
      {
        id: 'make-with-ai',
        title: 'AI로 앱 만들기',
        steps: [
          'Gemini, ChatGPT 같은 AI 챗봇에 "학생용 ○○ 활동 웹앱을 HTML 파일 하나로 만들어줘"라고 요청합니다. 필요하면 폰트·차트 같은 공개 자료(https)나 공개 API도 쓸 수 있습니다.',
          '만들어진 코드를 index.html 파일 하나로 저장합니다.',
          '쌤핀 > 쌤도구 > 내가 만든 앱 > 앱 추가에서 그 HTML 파일을 올리고, 이름과 아이콘을 정합니다.',
        ],
        callout: {
          title: '예시 프롬프트',
          body: '예를 들어 "우리 반 발표 순서 뽑기 웹앱을 만들어줘. 컴퓨터를 잘 몰라도 바로 쓰게 HTML 파일 하나로, 스마트폰과 교실 큰 화면에서 잘 보이게, 글씨는 크고 색은 산뜻하게, 학생 이름 같은 개인정보는 저장하거나 밖으로 보내지 않게"처럼 편하게 요청하면 됩니다.',
          tone: 'info',
        },
      },
      {
        id: 'safety',
        title: '안전하게 실행됩니다',
        body: [
          '등록한 앱은 쌤핀 본체와 분리된 격리 공간에서 실행됩니다. 앱은 선생님 PC의 파일이나 쌤핀에 저장된 학생 정보에 접근할 수 없습니다.',
          '앱마다 저장 공간이 분리되어, 한 앱이 다른 앱의 데이터를 볼 수 없습니다.',
        ],
        callout: {
          title: '앱마다 디자인이 다를 수 있어요',
          body: '내가 만든 앱은 선생님이 직접 만든 것이라 쌤핀 기본 화면과 모양이 다를 수 있습니다. 쌤핀은 이를 안전하게 격리해 실행만 합니다.',
          tone: 'info',
        },
      },
      {
        id: 'manage',
        title: '추가·삭제·개수',
        bullets: [
          'HTML 파일은 최대 20MB, 앱은 최대 50개까지 등록할 수 있습니다.',
          '아이콘은 이모지(기본) 또는 이미지 파일로 지정할 수 있습니다.',
          '앱을 삭제하면 등록한 파일도 함께 지워집니다.',
          '내가 만든 앱을 쓰지 않는 선생님은 "내가 만든 앱" 영역을 숨길 수 있습니다.',
        ],
      },
    ],
    related: ['features/tools'],
  },
  {
    slug: 'features/bookmarks-export',
    title: '즐겨찾기와 내보내기',
    description: '웹사이트와 PC 폴더를 저장하고 시간표, 좌석, 기록을 파일로 내보냅니다.',
    category: 'features',
    lastUpdated: '2026-06-23',
    image: { src: '/docs/screenshots/bookmarks.png', alt: '쌤핀 즐겨찾기 화면' },
    sections: [
      {
        id: 'bookmarks',
        title: '즐겨찾기',
        body: [
          '자주 쓰는 웹사이트와 PC 폴더를 그룹별로 저장합니다. 링크 미리보기, 검색, 아카이브로 오래된 즐겨찾기를 정리할 수 있습니다.',
        ],
      },
      {
        id: 'export',
        title: '내보내기',
        body: [
          '좌석배치표, 시간표, 담임메모 등 주요 자료를 Excel, PDF, HWPX 형식으로 내보낼 수 있습니다.',
        ],
        image: { src: '/docs/screenshots/export.png', alt: '쌤핀 내보내기 화면' },
      },
    ],
    related: ['features/seating', 'features/timetable', 'features/homeroom'],
  },
  {
    slug: 'features/settings',
    title: '설정',
    description: '학교, Google 연동, 위젯, 좌석, 보안, 화면, 사이드바, 앱 정보를 관리합니다.',
    category: 'features',
    lastUpdated: '2026-06-23',
    image: { src: '/docs/screenshots/settings.png', alt: '쌤핀 설정 화면' },
    sections: [
      {
        id: 'tabs',
        title: '설정에서 관리하는 것',
        bullets: [
          '일반, 학교 정보, 교시 시간, 위젯, 좌석 설정, 보안',
          'Google 연동: 계정, 백업, Calendar, Tasks',
          '날씨, 화면, 사이드바, 일정, 데이터 관리, 앱 정보',
        ],
      },
      {
        id: 'display',
        title: '화면과 테마',
        body: [
          '밝은 테마와 어두운 테마, 여러 프리셋, 글꼴, 위젯 스타일을 조정합니다. 쌤핀은 한국어 글꼴 가독성을 우선합니다.',
        ],
      },
    ],
    related: ['sync/google-drive', 'features/security-pin', 'features/widget-mode'],
  },
  {
    slug: 'features/security-pin',
    title: '보안과 PIN',
    description: '학생 기록, 성적, 민감한 메뉴를 PIN으로 보호합니다.',
    category: 'features',
    lastUpdated: '2026-06-23',
    image: { src: '/docs/screenshots/settings-security.png', alt: '쌤핀 보안 설정 화면' },
    sections: [
      {
        id: 'why',
        title: 'PIN이 필요한 상황',
        body: [
          '교실 TV나 프로젝터에 쌤핀을 띄워둔 상태에서 학생 기록, 상담 메모, 성적 같은 민감한 화면이 보이지 않도록 막을 수 있습니다.',
        ],
      },
      {
        id: 'setup',
        title: 'PIN 설정',
        steps: [
          '설정으로 이동합니다.',
          '보안 탭을 엽니다.',
          'PIN을 만들고 보호할 메뉴를 선택합니다.',
          '학생이 볼 수 있는 화면과 교사용 화면을 분리해 사용합니다.',
        ],
      },
    ],
    related: ['start/data-safety', 'features/homeroom', 'features/class-management'],
  },
  {
    slug: 'features/widget-mode',
    title: '위젯 모드',
    description: '대시보드를 작은 창, 아이콘 모드(핀 캐릭터), 바탕화면 아래 모드로 띄웁니다.',
    category: 'features',
    lastUpdated: '2026-08-07',
    image: { src: '/docs/screenshots/settings-widget.png', alt: '쌤핀 위젯 설정 화면' },
    sections: [
      {
        id: 'modes',
        title: '위젯 표시 방식',
        bullets: [
          '일반 위젯 모드: 작은 창으로 대시보드를 띄웁니다.',
          '항상 위에: 다른 창 위에 고정합니다.',
          '아이콘 모드: 화면 위에 떠 있는 작은 핀 캐릭터로 접습니다. 아래에서 자세히 소개합니다.',
          '바탕화면 아이콘 아래 모드: Windows에서 바탕화면 일부처럼 씁니다.',
        ],
      },
      {
        id: 'close-action',
        title: 'X 버튼을 눌렀을 때 (창 닫기 동작)',
        bullets: [
          '설정 → 위젯 → "창 닫기 동작"에서 X 버튼을 눌렀을 때 무엇을 할지 고릅니다.',
          '위젯 모드로 전환 / 아이콘 모드로 접기 / 트레이로 최소화 / 완전히 종료 / 매번 물어보기 중에서 선택합니다.',
          '완전히 종료: 앱을 완전히 끕니다. 트레이에도 남지 않으므로 수업 알림, 자동 동기화도 함께 멈춥니다.',
          '매번 물어보기: X를 누를 때마다 위 네 가지 중에서 고르는 창이 뜹니다. 트레이 아이콘의 "완전히 종료"로도 언제든 끌 수 있습니다.',
        ],
      },
      {
        id: 'icon-mode',
        title: '아이콘 모드 — 핀 캐릭터 쌤핀이',
        bullets: [
          '켜는 방법: 위젯에서 마우스 오른쪽 버튼 → "아이콘으로 접기", 또는 설정 → 위젯의 "지금 아이콘 모드로 접기" 버튼. X 버튼의 창 닫기 동작을 "아이콘 모드로 접기"로 두면 X 한 번으로 접힙니다.',
          '쌤핀이가 먼저 알려줘요: 수업 시작 5분 전, 오늘 첫 수업 30분 전 브리핑(오늘 수업 개수), 점심 급식 메뉴, 마감 할 일을 말풍선으로 알려줍니다.',
          '핀 클릭: 오늘 요약이 그 자리에서 열립니다 — 오늘 수업 목록, 마감 할 일 완료 체크, 할 일 한 줄 빠른 추가까지.',
          '핀 더블클릭: 전체 앱으로 돌아갑니다. 드래그하면 원하는 위치로 옮길 수 있고, 위치는 다음 실행에도 기억됩니다.',
          '핀에 마우스를 올리면 현재 교시·다음 수업·할 일·급식·일정 요약이 보입니다.',
        ],
      },
      {
        id: 'sync',
        title: '메인 앱과 실시간 동기화',
        body: ['위젯에서 메모, 할 일, 일정 등을 수정하면 메인 앱에도 즉시 반영됩니다.'],
      },
      {
        id: 'lost',
        title: '화면 밖으로 사라졌을 때',
        body: [
          '설정의 위젯 위치 보정 또는 표시 초기화를 사용하면 보이지 않는 위치로 이동한 위젯을 다시 화면 안으로 가져올 수 있습니다.',
        ],
      },
    ],
    related: ['troubleshooting/display-widget', 'features/dashboard', 'features/memo'],
  },
  {
    slug: 'features/mobile',
    title: '쌤핀 모바일',
    description: 'm.ssampin.com에서 PC 데이터를 휴대폰으로 확인하고 일부 기록을 작성합니다.',
    category: 'features',
    lastUpdated: '2026-08-11',
    sections: [
      {
        id: 'install',
        title: '모바일 시작 순서',
        steps: [
          'PC 쌤핀에서 Google Drive 동기화를 먼저 설정합니다.',
          '휴대폰에서 m.ssampin.com에 접속합니다. PC 설정의 Google 연동 탭에 있는 모바일 연결 QR을 찍어도 됩니다.',
          'PC와 같은 Google 계정으로 로그인합니다.',
          '홈 화면에 추가하면 앱처럼 사용할 수 있습니다.',
        ],
      },
      {
        id: 'features',
        title: '모바일에서 할 수 있는 것',
        bullets: [
          '시간표(주간 포함), 일정, 메모, 할 일, 즐겨찾기 확인',
          '담임·수업 출결 기록 (스와이프 빠른 출결 포함). 홈의 "우리 반 → 체크하기" 명단은 담임 명렬표를 그대로 따르며, 번호가 없는 학생은 출결이 번호로 저장되는 특성상 목록에 나오지 않습니다(명렬표에서 번호를 지정하면 나타납니다).',
          '학생 연락처 조회와 전화 걸기, 관찰 기록·수업 기록 작성',
          '수행평가 채점, 진도 관리, 설문·과제 현황 확인. 진도를 기록할 때 "다른 반에도 함께"에서 반을 고르면 PC와 똑같이 그 반들에도 한 번에 들어갑니다(날짜·교시는 각 반 시간표 기준 자동 배정).',
          '그동안 쌓인 학생 기록 모아보기(유형·월별)와 담임·학급 출결 통계 조회',
          'PC에서 보관한 수업반은 모바일 수업 목록에서도 숨겨집니다(기록·통계는 그대로 보존).',
        ],
      },
      {
        id: 'sync-timing',
        title: '휴대폰과 PC는 언제 만나나요?',
        body: [
          '휴대폰과 PC는 직접 연결되지 않고 Google Drive를 거쳐 동기화됩니다. 휴대폰에서 입력한 내용은 몇 초 안에 Drive로 올라가고, PC는 저장할 때와 몇 분 주기로 Drive를 확인해 받아옵니다. 그래서 즉시가 아니라 보통 몇 분 안에 서로 반영됩니다.',
          '휴대폰 홈 상단에서 마지막 동기화 시각을 확인할 수 있고, 홈 화면을 아래로 당기면 즉시 새로 받아옵니다.',
          '출결과 학생 기록은 같은 시간대에 휴대폰과 PC에서 각각 입력해도 기록 단위로 합쳐지므로 서로를 지우지 않습니다. 반대로 한쪽에서 지운 출결은 다른 기기에서도 함께 지워져, 지운 기록이 되살아나지 않습니다.',
        ],
      },
    ],
    related: ['sync/google-drive', 'troubleshooting/google-sync'],
  },
  {
    slug: 'features/ai-bridge',
    title: 'AI 브릿지',
    description: '쌤핀 데이터를 외부 AI 챗봇과 안전하게 연결해 질문하고 작업합니다.',
    category: 'features',
    lastUpdated: '2026-06-23',
    sections: [
      {
        id: 'what',
        title: 'AI 브릿지는 무엇인가요?',
        body: [
          '클로드, GPT, 제미나이 같은 외부 AI 챗봇이 쌤핀의 데이터를 읽거나 일부 항목을 쓸 수 있게 연결하는 통로입니다.',
          '쌤핀이 켜져 있을 때, 선생님이 허용한 범위 안에서만 동작합니다.',
        ],
      },
      {
        id: 'scope',
        title: '연결 가능한 데이터',
        bullets: [
          '시간표, 일정, D-Day, 할 일',
          '담임 학생 기록과 수업반 기록',
          '출결 현황 조회와 등록',
          '메모, 노트, 북마크',
        ],
      },
      {
        id: 'control',
        title: '선생님이 제어하는 것',
        body: [
          '실명, 민감한 내용, 쓰기 권한은 별도 동의와 설정을 거쳐야 열립니다. 외부 AI에는 도구가 돌려준 정보가 전달되므로 사용하는 AI 서비스의 처리 정책도 함께 확인하세요.',
        ],
      },
    ],
    related: ['features/attachments', 'features/schedule', 'features/todo'],
  },
  {
    slug: 'features/markdown-converter',
    title: '마크다운 변환기',
    description: 'AI가 만든 마크다운 문서를 수업 자료로 다듬어 복사하거나 내보냅니다.',
    category: 'features',
    lastUpdated: '2026-06-23',
    sections: [
      {
        id: 'use',
        title: '언제 쓰나요?',
        body: [
          'AI 챗봇이 만들어 준 마크다운 표, 목록, 제목 구조를 수업 자료나 안내문에 붙이기 좋게 정리할 때 사용합니다.',
        ],
      },
      {
        id: 'flow',
        title: '기본 흐름',
        steps: [
          '쌤도구에서 마크다운 변환기를 엽니다.',
          '마크다운 원문을 붙여넣습니다.',
          '미리보기로 결과를 확인합니다.',
          '필요한 형식으로 복사하거나 내보냅니다.',
        ],
      },
    ],
    related: ['features/tools', 'features/ai-bridge'],
  },
  {
    slug: 'features/attachments',
    title: '관찰 기록과 출결 첨부',
    description: '수업 기록, 담임 기록, 출결 증빙에 사진과 문서를 붙입니다.',
    category: 'features',
    lastUpdated: '2026-06-23',
    sections: [
      {
        id: 'what',
        title: '첨부할 수 있는 자료',
        body: [
          '사진, PDF, 한글, 엑셀 같은 문서를 기록 작성 중에 함께 담아둘 수 있습니다. 이미지는 썸네일로, 문서는 파일칩으로 표시됩니다.',
        ],
      },
      {
        id: 'record',
        title: '기록 작성 중 첨부',
        steps: [
          '수업 관리 또는 담임 기록 작성 화면을 엽니다.',
          '학생과 날짜를 선택합니다.',
          '첨부 영역에 파일을 끌어다 놓거나 파일 선택을 누릅니다.',
          '기록을 저장하면 첨부도 함께 저장됩니다.',
        ],
      },
      {
        id: 'privacy',
        title: '저장 위치',
        body: [
          '첨부 파일은 기본적으로 내 컴퓨터에 저장됩니다. Google Drive 동기화를 켠 경우 첨부 메타와 파일도 동기화 대상에 포함됩니다.',
        ],
      },
    ],
    related: ['features/homeroom', 'features/class-management', 'sync/google-drive'],
  },
  {
    slug: 'sync/google-drive',
    title: 'Google Drive 동기화',
    description: 'PC, 새 컴퓨터, 모바일에서 같은 쌤핀 데이터를 이어서 사용합니다.',
    category: 'sync',
    lastUpdated: '2026-08-09',
    sections: [
      {
        id: 'setup',
        title: '처음 설정',
        steps: [
          '설정의 Google 연동 탭으로 이동합니다.',
          'Google 계정을 연결합니다.',
          '백업 또는 Drive 동기화 카드를 엽니다.',
          '클라우드로 업로드하거나 자동 동기화를 켭니다.',
        ],
      },
      {
        id: 'included',
        title: '동기화되는 데이터',
        body: [
          '현재 동기화 단일 소스에는 설정, 시간표, 학생, 좌석, 일정, 메모, 할 일, 학생 기록, 북마크, 설문, 과제, 수업반, 진도, 출결, 급식 수동 입력, 노트, 이모티콘, 루브릭, 관찰 기록, 생기부 초안, 관찰 첨부 메타와 첨부 파일이 포함됩니다.',
        ],
      },
      {
        id: 'first-sync',
        title: '새 기기에서 열 때',
        body: [
          'Drive 백업이 발견되면 클라우드 데이터로 시작, 로컬 우선, 새로 시작 중에서 선택하는 확인 창이 뜹니다. 덮어쓰기 사고를 막기 위한 단계입니다.',
        ],
      },
      {
        id: 'timing',
        title: '반영 시점 — 실시간이 아니라 몇 분 단위입니다',
        body: [
          '기기들은 서로 직접 연결되지 않고 각자 Google Drive에 올리고 내려받습니다. PC는 기본으로 저장할 때 자동 업로드하고, 5분마다 Drive를 확인해 다른 기기(휴대폰)의 변경을 받아옵니다. 주기는 설정의 백업 카드에서 바꿀 수 있습니다.',
          '휴대폰은 앱을 열 때, 다시 볼 때, 홈 화면을 아래로 당길 때 받아옵니다. 방금 다른 기기에서 입력한 내용이 안 보이면 잠시 뒤 다시 확인하거나 수동 동기화를 실행해 보세요.',
        ],
      },
      {
        id: 'conflict',
        title: '양쪽에서 동시에 수정하면?',
        body: [
          '출결과 학생 기록은 기록 하나하나를 비교해 합치므로, 휴대폰과 PC에서 서로 다른 반이나 날짜를 고쳤다면 둘 다 안전하게 남습니다. 완전히 같은 항목을 양쪽에서 고친 경우에만 더 나중에 저장한 쪽이 남습니다.',
          '그 밖의 데이터는 더 최근에 저장한 쪽이 우선합니다. 충돌 확인 창이 뜨면, 최근에 실제로 작업한 기기가 어느 쪽인지 떠올려 그쪽을 선택하면 됩니다.',
          '휴대폰에서 여러 항목이 한꺼번에 충돌하면 “모두 클라우드에서 복구”를 한 번 눌러 순서대로 받을 수 있습니다. 기기마다 어느 쪽을 유지할지 다르게 정해야 한다면 항목별 선택을 사용하세요.',
        ],
        callout: {
          tone: 'warning',
          title: '모두 클라우드에서 복구하기 전에',
          body: '휴대폰에서 아직 클라우드에 올리지 않은 최근 입력이 있다면 항목별 선택을 권장합니다. 일괄 복구 중 같은 항목을 다시 확인해야 하거나 안전 확인에 실패하면 자동으로 멈추고 개별 선택으로 돌아갑니다.',
        },
      },
      {
        id: 'manifest-file-repair',
        title: "PC에는 데이터가 있지만 새 기기에서 '변경 없음'으로 나올 때",
        body: [
          '동기화 장부에는 파일이 있다고 기록됐지만 Google Drive의 실제 JSON 파일이 사라진 예외 상태일 수 있습니다. 최신 쌤핀은 PC에서 백업할 때 실제 파일 존재와 수정 시각도 함께 확인합니다.',
          '실제 파일이 없으면 PC 원본으로 다시 올립니다. 실제 파일과 장부의 수정 시각이 다르면 다른 기기의 변경을 덮어쓰지 않도록 자동 복구를 멈추고 오류를 안내합니다.',
        ],
        callout: {
          tone: 'warning',
          title: 'PC 데이터를 먼저 보존하세요',
          body: "PC에서 일정과 할 일이 정상적으로 보인다면 먼저 전체 데이터를 별도로 백업하세요. 오류가 계속되면 Google Drive에서 폴더를 직접 삭제하지 말고, 설정 → Google 연동 → 클라우드 백업의 '클라우드 데이터 전체 삭제'를 사용한 뒤 같은 PC에서 즉시 다시 백업하세요.",
        },
      },
    ],
    related: ['sync/data-location', 'features/mobile', 'troubleshooting/google-sync'],
  },
  {
    slug: 'sync/google-calendar',
    title: 'Google Calendar 연동',
    description:
      'Google Calendar 일정을 쌤핀 일정과 함께 보고, 쌤핀 일정 변경을 Google에도 반영합니다.',
    category: 'sync',
    lastUpdated: '2026-06-23',
    sections: [
      {
        id: 'connect',
        title: '연결하기',
        steps: [
          '설정의 Google 연동 탭에서 계정을 연결합니다.',
          'Calendar 카드를 열고 권한을 허용합니다.',
          '일정 관리에서 Google 일정이 함께 보이는지 확인합니다.',
        ],
      },
      {
        id: 'sync',
        title: '동기화 범위',
        body: [
          '쌤핀에서 일정을 추가, 수정, 삭제하면 Google Calendar와도 동기화됩니다. NEIS 학사일정을 Google Calendar에 보내는 제안 기능도 제공합니다.',
        ],
      },
    ],
    related: ['features/schedule', 'troubleshooting/google-sync'],
  },
  {
    slug: 'sync/google-tasks',
    title: 'Google Tasks 동기화',
    description: '쌤핀 할 일을 Google Tasks와 양방향으로 맞춥니다.',
    category: 'sync',
    lastUpdated: '2026-06-23',
    sections: [
      {
        id: 'setup',
        title: '설정하기',
        steps: [
          '설정의 Google 연동 탭에서 계정을 연결합니다.',
          'Tasks 카드를 열고 Google Tasks 권한을 허용합니다.',
          '사용할 Task List를 선택합니다.',
          '동기화가 끝나면 할 일 옆에 연동 상태가 표시됩니다.',
        ],
      },
      {
        id: 'rules',
        title: '동기화 규칙',
        bullets: [
          '쌤핀에서 만든 할 일은 Google Tasks에 생성됩니다.',
          'Google Tasks에서 삭제한 할 일은 쌤핀에서도 삭제됩니다.',
          '자동 동기화는 앱 시작, 창 포커스 복귀, 할 일 변경 후, 주기적 실행 시점에 일어납니다.',
          'Google Tasks 일일 한도에 도달하면 자동 동기화를 잠시 멈추고 다음 날 재시도합니다.',
        ],
      },
    ],
    related: ['features/todo', 'troubleshooting/google-sync'],
  },
  {
    slug: 'sync/data-location',
    title: '데이터 위치와 백업',
    description: '로컬 저장 위치, 수동 백업, Drive 백업의 차이를 이해합니다.',
    category: 'sync',
    lastUpdated: '2026-08-07',
    sections: [
      {
        id: 'local',
        title: '로컬 데이터',
        body: [
          'Windows에서는 사용자 AppData 아래 쌤핀 데이터 폴더에 저장됩니다. 앱을 삭제해도 데이터 폴더는 별도로 남아 있어 재설치 후 다시 사용할 수 있습니다.',
        ],
      },
      {
        id: 'year-archive',
        title: '학년도 마무리와 보관함',
        body: [
          '한 학년도를 마치면 설정 > 연동·백업 > 학년도 마무리에서 그동안의 기록을 보관함에 넣고 새 학년도를 깨끗하게 시작할 수 있습니다. 보관은 삭제가 아니라 서랍에 넣어두는 것이어서, 언제든 다시 열어볼 수 있고 되돌릴 수도 있습니다.',
        ],
        bullets: [
          '안내 4단계에서 무엇이 보관되고(명렬·출결·기록·진도·좌석) 무엇이 그대로 남는지(설정·서식·노트·즐겨찾기) 확인한 뒤 실행합니다.',
          '실행 전에 안전 백업이 자동으로 만들어지고, 보관이 확인된 뒤에만 화면이 정리됩니다. 중간에 멈추면 "이어하기"로 마저 진행할 수 있습니다.',
          '끝난 뒤에도 "전환 취소"로 그 시점으로 되돌릴 수 있고, 되돌린 뒤 다시 마무리하면 "2번째 보관"으로 따로 쌓입니다.',
          '학년도 말이 아니어도 실행할 수 있지만, 학년도 중간이면 한 번 더 확인을 묻습니다 — 출결과 학생 기록은 학년도 단위로 집계되기 때문입니다.',
          '보관함은 이 컴퓨터에 저장되며, Google Drive 동기화를 쓰면 다른 컴퓨터에서도 볼 수 있고 백업 파일에도 함께 담깁니다.',
          '보관함을 지울 때는 확인 문구를 직접 입력해야 하며, 이 컴퓨터 기준으로 삭제됩니다(동기화 사본은 다음 동기화 때 다시 내려올 수 있습니다).',
        ],
      },
      {
        id: 'backup',
        title: '백업 방법',
        bullets: [
          'Google Drive 동기화로 클라우드에 백업합니다.',
          '앱을 켤 때마다 하루 한 번, 학생 기록·수업 기록·출결 등 중요 데이터의 날짜별 사본이 데이터 폴더 안 backups/startup 폴더에 자동으로 남습니다(14일 보관).',
          '내보내기 기능으로 필요한 자료를 Excel, PDF, HWPX로 저장합니다.',
          '문제 발생 전에는 데이터 폴더를 통째로 복사해 두는 것도 가능합니다.',
        ],
      },
    ],
    related: ['sync/google-drive', 'start/data-safety'],
  },
  {
    slug: 'troubleshooting',
    title: '문제 해결',
    description: '설치, 보안 경고, NEIS, Google 연동, 위젯 문제를 증상별로 해결합니다.',
    category: 'troubleshooting',
    lastUpdated: '2026-06-23',
    quickLinks: [
      { title: '다운로드가 안 돼요', href: '/docs/troubleshooting/download-help' },
      { title: 'Windows 보안 경고', href: '/docs/troubleshooting/windows-smartscreen' },
      { title: 'V3 백신 차단', href: '/docs/troubleshooting/v3-antivirus' },
      { title: 'Google 연동 문제', href: '/docs/troubleshooting/google-sync' },
    ],
    sections: [
      {
        id: 'first-check',
        title: '먼저 확인할 것',
        bullets: [
          '공식 홈페이지 또는 GitHub Releases에서 받은 파일인지 확인합니다.',
          '학교 네트워크가 다운로드, Google, NEIS 접속을 막고 있지 않은지 확인합니다.',
          '앱이 최신 버전인지 확인합니다.',
          '문제가 반복되면 발생한 화면, 시간, 누른 버튼을 함께 기록해 둡니다.',
        ],
      },
    ],
    related: ['faq', 'contact'],
  },
  {
    slug: 'troubleshooting/windows-smartscreen',
    title: 'Windows 보안 경고 해결',
    description: 'Microsoft Windows의 PC 보호 화면에서 설치를 계속하는 방법입니다.',
    category: 'troubleshooting',
    lastUpdated: '2026-06-23',
    sections: [
      {
        id: 'steps',
        title: '해결 순서',
        steps: [
          '설치 파일 이름과 출처를 확인합니다.',
          '파란 화면에서 추가 정보를 누릅니다.',
          '실행 버튼을 누릅니다.',
          '설치가 끝나면 시작 메뉴에서 쌤핀을 실행합니다.',
        ],
      },
      {
        id: 'why',
        title: '왜 보이나요?',
        body: [
          '쌤핀이 위험해서가 아니라, 개인 개발 앱이라 Microsoft 인증서와 평판 데이터가 아직 충분하지 않을 때 표시될 수 있습니다.',
        ],
      },
    ],
    related: ['start/install-windows', 'troubleshooting/download-help'],
  },
  {
    slug: 'troubleshooting/windows-smart-app-control',
    title: '스마트 앱 컨트롤 차단 해결',
    description: 'Windows 11의 스마트 앱 컨트롤이 설치 파일을 막을 때 해결합니다.',
    category: 'troubleshooting',
    lastUpdated: '2026-06-23',
    sections: [
      {
        id: 'unblock',
        title: '차단 해제',
        steps: [
          '설치 파일을 마우스 오른쪽 버튼으로 클릭합니다.',
          '속성을 엽니다.',
          '하단의 차단 해제를 체크합니다.',
          '확인을 누르고 설치 파일을 다시 실행합니다.',
        ],
      },
    ],
    related: ['start/install-windows', 'troubleshooting/windows-smartscreen'],
  },
  {
    slug: 'troubleshooting/v3-antivirus',
    title: 'V3 또는 백신이 설치를 막을 때',
    description: '백신이 설치 파일을 삭제하거나 실행을 막는 문제를 해결합니다.',
    category: 'troubleshooting',
    lastUpdated: '2026-06-23',
    sections: [
      {
        id: 'v3',
        title: 'V3 실시간 감시',
        steps: [
          'V3 트레이 아이콘을 마우스 오른쪽 버튼으로 클릭합니다.',
          '실시간 검사 일시 중지를 선택합니다.',
          '쌤핀 설치 파일을 다시 실행합니다.',
          '설치가 끝나면 실시간 검사를 다시 켭니다.',
        ],
      },
      {
        id: 'other',
        title: '다른 백신도 비슷합니다',
        body: [
          '알약 등 다른 백신도 개인 개발 앱을 오탐할 수 있습니다. 실시간 감시를 잠시 멈추고 공식 설치 파일을 실행한 뒤 다시 켜 주세요.',
        ],
      },
    ],
    related: ['troubleshooting/download-help', 'troubleshooting/windows-smartscreen'],
  },
  {
    slug: 'troubleshooting/macos-security',
    title: 'macOS 실행 문제 해결 (베타 지원)',
    description:
      'macOS에서 개발자를 확인할 수 없음, 이 버전의 macOS 오류, 자동 업데이트 안 됨 문제를 해결합니다.',
    category: 'troubleshooting',
    lastUpdated: '2026-07-08',
    sections: [
      {
        id: 'beta',
        title: 'macOS는 베타 지원입니다',
        body: [
          'macOS 버전은 현재 베타로 제공됩니다. Apple 개발자 인증서가 없어 첫 실행 시 보안 경고가 표시되지만, 앱 자체는 안전합니다.',
        ],
      },
      {
        id: 'open',
        title: '개발자를 확인할 수 없음 · 손상되었기 때문에 열 수 없음',
        steps: [
          '쌤핀을 더블클릭해 실행을 시도한 뒤, 경고 창에서 완료를 클릭합니다. 휴지통으로 이동은 누르지 않습니다.',
          '시스템 설정 → 개인정보 보호 및 보안으로 이동해 아래로 스크롤합니다.',
          '쌤핀 항목 옆의 그래도 열기를 클릭하고 Mac 암호를 입력합니다.',
          '한 번 허용하면 이후에는 경고 없이 실행됩니다. Control+클릭 → 열기 방법은 최신 macOS(15 이상)에서는 동작하지 않습니다.',
        ],
      },
      {
        id: 'wrong-chip',
        title: '이 버전의 macOS에서 작동하는지 확인하려면 개발자에게 문의하십시오',
        body: [
          '내 Mac의 칩에 맞지 않는 파일을 받은 경우에 나타나는 오류입니다. 사과(🍎) 메뉴 → 이 Mac에 관하여에서 칩을 확인하세요. Apple M1~M4면 Apple Silicon용 DMG, Intel Core면 Intel용 DMG를 다시 받아 설치하면 해결됩니다.',
        ],
      },
      {
        id: 'dmg',
        title: '손상 경고가 반복되거나 DMG가 열리지 않을 때',
        body: [
          '다운로드 보안 속성 때문일 수 있습니다. 터미널을 열고 `xattr -cr /Applications/쌤핀.app` 명령을 실행한 뒤 다시 실행해 보세요. DMG 파일 자체가 열리지 않으면 `xattr -cr ~/Downloads/ssampin-arm64.dmg`(Intel은 ssampin-x64.dmg)를 실행합니다.',
        ],
      },
      {
        id: 'update',
        title: '자동 업데이트가 되지 않아요',
        body: [
          'macOS 베타 지원에서는 앱 안 자동 설치가 제공되지 않습니다. 새 버전 알림에서 새 버전 다운로드를 누르면 내 칩에 맞는 DMG가 브라우저로 받아집니다. 받은 DMG를 열어 쌤핀을 응용 프로그램 폴더로 드래그해 덮어쓰면 업데이트 완료이며, 데이터는 그대로 유지됩니다.',
        ],
      },
    ],
    related: ['start/install-macos'],
  },
  {
    slug: 'troubleshooting/download-help',
    title: '다운로드 문제 해결',
    description: '다운로드가 막히거나 설치 파일이 사라질 때 확인할 순서입니다.',
    category: 'troubleshooting',
    lastUpdated: '2026-06-23',
    sections: [
      {
        id: 'browser',
        title: '브라우저 다운로드 차단',
        bullets: [
          '브라우저 하단 또는 다운로드 목록에서 보관, 계속 다운로드, 허용 같은 버튼이 있는지 확인합니다.',
          '학교 네트워크에서는 GitHub 다운로드가 막힐 수 있습니다. 다른 네트워크에서 다시 시도해 보세요.',
          '다운로드는 됐는데 파일이 사라졌다면 백신 격리함을 확인합니다.',
        ],
      },
      {
        id: 'reinstall',
        title: '재설치해도 데이터는 유지되나요?',
        body: [
          '쌤핀 데이터는 설치 파일과 별도 위치에 저장됩니다. 일반적인 재설치나 업데이트로 데이터가 지워지지 않습니다.',
        ],
      },
    ],
    related: ['start/install-windows', 'troubleshooting/v3-antivirus'],
  },
  {
    slug: 'troubleshooting/neis',
    title: 'NEIS 연동 문제',
    description: '학교 검색, 시간표, 급식, 학사일정이 나오지 않을 때 확인합니다.',
    category: 'troubleshooting',
    lastUpdated: '2026-08-11',
    sections: [
      {
        id: 'school',
        title: '학교가 검색되지 않음',
        body: [
          '학교명, 지역, 학교급을 다시 확인합니다. NEIS에 등록되지 않은 기관은 직접 입력으로 사용해야 합니다.',
        ],
      },
      {
        id: 'timetable',
        title: '시간표가 나오지 않음',
        bullets: [
          '학년도, 학년, 반이 맞는지 확인합니다.',
          '학교가 아직 해당 학기 시간표를 NEIS에 등록하지 않았을 수 있습니다. 학기 초에는 등록이 며칠 늦어지는 경우가 흔합니다.',
          '기간을 "이번 주"로 두었는데 그 주가 방학이거나 개학 전이면 결과가 비어 있습니다. "직접 선택"으로 개학 이후의 한 주를 지정해 보세요.',
          '교사 개인 시간표는 NEIS에서 자동으로 가져올 수 없습니다.',
        ],
        callout: {
          title: '기다릴 수 없다면 직접 입력해 두세요',
          body: '학교가 원본을 등록하기 전까지는 NEIS·컴시간·압핀 어느 쪽에서도 시간표를 받아올 수 없습니다. 그동안은 시간표 화면의 [직접 편집]으로 손수 입력해 쓰시고, 학교 등록이 끝난 뒤 [불러오기]로 다시 받아오시면 됩니다.',
          tone: 'info',
        },
      },
      {
        id: 'new-term',
        title: '학기가 바뀌었는데 지난 학기 시간표가 그대로예요',
        body: [
          '정상 동작입니다. 학기가 바뀌어도 시간표는 자동으로 갱신되지 않습니다. 시간표 화면의 [불러오기]로 새 학기 시간표를 다시 받아오거나, [직접 편집]으로 입력해 주세요.',
          '학급 시간표와 교사 시간표는 별개이므로 둘 다 쓰신다면 각각 갱신해야 합니다.',
        ],
      },
      {
        id: 'meal',
        title: '급식이 나오지 않음',
        body: [
          '학교가 해당 날짜 급식을 NEIS에 등록하지 않았을 수 있습니다. 필요한 경우 수동 입력을 사용하세요.',
        ],
      },
    ],
    related: ['start/school-neis', 'features/timetable', 'features/meals'],
  },
  {
    slug: 'troubleshooting/google-sync',
    title: 'Google 연동 문제',
    description: 'Drive, Calendar, Tasks 연결과 동기화 오류를 해결합니다.',
    category: 'troubleshooting',
    lastUpdated: '2026-07-13',
    sections: [
      {
        id: 'records-missing',
        title: '두 컴퓨터를 쓰다 기록이 사라졌어요',
        body: [
          'v2.2.12 이하에서는 두 컴퓨터를 Google 동기화로 오가며 쓸 때, 수업 관리의 학생별 수업 기록(메모)과 직접 만든 기록 카테고리가 드물게 통째로 사라질 수 있었습니다. v2.2.13에서 병합 방식을 바꿔 원인을 해결했으니, 먼저 두 컴퓨터 모두 최신 버전으로 업데이트하세요.',
        ],
        steps: [
          '이미 사라진 기록이 있다면 웹 브라우저에서 drive.google.com에 접속해 내 드라이브의 "쌤핀 동기화" 폴더를 엽니다.',
          'observations.json(수업 기록) 파일을 마우스 오른쪽 클릭 → "버전 관리"를 누르면 이전 버전 목록이 보입니다. 각 버전의 점 세 개(⋮) 메뉴에서 "영구 보관"을 눌러 30일 자동 삭제를 막아 두세요.',
          '복구가 필요하면 문의하기로 연락해 주세요. 이전 버전에서 기록을 안전하게 되살리는 방법을 안내해 드립니다.',
        ],
      },
      {
        id: 'connect',
        title: '연결이 안 될 때',
        steps: [
          '인터넷 연결을 확인합니다.',
          '학교 네트워크가 Google 로그인을 막고 있지 않은지 확인합니다.',
          '설정의 Google 연동 탭에서 연결 해제 후 다시 연결합니다.',
          '다른 브라우저 또는 다른 네트워크에서 다시 시도합니다.',
        ],
      },
      {
        id: 'browser',
        title: '카카오톡이나 네이버 앱에서 로그인 실패',
        body: [
          '인앱 브라우저에서는 Google 보안 정책 때문에 로그인이 막힐 수 있습니다. 링크를 길게 눌러 외부 브라우저로 열거나 Chrome/Safari에서 직접 접속하세요.',
        ],
      },
      {
        id: 'tasks',
        title: 'Tasks 경고 또는 한도',
        body: [
          'Google Tasks 권한 추가 과정에서 계정 환경에 따라 추가 확인 화면이 보일 수 있습니다. 또한 일일 API 한도에 도달하면 쌤핀이 자동 동기화를 잠시 멈췄다가 다음 날 다시 시도합니다.',
        ],
      },
    ],
    related: ['sync/google-drive', 'sync/google-calendar', 'sync/google-tasks'],
  },
  {
    slug: 'troubleshooting/display-widget',
    title: '화면과 위젯 문제',
    description: '화면 배율, 위젯 위치, 글씨 크기, 바탕화면 아래 모드 문제를 해결합니다.',
    category: 'troubleshooting',
    lastUpdated: '2026-08-11',
    sections: [
      {
        id: 'scale',
        title: '화면이 너무 작거나 커요',
        body: [
          '설정의 화면 또는 디스플레이 항목에서 글씨 크기와 위젯 스타일을 조정합니다. Windows 자체 배율이 너무 높으면 앱 전체 크기도 함께 커질 수 있습니다.',
        ],
      },
      {
        id: 'widget-out',
        title: '위젯이 화면 밖으로 사라졌어요',
        body: [
          '설정에서 위젯 위치 보정 또는 초기화를 실행해 보세요. 다중 모니터를 쓰다가 모니터를 뺐을 때 자주 발생합니다.',
        ],
      },
      {
        id: 'desktop-mode-edit',
        title: '바탕화면 정리 위젯의 연필(편집) 버튼이 안 눌려요 / 관리 버튼이 회색이에요',
        body: [
          '바탕화면 정리 위젯의 편집·정리 기능은 "바탕화면 아이콘 아래 모드"에서만 동작합니다. 먼저 설정 → 위젯 → 데스크톱 모드에서 이 모드가 켜져 있는지 확인하세요. 다른 모드에서는 편집 버튼이 눌리지 않거나 안내 배너만 보입니다.',
          '모드를 켰는데도 연필만 눌리지 않는다면, 대개 보안 프로그램 때문입니다. 이 모드는 위젯 위의 클릭을 Windows 마우스 후킹으로 위젯에 전달하는데, 일부 백신·학교 보안 프로그램(V3·알약·안랩 EDR 등)이 이 후킹을 막으면 이 위젯만 클릭이 닿지 않습니다(일반 창으로 뜨는 다른 위젯은 영향이 없어 "이것만 안 되는" 것처럼 보입니다).',
          '해결 순서: ① 보안 프로그램 예외 목록에 ssampin.exe를 추가합니다. ② 쌤핀을 관리자 권한으로 실행합니다. ③ 보조 모니터가 아니라 주 모니터에서 시도합니다. ④ 모드 토글을 껐다 다시 켜 재연결하거나 앱을 재시작합니다. 급하면 "일반 창"이나 "항상 위에" 모드로도 대시보드는 정상 사용됩니다.',
        ],
      },
      {
        id: 'desktop-mode-fallback',
        title: '바탕화면 아이콘 아래 모드가 안 켜지고 일반 모드로 되돌아가요',
        body: [
          '위젯을 바탕화면 계층에 붙이는 데 실패하면 쌤핀이 자동으로 일반(또는 항상 위에) 모드로 되돌리고, 원인과 해결법을 담은 안내창을 띄웁니다. 헤더의 모드 표시를 누르면 안내창을 다시 볼 수 있습니다.',
          '흔한 원인은 보안 프로그램 차단, 다중 모니터(보조 모니터에서 켬), Wallpaper Engine 등 바탕화면 커스텀 도구와의 충돌, 윈도우 탐색기(explorer.exe) 비정상, 최신 Windows 빌드에서의 계층 변경입니다. 안내창의 "다시 시도"를 먼저 누르고, 안 되면 예외 등록 → 주 모니터에서 시도 → 작업관리자에서 explorer.exe 다시 시작 → 앱 재시작 순으로 해보세요.',
        ],
      },
      {
        id: 'desktop-mode-no-response',
        title: '바탕화면 아이콘 아래를 눌러도 아무 변화가 없어요 (설정에는 켜져 있어요)',
        body: [
          'v2.3.6 이하에서는 이 모드를 켜는 데 한 번 실패하면 설정에만 "바탕화면 아이콘 아래"가 선택된 것으로 남고 실제로는 일반 모드로 동작했습니다. 이미 선택된 항목을 다시 눌러도 앱이 바뀐 것이 없다고 판단해, 아무 반응도 오류 안내도 없는 상태가 계속됐습니다.',
          'v2.3.7부터는 설정 → 위젯의 "지금 다시 적용" 버튼으로 언제든 다시 시도할 수 있고, 실패하면 원인 안내창이 표시됩니다. 위젯 헤더의 모드 표시를 눌러 같은 모드를 다시 선택해도 재시도됩니다.',
          'v2.3.6 이하를 쓰신다면 표시 모드를 "일반"으로 바꿔 저장한 뒤 다시 "바탕화면 아이콘 아래"로 바꿔 저장하면 재시도됩니다. 그래도 안 되면 %APPDATA%\\ssampin\\native-desktop-diag.log 파일을 첨부해 제보해 주세요.',
        ],
      },
    ],
    related: ['features/widget-mode', 'features/settings'],
  },
  {
    slug: 'faq',
    title: '자주 묻는 질문',
    description: '설치, 데이터, 오프라인, 학운위, 업데이트, 모바일 관련 질문을 모았습니다.',
    category: 'reference',
    lastUpdated: '2026-08-11',
    sections: [
      {
        id: 'free',
        title: '무료인가요?',
        body: ['네. 쌤핀은 무료이며 광고가 없습니다.'],
      },
      {
        id: 'offline',
        title: '인터넷 없이도 되나요?',
        body: [
          '핵심 기능은 오프라인에서 동작합니다. 다만 날씨, 급식 자동 조회, NEIS, Google 연동, 공유 링크가 필요한 기능은 인터넷이 필요합니다.',
        ],
      },
      {
        id: 'archive-class',
        title: '수업반을 보관하면 출결·기록도 지워지나요?',
        body: [
          '아니요, 그대로 남습니다. 보관은 목록에서 숨기는 것일 뿐 삭제가 아니에요. 보관된 수업반을 누르면 출결·진도·기록을 언제든 다시 볼 수 있고, "보관 해제"로 되돌릴 수도 있습니다. 학기가 바뀌어 더 쓰지 않는 반을 정리할 때 삭제 대신 보관을 사용하세요.',
        ],
      },
      {
        id: 'archive-year',
        title: '학년도 마무리를 하면 예전 기록은 어떻게 되나요?',
        body: [
          '보관함으로 옮겨지고 화면만 새 학년도로 비워집니다. 설정 > 연동·백업 > 학년도 마무리에서 언제든 보관함을 열어 명렬·기록·출결 통계·진도를 그대로 볼 수 있고, "전환 취소"로 되돌릴 수도 있습니다. 실행 전에 안전 백업이 자동으로 만들어지며, 보관이 확인된 뒤에만 화면이 정리됩니다.',
        ],
      },
      {
        id: 'school-approval',
        title: '학운위 심의를 받아야 하나요?',
        body: [
          '쌤핀은 교사 개인 PC에 데이터를 저장하는 도구이며, 쌤핀 서버가 학생 개인정보를 수집하거나 저장하지 않습니다. 학교 내부 기준이 별도로 있다면 그 기준에 따라 확인하세요.',
        ],
      },
      {
        id: 'mobile',
        title: '모바일에서도 쓸 수 있나요?',
        body: [
          'm.ssampin.com에서 사용할 수 있습니다. PC 쌤핀에서 Google Drive 동기화를 먼저 설정하고 같은 Google 계정으로 로그인해야 합니다.',
        ],
      },
      {
        id: 'update-notice',
        title: '새 버전 안내가 안 떠요 / 업데이트는 어떻게 하나요?',
        body: [
          '쌤핀은 실행 5초 뒤와 4시간마다 새 버전을 확인하고, 안내가 뜨면 "지금 설치"를 눌렀을 때만 내려받습니다. 설치 파일이 크기 때문에 사용자가 누르기 전에는 자동으로 받지 않습니다.',
          'v2.3.6 이하에서는 이 안내가 전체 화면(메인 창)에서만 표시됐습니다. 위젯이나 아이콘(핀) 모드로만 쓰시면 안내를 볼 기회가 없어 업데이트를 놓치게 됐습니다. v2.3.7부터는 위젯 모드 아래쪽 띠와 아이콘 모드의 핀 말풍선·팝오버에서도 새 버전을 안내하고 바로 설치할 수 있습니다.',
          '안내를 놓쳤다면 설정 → 앱 정보에서 현재 버전을 확인하고, www.ssampin.com에서 최신 설치 파일을 직접 받아 덮어 설치해도 됩니다. 데이터는 그대로 유지됩니다.',
        ],
      },
      {
        id: 'bulk-delete-events',
        title: '일정을 한꺼번에 삭제할 수 있나요?',
        body: [
          '일정 관리의 일괄 삭제 기능을 사용하면 특정 출처나 기간의 일정을 정리할 수 있습니다. NEIS나 Google 연동 일정은 삭제 범위와 원본 반영 여부를 확인한 뒤 진행하세요.',
        ],
      },
      {
        id: 'favorite-tools',
        title: '자주 쓰는 쌤도구를 바로 실행할 수 있나요?',
        body: [
          '설정과 쌤도구 정리 기능에서 자주 쓰는 도구를 앞쪽에 배치하면 대시보드와 위젯에서도 빠르게 실행할 수 있습니다.',
        ],
      },
      {
        id: 'folder-bookmark',
        title: '즐겨찾기에 PC 폴더도 추가할 수 있나요?',
        body: [
          '웹사이트뿐 아니라 자주 여는 PC 폴더도 즐겨찾기에 추가할 수 있습니다. 수업 자료 폴더나 학급 업무 폴더를 등록해두면 바로 열 수 있습니다.',
        ],
      },
      {
        id: 'zero-responses',
        title: '학생이 응답했는데 교사 화면에 0명으로 보여요',
        body: [
          '공유 도구에서 학생 화면과 교사 화면이 같은 세션인지 확인하세요. 학교 네트워크가 실시간 연결을 막는 경우 새 링크를 만들거나 다른 네트워크에서 다시 시도하면 해결되는 경우가 있습니다.',
        ],
      },
      {
        id: 'sample-students',
        title: '설치했더니 모르는 학생이 보이나요?',
        body: [
          '현재 버전에서는 신규 설치 시 샘플 학생 35명을 자동으로 넣지 않습니다. 오래된 데이터가 남아 있다면 데이터 관리에서 현재 데이터 위치와 백업 상태를 먼저 확인하세요.',
        ],
      },
      {
        id: 'avoid-previous-seat',
        title: '자리 배치를 이전과 다르게 하고 싶어요',
        body: [
          '좌석배치 히스토리와 이전 자리 피하기 옵션을 사용하세요. 완전히 다른 배치를 보장하는 기능이라기보다 직전 배치와 너무 비슷한 결과를 줄이는 보조 장치입니다.',
        ],
      },
    ],
    related: ['troubleshooting', 'start/data-safety', 'features/mobile'],
  },
  {
    slug: 'releases',
    title: '업데이트 내역',
    description: '최신 버전에서 달라진 점과 주요 기능입니다.',
    category: 'reference',
    lastUpdated: '2026-06-23',
    sections: [
      {
        id: 'current',
        title: '지원 기준 버전',
        body: ['이 가이드는 쌤핀 v2.2.2에서 사용할 수 있는 기능을 기준으로 정리했습니다.'],
      },
      {
        id: 'recent',
        title: '최근 반영된 주요 기능',
        bullets: [
          '관찰 기록과 출결에 자료 첨부',
          'AI 브릿지 출결 현황 연결',
          'Google Drive 동기화 대상 확대',
          'Google Tasks 양방향 동기화',
          '성적 분석, 루브릭, 마크다운 변환기, 배점 계산기',
        ],
      },
    ],
    related: ['features/attachments', 'features/ai-bridge', 'features/tools'],
  },
  {
    slug: 'contact',
    title: '도움 요청과 피드백',
    description: '문제가 해결되지 않을 때 어떤 정보를 보내면 좋은지 안내합니다.',
    category: 'reference',
    lastUpdated: '2026-06-23',
    sections: [
      {
        id: 'before',
        title: '보내기 전에 확인할 것',
        bullets: [
          '사용 중인 운영체제와 쌤핀 버전',
          '문제가 생긴 화면',
          '누른 버튼과 에러 문구',
          '반복해서 재현되는지 여부',
        ],
      },
      {
        id: 'where',
        title: '보내는 곳',
        body: [
          '공식 사이트의 피드백 버튼이나 앱 안 도움말을 통해 문의를 보낼 수 있습니다. 설치 문제라면 보안 경고 화면 캡처를 함께 보내면 더 빠르게 확인할 수 있습니다.',
        ],
      },
    ],
    related: ['troubleshooting', 'faq'],
  },
];

export const docsBySlug = new Map(docsArticles.map((article) => [article.slug, article]));

export function getDocArticle(slug: string): DocArticle | undefined {
  return docsBySlug.get(slug);
}

export function getDocPath(slug: string): string {
  return `/docs/${slug}`;
}

export function getRelatedArticles(article: DocArticle): readonly DocArticle[] {
  return (article.related ?? [])
    .map((slug) => getDocArticle(slug))
    .filter((item): item is DocArticle => Boolean(item));
}

export function getDocsSearchText(article: DocArticle): string {
  const sectionText = article.sections
    .flatMap((section) => [
      section.title,
      ...(section.body ?? []),
      ...(section.steps ?? []),
      ...(section.bullets ?? []),
      section.callout?.title ?? '',
      section.callout?.body ?? '',
    ])
    .join(' ');

  return [article.title, article.description, article.category, sectionText].join(' ');
}
