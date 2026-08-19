import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '쌤핀 개인정보처리방침',
  description:
    '쌤핀(SsamPin) 앱의 개인정보처리방침입니다. Google Calendar, Drive(앱 데이터 백업), Tasks 연동에 관한 정보 수집 및 처리 기준을 안내합니다.',
  robots: {
    index: false,
    follow: false,
  },
};

const CONTACT_EMAIL = 'pblsketch@gmail.com';

const koContent = {
  lang: 'ko',
  title: '개인정보처리방침',
  subtitle: '쌤핀 (SsamPin)',
  lastUpdated: '최종 수정일: 2026년 8월 14일',
  switchLang: 'View in English',
  switchHref: '?lang=en',
  sections: [
    {
      number: '1',
      title: '처리하는 정보',
      content: (
        <>
          <p>
            <strong>가. 교사가 쌤핀에 입력하는 학생·학급 정보</strong> — 아래 정보는 교사가 직무
            목적으로 직접 입력하며, <strong>원칙적으로 교사의 컴퓨터에만 저장</strong>됩니다. 다만
            교사가 과제 수합·설문·상담 예약·전자 서명 등 협업 기능을 사용하면 그 기능에 필요한
            항목은 클라우드에 저장됩니다(제11조). 모든 항목은{' '}
            <strong>입력하지 않아도 앱이 동작하는 선택 항목</strong>이며, 필요한 항목만 입력하시면
            됩니다.
          </p>
          <ul>
            <li>
              <strong>학생 기본 정보</strong> — 이름, 학번, 생년월일, 학생 연락처, 보호자
              연락처(최대 2인)와 관계(아버지·어머니 등), 재적 상태(재학·전출·유예 등)와 사유 메모
            </li>
            <li>
              <strong>출결 기록</strong> — 날짜, 교시, 출결 구분(결석·지각·조퇴·결과), 사유, 증빙
              서류 제출 여부, NEIS 반영 여부
            </li>
            <li>
              <strong>관찰·상담 기록</strong> — 분류, 기록 내용, 날짜, 상담 방법, 후속 조치 내용
            </li>
            <li>
              <strong>학급 운영 자료</strong> — 시간표, 자리 배치, 진도, 과제 제출 현황,
              설문·체크리스트 응답, 평가 기록
            </li>
            <li>
              <strong>학생 사진</strong> — 교사가 NEIS에서 내려받은 사진 명렬표를 앱에 넣은 경우에
              한해, 학생 얼굴 사진을 학생별로 저장합니다(이름 외우기 학습용). 저장 시 긴 변
              320픽셀로 축소합니다. 넣지 않으면 사진은 전혀 수집되지 않으며, 설정 → 백업/복원에서{' '}
              <strong>언제든 전부 삭제</strong>할 수 있습니다. 학생에게 보이는 화면(학생용
              페이지·바탕화면 위젯)에는 표시되지 않습니다.
            </li>
          </ul>
          <p>
            <strong>보유 기간:</strong> 교사가 앱에서 삭제하거나 앱을 제거할 때까지 보유하며, 학년도
            마무리 기능을 실행하면 보관함으로 이동합니다. 삭제 시 해당 JSON 파일에서 즉시
            지워집니다.
          </p>
          <p>
            <strong>학생 사진의 보유 기간은 다릅니다.</strong> 학생을 명단에서 삭제하면 그 학생의
            사진도 함께 즉시 삭제되고, 설정 → 백업/복원에서 전체를 언제든 삭제할 수 있습니다. 다만
            <strong> 학년도 마무리 기능은 사진을 보관함으로 옮기지 않습니다</strong> — 학년이
            바뀌어도 사진은 그대로 남으므로, 더 필요하지 않으면 직접 삭제해 주세요.
          </p>
          <p className="mt-4">
            <strong>나. Google 연동 시 처리하는 정보</strong> — 사용자가{' '}
            <strong>Google 연동 기능을 명시적으로 활성화한 경우에 한해</strong> 다음 정보를
            처리합니다. 연동 기능을 사용하지 않는 경우 아래 정보는 일절 처리되지 않습니다.
          </p>
          <ul>
            <li>
              <strong>Google 계정 이메일 주소</strong> — 연결된 계정 식별용
            </li>
            <li>
              <strong>Google Calendar 일정 데이터</strong>(캘린더 연동 시) — 제목, 날짜, 시간, 장소
            </li>
            <li>
              <strong>쌤핀 앱 데이터 백업 파일</strong>(앱 데이터 백업 활성 시) —
              시간표·좌석·메모·할 일 등 사용자가 쌤핀 안에서 생성한 데이터를 JSON 형태로 Google
              Drive의 <em>쌤핀 전용 폴더(appDataFolder)</em>에 저장. 이 폴더는 다른 Google 앱(Drive
              웹, Docs 등)에서 보이지 않습니다.
            </li>
            <li>
              <strong>학생 사진 백업</strong>(앱 데이터 백업 활성 시, 사진을 넣으신 경우에 한함) —
              학생 얼굴 사진이 선생님 Google Drive의 <strong>&quot;쌤핀 동기화&quot; 폴더</strong>에
              저장됩니다. 이 폴더는 <strong>Drive 웹·데스크톱 앱에서 보이는 일반 폴더</strong>
              이므로, 폴더를 공유하거나 계정을 다른 사람과 함께 쓰면 사진이 노출될 수 있습니다.
              백업을 켜지 않으면 사진은 선생님 컴퓨터를 벗어나지 않습니다. 설정 → 백업/복원의{' '}
              <em>학생 사진</em>에서 지우면 컴퓨터와 이 폴더에서 함께 삭제됩니다.
            </li>
            <li>
              <strong>Google Tasks 할 일 데이터</strong>(Tasks 연동 시) — 제목, 완료 상태, 마감일,
              메모(notes)
            </li>
          </ul>
        </>
      ),
    },
    {
      number: '2',
      title: '정보 사용 목적',
      content: (
        <>
          <p>처리하는 정보는 다음 목적으로만 사용됩니다:</p>
          <p>
            <strong>가. 학생·학급 정보 (제1조 가목)</strong>
          </p>
          <ul>
            <li>출결 확인·기록과 학교생활기록부 기재를 위한 자료 정리</li>
            <li>학생 관찰·상담 내용의 기록과 후속 지도</li>
            <li>학급 운영(시간표·자리 배치·진도·과제·평가) 관리</li>
            <li>보호자 상담 일정 조율과 가정 연락</li>
          </ul>
          <p>
            위 목적은 모두 <strong>교사의 학급 운영·학생 지도 직무 수행</strong>을 위한 것이며, 그
            밖의 목적으로는 사용하지 않습니다.
          </p>
          <p className="mt-4">
            <strong>나. Google 연동 정보 (제1조 나목)</strong>
          </p>
          <ul>
            <li>쌤핀 앱과 Google Calendar 간 일정 양방향 동기화</li>
            <li>
              여러 기기에서 같은 데이터를 사용할 수 있도록 쌤핀 앱 데이터를 Google Drive 전용 폴더에
              백업·복원
            </li>
            <li>쌤핀의 할 일을 Google Tasks와 양방향 동기화(모바일 Google Tasks 앱과의 연결)</li>
          </ul>
          <p>
            마케팅, 광고, 제3자 분석, 기계학습 모델 학습 등 연동 기능의 직접 목적 외에는 어떤
            경우에도 사용하지 않습니다.
          </p>
        </>
      ),
    },
    {
      number: '3',
      title: '정보 저장 방식',
      content: (
        <>
          <p>쌤핀은 서버리스(Serverless) 구조로 설계되었습니다:</p>
          <ul>
            <li>
              <strong>로컬 저장:</strong> 활성 사용 데이터는 원칙적으로 사용자의 PC(
              <code>userData/data/*.json</code>)에 저장됩니다. 협업 기능에서 학생·보호자와 주고받는
              자료는 예외이며, 그 범위는 제11조에 있습니다.
            </li>
            <li>
              <strong>쌤핀 개발자 서버 미보관:</strong> 쌤핀 개발자는 사용자 데이터를 저장·처리하는
              별도 서버를 운영하지 않습니다.
            </li>
            <li>
              <strong>Google Drive appDataFolder:</strong> &quot;앱 데이터 백업&quot; 기능을
              활성화하면 쌤핀 데이터의 사본이 Google Drive의 앱 전용 숨김 폴더에 저장됩니다. 이
              폴더는 사용자의 Google Drive 저장 공간을 사용하지만 일반 Drive 인터페이스에서는 접근할
              수 없고, 오직 쌤핀 앱만이 접근합니다.
            </li>
            <li>
              <strong>암호화 저장:</strong> OAuth 인증 토큰은 Windows DPAPI(Electron safeStorage)를
              통해 OS 키체인에 암호화하여 저장합니다.
            </li>
            <li>
              <strong>직접 통신:</strong> 앱은 Google Calendar API, Google Drive API, Google Tasks
              API와 사용자의 PC에서 직접 통신하며, 중간 서버를 거치지 않습니다.
            </li>
            <li>
              <strong>전송 보안:</strong> Google API와의 모든 통신은 HTTPS(TLS)를 통해 암호화되어
              전송됩니다.
            </li>
          </ul>
        </>
      ),
    },
    {
      number: '4',
      title: '데이터 보존 및 삭제',
      content: (
        <>
          <ul>
            <li>
              쌤핀은 각 Google 연동 기능이 활성화된 동안에만 관련 데이터를 보존합니다. 사용자가
              연동을 해제하거나 앱을 삭제하면 해당 데이터는 즉시 삭제됩니다.
            </li>
            <li>
              <strong>Google 계정 연결 해제:</strong> 설정 &gt; Google 연동 탭에서 &quot;연결
              해제&quot;를 누르면 OAuth 토큰과 Google에서 가져온 일정·할 일이 로컬에서 즉시
              제거됩니다. 로컬에서 생성한 시간표·메모·할 일 등은 그대로 유지됩니다.
            </li>
            <li>
              <strong>앱 데이터 백업 삭제:</strong> 백업 카드의 &quot;클라우드 데이터 전체
              삭제&quot; 버튼을 통해 Google Drive 앱 전용 폴더의 모든 백업 데이터를 즉시 영구 삭제할
              수 있습니다.
            </li>
            <li>
              <strong>Google Tasks 동기화 해제:</strong> Tasks 토글을 OFF로 전환하면 동기화가
              중단되지만, 이미 로컬에 저장된 할 일은 유지됩니다. 사용자가 쌤핀에서 할 일을
              삭제·아카이브하면 Google Tasks에서도 즉시 삭제됩니다.
            </li>
            <li>
              앱을 삭제하면 로컬에 저장된 모든 데이터(쌤핀 전용 JSON 파일)가 함께 삭제됩니다. Google
              Drive 백업 폴더의 사본은 그대로 남으므로 원하시면 위 &quot;클라우드 데이터 전체
              삭제&quot; 기능을 먼저 실행해 주세요.
            </li>
            <li>
              Google 계정 설정에서{' '}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
              >
                앱 접근 권한
              </a>
              을 직접 해제할 수도 있습니다. 이 경우 다음 동기화 시도 시 쌤핀은 더 이상 해당 계정에
              접근할 수 없습니다.
            </li>
          </ul>
        </>
      ),
    },
    {
      number: '5',
      title: '제3자 제공',
      content: (
        <>
          <ul>
            <li>
              사용자 데이터를 제3자에게 판매하거나, 제3자가 자신의 목적으로 사용하도록 제공·공유하지
              않습니다.
            </li>
            <li>
              쌤핀은 Google Calendar·Drive·Tasks API와 직접 통신합니다. 또한 상담 예약·과제
              수합·전자 서명·설문 등 <strong>온라인 협업 기능</strong>을 사용할 때는, 그 기능 제공에
              필요한 범위에서 일부 데이터가 클라우드 백엔드(Supabase)로 전송·저장됩니다. 또한 앱 내
              AI 도우미에 질문하면 그 질문과 직전 대화가 답변 생성을 위해 주식회사 업스테이지·Google
              LLC로 전송됩니다. 이는 제3자 제공이 아니라 기능 제공을 위한 <strong>처리위탁</strong>
              이며, 자세한 내용은 제11조에 따릅니다. 제11조에 적힌 곳 외에 어떤 외부 서비스에도
              데이터를 전달하지 않습니다.
            </li>
            <li>사용자 데이터를 광고주, 데이터 브로커 또는 정보 재판매자에게 이전하지 않습니다.</li>
            <li>
              사용자 데이터를 광고 제공, 신용 평가, 대출 심사 등의 목적으로 사용하지 않습니다.
            </li>
            <li>
              사용자 데이터를 쌤핀을 포함한 어떤 기계학습(ML) 모델 학습에도 사용하지 않습니다.
            </li>
          </ul>
        </>
      ),
    },
    {
      number: '6',
      title: '요청하는 OAuth 스코프 상세',
      content: (
        <>
          <p>쌤핀이 Google 계정 연결 시 요청하는 스코프와 실제 사용 범위는 다음과 같습니다:</p>
          <ul>
            <li>
              <strong>
                <code>.../auth/userinfo.email</code>
              </strong>{' '}
              — 로그인한 Google 계정의 이메일 주소를 받아 설정 화면의 &quot;연결된 계정&quot;에
              표시하고, 재로그인 시 데이터 일관성(동일 계정 여부)을 확인합니다. 이름·프로필 사진 등
              다른 프로필 정보는 요청하지 않습니다.
            </li>
            <li>
              <strong>
                <code>.../auth/calendar</code>
              </strong>{' '}
              — 사용자가 선택한 Google 캘린더의 일정을 읽고 쓰기 위해 필요합니다. 선택하지 않은
              캘린더는 접근하지 않습니다.
            </li>
            <li>
              <strong>
                <code>.../auth/drive.file</code>
              </strong>{' '}
              — 쌤핀이 직접 만든 앱 전용 폴더(appDataFolder)의 파일만 접근합니다. 사용자의 다른
              Drive 파일(문서, 사진 등)에는 접근할 수 없습니다.
            </li>
            <li>
              <strong>
                <code>.../auth/tasks</code>
              </strong>{' '}
              — 사용자가 선택한 Google Task List의 할 일을 양방향으로 동기화하기 위해 필요합니다.
              Tasks 연동 활성화 시에만 별도 동의 후 사용합니다.
            </li>
          </ul>
          <p>
            쌤핀은 이 스코프를{' '}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy#limited-use"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google API Services User Data Policy의 Limited Use
            </a>{' '}
            원칙에 따라 사용하며, 위에 명시된 기능 제공 외 다른 목적으로는 사용하지 않습니다.
          </p>
        </>
      ),
    },
    {
      number: '7',
      title: '정보주체의 권리와 행사 방법',
      content: (
        <>
          <p>
            정보주체는 언제든지 개인정보의 <strong>열람·정정·삭제·처리정지</strong>를 요구할 수
            있습니다(개인정보 보호법 제35조~제37조).
          </p>
          <p>
            <strong>가. 앱 안에서 직접 하실 수 있는 것</strong>
          </p>
          <ul>
            <li>앱 내 설정 &gt; Google 연동 탭에서 계정 연결 해제 (모든 OAuth 토큰 즉시 삭제)</li>
            <li>앱 데이터 백업 토글 OFF 또는 &quot;클라우드 데이터 전체 삭제&quot; 실행</li>
            <li>Google Tasks 토글 OFF로 동기화 중단</li>
            <li>Google 계정 앱 권한 페이지에서 직접 접근 권한 철회</li>
            <li>학생·학급 정보는 앱 화면에서 직접 열람·수정·삭제 (제1조 가목)</li>
          </ul>
          <p>
            <strong>나. 학생·보호자의 권리 행사</strong> — 학생에 관한 정보는 교사가 소속 학교의
            직무 목적으로 처리하므로, 그 정보의 열람·정정·삭제·처리정지 요구는{' '}
            <strong>담당 교사 또는 소속 학교</strong>에 하시는 것이 가장 빠릅니다. 상담 예약·전자
            서명·설문 등 온라인 협업 기능에 남은 정보에 대해서는 아래 연락처로도 요구하실 수
            있습니다.
          </p>
          <p>
            <strong>다. 접수 창구와 처리 기한</strong>
          </p>
          <ul>
            <li>
              접수: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> (개인정보 보호책임자,
              제15조)
            </li>
            <li>
              처리 기한: 요구를 받은 날부터 <strong>10일 이내</strong>에 조치하고 결과를
              알려드립니다. 기간 내 처리가 어려우면 사유와 예상 기간을 먼저 통지합니다.
            </li>
            <li>
              법정대리인이나 위임을 받은 사람을 통해서도 요구하실 수 있습니다. 다른 법령에서 보존을
              의무화한 정보는 삭제·처리정지가 제한될 수 있으며, 이 경우 그 사유를 알려드립니다.
            </li>
          </ul>
        </>
      ),
    },
    {
      number: '8',
      title: '문의',
      content: (
        <>
          <p>개인정보 처리에 관한 문의는 아래로 연락해 주세요:</p>
          <ul>
            <li>
              이메일: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            </li>
          </ul>
        </>
      ),
    },
    {
      number: '9',
      title: 'Google API 서비스 사용자 데이터 정책 준수',
      content: (
        <>
          <p>
            쌤핀이 Google API를 통해 수신한 정보를 사용 및 다른 앱으로 전송하는 것은{' '}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google API 서비스 사용자 데이터 정책
            </a>
            (Limited Use 요구사항 포함)을 준수합니다.
          </p>
        </>
      ),
    },
    {
      number: '10',
      title: 'AI 브릿지 (외부 AI 연동)',
      content: (
        <>
          <p>
            쌤핀은 사용자가 <strong>AI 브릿지 기능을 명시적으로 연결한 경우에 한해</strong>, 내
            컴퓨터에 저장된 학생·자리·관찰 데이터를 외부 AI 도구(Claude, Codex/GPT,
            Antigravity/Gemini 등 MCP 클라이언트)와 연결합니다. 이 데이터는{' '}
            <strong>외부 서버를 거치지 않고</strong> 내 컴퓨터에서 외부 AI 도구로 직접 전달됩니다.
          </p>
          <ul>
            <li>
              외부 AI에 보내기 전에{' '}
              <strong>실명·연락처·생년월일 등 신원 정보는 불투명 토큰으로 치환</strong>됩니다. 단,
              토큰화만으로 완전한 익명이 보장되지는 않으며, 관찰 내용의 맥락으로 재식별될 수
              있습니다.
            </li>
            <li>
              <strong>
                관찰 내용 원문 노출(get_observations)과 쓰기(add_observation)는 기본적으로 비활성
              </strong>
              이며, 사용자가 게이트(또는 학생·기간·목적별 동의)를 명시적으로 켠 경우에만 동작합니다.
              켜진 경우, 관찰 내용 원문(민감 정보 포함 가능)이 외부 AI로 전달될 수 있습니다.
            </li>
            <li>
              연결한 외부 AI 도구에 전달된 데이터에는{' '}
              <strong>해당 제공자(Anthropic·OpenAI·Google 등)의 처리 정책</strong>이 적용됩니다.
              쌤핀은 외부 AI 제공자의 데이터 처리에 관여하지 않습니다.
            </li>
            <li>
              브릿지의 모든 접근은 로컬 감사 로그에 기록되며(원본 값은 기록하지 않음), 동의는 언제든
              철회할 수 있습니다.
            </li>
          </ul>
          <p>
            자세한 내용은{' '}
            <a href="/ai-bridge" target="_blank" rel="noopener noreferrer">
              AI 브릿지 안내 페이지
            </a>
            를 참고하세요.
          </p>
        </>
      ),
    },
    {
      number: '11',
      title: '처리위탁 (외부 서버를 사용하는 협업 기능)',
      content: (
        <>
          <p>
            쌤핀의 대부분 기능은 인터넷 없이 동작하며 데이터는 사용자 PC에만 저장됩니다. 다만
            학생·학부모와 온라인으로 주고받아야 하는 일부 <strong>협업 기능</strong>을 사용할 때는,
            해당 기능 제공에 필요한 범위에서 일부 데이터가 클라우드 백엔드(Supabase Inc.)로
            전송·저장됩니다. 이는 제3자에게 정보를 제공·판매하는 것이 아니라, 기능 제공을 위한{' '}
            <strong>처리위탁</strong>입니다. 아래 기능들은 교사가 명시적으로 사용할 때만 동작하며,
            사용하지 않으면 어떤 데이터도 전송되지 않습니다.
          </p>
          <ul>
            <li>
              <strong>상담 예약</strong> — 상담 일정과 대상 학급·학생 번호, 예약 시 학생 번호.
              예약자 연락처·메모는 사용자 단말에서 암호화한 뒤 전송·저장합니다.
            </li>
            <li>
              <strong>과제 수합</strong> — 과제 정보와 제출 현황(학생 이름·번호). 학생이 목록에서
              자기 이름을 골라 제출하는 방식이므로,{' '}
              <strong>교사가 과제를 만드는 시점에 대상 명단(이름·번호·학년·반)이 함께 저장</strong>
              되고 제출 링크를 받은 사람에게 표시됩니다. 제출물은 교사의 Google Drive 링크로
              보관되며, 교사 본인 확인은 Google 계정으로 처리합니다.
            </li>
            <li>
              <strong>전자 서명(서명받기)</strong> — 서명자 이름과 제출 항목, 서명 이미지(클라우드
              저장). 과제 수합과 마찬가지로 서명자가 목록에서 자기 이름을 고르는 방식이라,{' '}
              <strong>교사가 서명을 만드는 시점에 대상 명단(이름·소속)이 함께 저장</strong>되고 서명
              링크를 받은 사람에게 표시됩니다. 접속 IP·기기정보(User-Agent)는 원문이 아니라{' '}
              <strong>해시값</strong>으로만 저장합니다.
            </li>
            <li>
              <strong>설문·체크리스트</strong> — 학생 번호와 응답 내용.
            </li>
            <li>
              <strong>교실 화면 공유 수신 확인</strong> — 보드 식별자·접속 시각 등 기술 정보만
              오가며, 메모 내용은 전송되지 않습니다.
            </li>
            <li>
              <strong>Google 연동 토큰 보관</strong> — 교사 이메일과 암호화된 OAuth
              토큰(AES-256-GCM).
            </li>
            <li>
              <strong>AI 도우미(고객지원 챗봇)</strong> — 사용자가 <strong>직접 입력한 질문</strong>
              과 직전 대화 내용, 현재 보고 있는 화면 이름이 답변 생성을 위해 전송됩니다. 학생 명단,
              출결·관찰·상담 기록 등 앱에 저장된 자료는 <strong>전송되지 않습니다</strong>. 다만
              질문에 개인정보를 직접 적으면 그 내용도 함께 전송되므로, 질문에는 학생 이름·연락처
              등을 넣지 않는 것을 권장합니다.
            </li>
            <li>
              <strong>개발자 전달(버그 신고·건의사항)</strong> — 사이드바의 &quot;건의사항
              보내기&quot;나 AI 도우미의 신고 창으로 보내는 내용입니다. 작성하신 내용, 회신
              이메일(적으신 경우에만), 직전 대화 내용, <strong>첨부하신 스크린샷</strong>(최대
              3장)이 저장되고 개발자에게 이메일로 전달됩니다.{' '}
              <strong>
                AI 도우미가 오류·기능 요청으로 판단하면 신고 창을 띄우면서 그 질문과 직전 대화를
                먼저 기록합니다
              </strong>
              — 신고 창을 닫으셔도 그 기록은 남으며, 아래 연락처로 요청하시면 삭제해 드립니다.
              스크린샷에는 학생 이름이 찍힐 수 있으니 첨부 전에 확인해 주세요.
            </li>
          </ul>
          <p>
            <strong>위탁받는 자:</strong> Supabase Inc.(클라우드 인프라) · 주식회사 업스테이지(AI
            도우미 답변 생성) · Google LLC(AI 도우미 질문 검색 처리 및 예비 답변 생성).{' '}
            <strong>위탁 목적:</strong> 위 협업 기능과 AI 도우미 제공. <strong>보관·삭제:</strong>{' '}
            각 기능에서 자료를 삭제하거나 보관 기간(예: 실시간 링크 만료)이 지나면 삭제됩니다. AI
            도우미 대화는 답변 품질 개선을 위해 보관되며 요청 시 삭제합니다. 전송 구간은
            HTTPS(TLS)로 암호화됩니다.
          </p>
        </>
      ),
    },
    {
      number: '12',
      title: '만 14세 미만 아동의 개인정보 보호',
      content: (
        <>
          <p>
            쌤핀의 이용자는 <strong>교사 등 교육 종사자</strong>로 한정되며, 쌤핀 개발자는 만 14세
            미만 아동으로부터 직접 개인정보를 수집하지 않습니다. 학생에 관한 정보는 교사가 직무
            목적으로 입력·처리하는 것이며, 그 적법한 처리 책임은 이용약관 제3조에 따라 교사(및 소속
            학교·기관)에게 있습니다.
          </p>
          <ul>
            <li>
              출결·관찰·상담 기록 등 앱 본체의 학생 정보는 <strong>교사의 PC에만 로컬 저장</strong>
              되며, 개발자가 따로 수집하지 않습니다. 다만 아래 협업 기능을 사용할 때는 해당 자료가
              클라우드(수탁자)에 저장됩니다(제11조).
            </li>
            <li>
              상담 예약·설문·체크리스트 등 온라인 협업 기능에서는 학생을{' '}
              <strong>실명이 아닌 학생 번호</strong>로만 식별하며, 연락처·메모 등은 사용자 단말에서
              암호화한 뒤 전송합니다(제11조).
            </li>
            <li>
              <strong>과제 수합과 전자 서명은 기능 특성상 학생 이름이 포함</strong>되며, 그 이름은
              암호화되지 않은 형태로 클라우드에 저장됩니다(전자 서명은 서명 이미지도 함께). 두
              기능은 학생이 목록에서 자기 이름을 골라야 하므로{' '}
              <strong>
                제출한 학생뿐 아니라 대상 명단 전체가 저장되고, 링크를 받은 사람에게 보입니다.
              </strong>{' '}
              교사가 꼭 필요한 범위에서만 사용하고, 목적을 달성한 뒤에는 삭제하는 것을 원칙으로
              합니다.
            </li>
            <li>
              외부 AI로 데이터를 보내는 경우(제10조)에는 실명·연락처·생년월일 등 신원 정보를 불투명
              토큰으로 가명처리합니다.
            </li>
          </ul>
          <p>근거: 개인정보 보호법 제22조의2(만 14세 미만 아동의 개인정보 처리).</p>
        </>
      ),
    },
    {
      number: '13',
      title: '개인정보의 국외 이전',
      content: (
        <>
          <p>
            쌤핀의 일부 협업 기능과 Google 연동, 그리고 AI 도우미는 국외에 서버를 둔 사업자에게
            개인정보 처리를 위탁하며, 이 과정에서 개인정보가 국외로 이전될 수 있습니다. 교사가 해당
            기능을 사용하지 않으면 어떤 정보도 국외로 이전되지 않습니다.
          </p>
          <ul>
            <li>
              <strong>Supabase Inc.</strong> (미국) — 협업 기능(상담 예약·과제 수합·전자 서명·설문
              등) 데이터의 클라우드 저장·처리 (제11조)
            </li>
            <li>
              <strong>Vercel Inc.</strong> (미국) — 협업 기능이 사용하는 웹페이지 호스팅
            </li>
            <li>
              <strong>Google LLC</strong> (미국) — ①사용자가 Google 연동을 활성화한 경우
              캘린더·Drive 백업·Tasks 데이터 처리 (제1조·제6조) ②AI 도우미에 질문을 보낼 때, 관련
              도움말을 찾기 위한 질문 텍스트 처리 및 예비 답변 생성 (제11조)
            </li>
            <li>
              <strong>주식회사 업스테이지</strong> (대한민국 법인, 처리 인프라 미국) — AI 도우미에
              질문을 보낼 때의 답변 생성 (제11조). 업스테이지는 자사 개인정보처리방침에 따라 입력된
              대화 내용의 시스템 운영·데이터 보관을 Amazon Web Services·Microsoft Azure·Google(모두
              미국)에 재위탁하므로, 이 과정에서 정보가 국외로 이전될 수 있습니다.
            </li>
          </ul>
          <p>
            이전되는 항목·목적·보유 및 이용 기간은 제1조·제2조·제4조·제11조에 따르며, 전송 구간은
            HTTPS(TLS)로 암호화됩니다. 근거: 개인정보 보호법 제28조의8(개인정보의 국외 이전).
          </p>
        </>
      ),
    },
    {
      number: '14',
      title: '개인정보의 안전성 확보조치',
      content: (
        <>
          <p>
            쌤핀은 개인정보가 분실·도난·유출·위조·변조 또는 훼손되지 않도록 다음과 같은 조치를 하고
            있습니다. 근거: 개인정보 보호법 제29조(안전조치의무).
          </p>
          <p>
            <strong>가. 기술적 조치</strong>
          </p>
          <ul>
            <li>
              <strong>전송 구간 암호화</strong> — 모든 통신은 HTTPS(TLS)로 암호화하며, HTTP 접속은
              HTTPS로 강제 전환합니다(HSTS 적용).
            </li>
            <li>
              <strong>저장 시 암호화</strong> — Google OAuth 토큰은 OS 키체인(Windows DPAPI /
              Electron safeStorage)에, 클라우드에 보관되는 토큰은 AES-256-GCM으로 암호화합니다. 상담
              예약의 연락처·메모는 <strong>사용자 단말에서 암호화한 뒤</strong> 전송합니다.
            </li>
            <li>
              <strong>접근 통제</strong> — 클라우드 자료에는 행 수준 접근 제어(RLS)와{' '}
              <strong>컬럼 단위 권한</strong>을 적용합니다. 교사용 관리 키와 설문 PIN 해시는 공개
              요청으로 조회할 수 없고, 서명 이미지 보관함은 목록 조회를 차단합니다. 앱의 예약·응답
              조회는 <strong>해당 일정·설문의 관리 키를 확인하는 경로로만</strong> 동작합니다.
            </li>
            <li>
              <strong>식별정보 최소화</strong> — 전자 서명의 접속 IP와 기기정보(User-Agent)는 원문이
              아니라 해시값으로만 저장하고, 외부 AI로 보내는 데이터는 신원 정보를 불투명 토큰으로
              가명처리합니다(제10조).
            </li>
            <li>
              <strong>웹 보안 설정</strong> — 악성 스크립트 삽입(XSS)과 화면 가로채기(클릭재킹)를
              막기 위해 Content-Security-Policy, X-Frame-Options, X-Content-Type-Options,
              Referrer-Policy, Permissions-Policy 응답 헤더를 적용합니다.
            </li>
          </ul>
          <p>
            <strong>나. 관리적 조치</strong>
          </p>
          <ul>
            <li>
              개인정보를 취급하는 인원을 개발·운영자 1인(제15조 보호책임자)으로 최소화하고, 그 외
              누구에게도 접근 권한을 부여하지 않습니다.
            </li>
            <li>
              서버 전용 비밀키는 이용자 브라우저로 내려가는 코드에 포함하지 않고 서버에서만
              사용합니다.
            </li>
            <li>
              외부 보안 점검 도구로 응답 헤더·접근 통제·비밀키 노출·민감 파일 노출 여부를 점검하고,
              발견된 사항을 수정해 반영합니다.
            </li>
          </ul>
          <p>
            <strong>다. 물리적 조치</strong>
          </p>
          <ul>
            <li>
              쌤핀은 자체 물리 서버를 운영하지 않습니다. 학생·학급 정보의 원본은 교사가 관리하는
              컴퓨터에 있으며, 그 물리적 보안(잠금·계정 분리 등)은 교사와 소속 학교가 관리합니다.
            </li>
            <li>
              협업 기능이 사용하는 클라우드 설비의 물리적 보안은 해당 사업자(Supabase·Vercel·Google,
              제11조·제13조)의 데이터센터 보호 조치를 따릅니다.
            </li>
          </ul>
        </>
      ),
    },
    {
      number: '15',
      title: '개인정보 보호책임자',
      content: (
        <>
          <p>
            쌤핀은 개인정보 처리에 관한 업무를 총괄하고 정보주체의 문의·불만을 처리하기 위해 아래와
            같이 개인정보 보호책임자를 지정합니다.
          </p>
          <ul>
            <li>
              <strong>개인정보 보호책임자:</strong> 박준일 (쌤핀 개발·운영자)
            </li>
            <li>
              <strong>연락처:</strong> <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            </li>
          </ul>
          <p>정보주체는 개인정보 침해에 관한 상담·신고를 아래 기관에 하실 수 있습니다.</p>
          <ul>
            <li>개인정보침해신고센터 — privacy.kisa.or.kr / 국번 없이 118</li>
            <li>개인정보 분쟁조정위원회 — kopico.go.kr / 1833-6972</li>
            <li>대검찰청 사이버수사과 — spo.go.kr / 국번 없이 1301</li>
            <li>경찰청 사이버수사국 — cyberbureau.police.go.kr / 국번 없이 182</li>
          </ul>
        </>
      ),
    },
  ],
};

const enContent = {
  lang: 'en',
  title: 'Privacy Policy',
  subtitle: 'SsamPin',
  lastUpdated: 'Last updated: August 14, 2026',
  switchLang: '한국어로 보기',
  switchHref: '?lang=ko',
  sections: [
    {
      number: '1',
      title: 'Information We Process',
      content: (
        <>
          <p>
            <strong>A. Student and class information entered by the teacher</strong> — The
            information below is entered directly by the teacher for professional purposes and is{' '}
            <strong>as a rule stored only on the teacher&apos;s computer</strong>. However, if the
            teacher uses a collaboration feature (assignment collection, surveys, consultation
            booking, e-signature), the fields that feature needs are stored in the cloud (Section
            11). Every field is <strong>optional</strong> — the app works without them, so teachers
            enter only what they need.
          </p>
          <ul>
            <li>
              <strong>Basic student information</strong> — name, student number, date of birth,
              student contact number, up to two guardian contact numbers with their relationship
              (father, mother, etc.), and enrollment status (enrolled, transferred, on leave, etc.)
              with a reason note
            </li>
            <li>
              <strong>Attendance records</strong> — date, class period, attendance type (absence,
              late arrival, early leave, missed class), reason, whether supporting documents were
              submitted, and whether it was reported to NEIS
            </li>
            <li>
              <strong>Observation and counseling records</strong> — category, record content, date,
              counseling method, and follow-up actions
            </li>
            <li>
              <strong>Class management data</strong> — timetable, seating charts, curriculum
              progress, assignment submission status, survey/checklist responses, and assessment
              records
            </li>
          </ul>
          <p>
            <strong>Retention:</strong> retained until the teacher deletes it in the app or
            uninstalls the app; running the school-year wrap-up moves it to the archive. Deleting an
            item removes it from the corresponding JSON file immediately.
          </p>
          <p className="mt-4">
            <strong>B. Information processed through Google integrations</strong> — SsamPin
            processes the following{' '}
            <strong>only when you explicitly enable a specific Google integration feature</strong>.
            If you do not use any integration feature, none of the information below is processed.
          </p>
          <ul>
            <li>
              <strong>Google account email address</strong> — used to identify the connected account
            </li>
            <li>
              <strong>Google Calendar event data</strong> (when Calendar sync is enabled) — title,
              date, time, location
            </li>
            <li>
              <strong>SsamPin app-data backup files</strong> (when App-Data Backup is enabled) — a
              JSON copy of the timetable, seating, memos, to-dos, and other data you create inside
              SsamPin, stored in a <em>hidden app-specific folder (appDataFolder)</em> on your
              Google Drive. This folder is invisible to other Google apps (Drive web UI, Docs,
              etc.).
            </li>
            <li>
              <strong>Google Tasks data</strong> (when Tasks sync is enabled) — title, completion
              status, due date, notes
            </li>
          </ul>
        </>
      ),
    },
    {
      number: '2',
      title: 'How We Use Your Information',
      content: (
        <>
          <p>The information processed is used solely for the following purposes:</p>
          <p>
            <strong>A. Student and class information (Section 1.A)</strong>
          </p>
          <ul>
            <li>
              Checking and recording attendance, and organizing material for the official school
              record
            </li>
            <li>Recording student observations and counseling, and following up on them</li>
            <li>
              Managing class operations (timetable, seating, curriculum progress, assignments,
              assessment)
            </li>
            <li>Arranging guardian consultation schedules and contacting families</li>
          </ul>
          <p>
            All of the above serve the <strong>teacher&apos;s professional duties</strong> of class
            management and student guidance, and are not used for any other purpose.
          </p>
          <p className="mt-4">
            <strong>B. Google integration information (Section 1.B)</strong>
          </p>
          <ul>
            <li>Two-way synchronization of events between the SsamPin app and Google Calendar</li>
            <li>
              Backup and restoration of SsamPin app data to a dedicated Google Drive folder so you
              can use the same data across multiple devices
            </li>
            <li>
              Two-way synchronization of to-dos between SsamPin and Google Tasks (enabling use with
              the mobile Google Tasks app)
            </li>
          </ul>
          <p>
            Your information is never used for marketing, advertising, third-party analytics,
            machine-learning model training, or any purpose other than directly delivering the
            features above.
          </p>
        </>
      ),
    },
    {
      number: '3',
      title: 'How We Store Your Information',
      content: (
        <>
          <p>SsamPin is designed with a serverless architecture:</p>
          <ul>
            <li>
              <strong>Local storage by default:</strong> Active user data is, as a rule, stored on
              your PC (<code>userData/data/*.json</code>). Data exchanged with students and
              guardians through the collaboration features is the exception; its scope is set out in
              Section 11.
            </li>
            <li>
              <strong>No SsamPin developer servers:</strong> The SsamPin developer does not operate
              any server that stores or processes user data.
            </li>
            <li>
              <strong>Google Drive appDataFolder:</strong> When the &quot;App-Data Backup&quot;
              feature is enabled, a copy of your SsamPin data is stored in a hidden app-specific
              folder on your own Google Drive. This folder uses your Google Drive quota but is
              inaccessible via the regular Drive interface — only the SsamPin app can access it.
            </li>
            <li>
              <strong>Encrypted storage:</strong> OAuth tokens are encrypted and stored in the OS
              keychain using Windows DPAPI (Electron safeStorage).
            </li>
            <li>
              <strong>Direct communication:</strong> The app communicates directly with the Google
              Calendar, Drive, and Tasks APIs from your PC, without passing through any intermediate
              servers.
            </li>
            <li>
              <strong>Transit security:</strong> All communication with Google APIs is encrypted in
              transit via HTTPS (TLS).
            </li>
          </ul>
        </>
      ),
    },
    {
      number: '4',
      title: 'Data Retention and Deletion',
      content: (
        <>
          <ul>
            <li>
              SsamPin retains data only while each Google integration feature is active. Data is
              immediately deleted when you disconnect an integration or uninstall the app.
            </li>
            <li>
              <strong>Google account disconnect:</strong> Pressing &quot;Disconnect&quot; in
              Settings &gt; Google Integration removes OAuth tokens and all events/tasks imported
              from Google from local storage. Locally created timetables, memos, and to-dos are
              preserved.
            </li>
            <li>
              <strong>App-Data Backup deletion:</strong> The &quot;Delete all cloud data&quot;
              button in the Backup card permanently deletes all backup files stored in the Google
              Drive app-specific folder.
            </li>
            <li>
              <strong>Google Tasks sync off:</strong> Toggling Tasks off stops synchronization but
              preserves locally stored to-dos. When you delete or archive a to-do inside SsamPin,
              the corresponding item in Google Tasks is also deleted immediately.
            </li>
            <li>
              Uninstalling the app deletes all locally stored data (SsamPin&apos;s JSON files).
              Backup copies in the Google Drive app folder remain, so run &quot;Delete all cloud
              data&quot; beforehand if you want to remove them as well.
            </li>
            <li>
              You can also directly revoke the app&apos;s access from your{' '}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
              >
                Google Account permissions page
              </a>
              . SsamPin will no longer be able to access your account on the next sync attempt.
            </li>
          </ul>
        </>
      ),
    },
    {
      number: '5',
      title: 'Third-Party Disclosure',
      content: (
        <>
          <ul>
            <li>
              We do not sell your data, or provide or share it for any third party&apos;s own
              purposes.
            </li>
            <li>
              SsamPin communicates directly with the Google Calendar, Drive, and Tasks APIs. In
              addition, when you use <strong>online collaboration features</strong> (consultation
              booking, assignment collection, e-signature, surveys, etc.), some data is transmitted
              to and stored on a cloud backend (Supabase) as needed to provide those features. In
              addition, when you ask the in-app AI assistant a question, that question and the
              preceding conversation are sent to Upstage Inc. and Google LLC to generate an answer.
              This is a <strong>processing consignment</strong> for feature delivery, not
              third-party provision; see Section 11 for details. No data is sent to external
              services other than those listed in Section 11.
            </li>
            <li>
              We do not transfer user data to advertisers, data brokers, or information resellers.
            </li>
            <li>
              We do not use user data for serving advertisements, credit assessment, lending
              decisions, or any other purposes beyond the app&apos;s core functionality.
            </li>
            <li>
              We do not use user data to train any machine-learning (ML) model, including SsamPin
              itself.
            </li>
          </ul>
        </>
      ),
    },
    {
      number: '6',
      title: 'OAuth Scopes Requested',
      content: (
        <>
          <p>
            When you connect your Google account, SsamPin may request the following scopes and uses
            them only as described:
          </p>
          <ul>
            <li>
              <strong>
                <code>.../auth/userinfo.email</code>
              </strong>{' '}
              — retrieves the email address of the signed-in Google account to display it as the
              &quot;Connected Account&quot; in the Settings screen and to verify account consistency
              on re-login. Other profile information (name, picture, etc.) is not requested.
            </li>
            <li>
              <strong>
                <code>.../auth/calendar</code>
              </strong>{' '}
              — required to read and write events on the Google Calendars you select. Calendars you
              do not select are not accessed.
            </li>
            <li>
              <strong>
                <code>.../auth/drive.file</code>
              </strong>{' '}
              — accesses only the app-specific folder (appDataFolder) SsamPin creates. Your other
              Drive files (documents, photos, etc.) remain inaccessible to SsamPin.
            </li>
            <li>
              <strong>
                <code>.../auth/tasks</code>
              </strong>{' '}
              — required for two-way synchronization of to-dos with the Google Task List you select.
              Requested only after an additional consent dialog when you enable Tasks sync.
            </li>
          </ul>
          <p>
            SsamPin uses these scopes in accordance with the{' '}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy#limited-use"
              target="_blank"
              rel="noopener noreferrer"
            >
              Limited Use requirements of the Google API Services User Data Policy
            </a>
            , and does not use the data for any purpose other than delivering the features above.
          </p>
        </>
      ),
    },
    {
      number: '7',
      title: 'Data Subject Rights and How to Exercise Them',
      content: (
        <>
          <p>
            Data subjects may at any time request{' '}
            <strong>access, correction, deletion, or suspension of processing</strong> of their
            personal information (Articles 35–37 of the Personal Information Protection Act).
          </p>
          <p>
            <strong>A. What you can do inside the app</strong>
          </p>
          <ul>
            <li>
              Disconnect your Google account in Settings &gt; Google Integration (all OAuth tokens
              are deleted immediately)
            </li>
            <li>Turn off App-Data Backup or run &quot;Delete all cloud data&quot;</li>
            <li>Turn off Google Tasks to stop synchronization</li>
            <li>Revoke access directly from the Google Account app permissions page</li>
            <li>
              View, correct, and delete student and class information directly on the app screens
              (Section 1.A)
            </li>
          </ul>
          <p>
            <strong>B. Requests by students and guardians</strong> — Information about students is
            processed by teachers for the professional purposes of their school, so requests for
            access, correction, deletion, or suspension of processing are handled fastest by the{' '}
            <strong>teacher in charge or the school</strong>. For information held by the online
            collaboration features (consultation booking, e-signature, surveys), you may also
            contact us at the address below.
          </p>
          <p>
            <strong>C. Where to file and how long it takes</strong>
          </p>
          <ul>
            <li>
              Contact: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> (Personal Information
              Protection Officer, Section 15)
            </li>
            <li>
              Response time: we act on the request and notify you of the result{' '}
              <strong>within 10 days</strong> of receiving it. If we cannot meet that deadline, we
              notify you of the reason and the expected timeframe first.
            </li>
            <li>
              Requests may also be made through a legal representative or an authorized agent.
              Deletion or suspension may be restricted where other laws require retention; in that
              case we will explain the reason.
            </li>
          </ul>
        </>
      ),
    },
    {
      number: '8',
      title: 'Contact',
      content: (
        <>
          <p>For questions about our privacy practices, please contact us:</p>
          <ul>
            <li>
              Email: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            </li>
          </ul>
        </>
      ),
    },
    {
      number: '9',
      title: 'Google API Services User Data Policy Compliance',
      content: (
        <>
          <p>
            SsamPin&apos;s use and transfer of information received from Google APIs to any other
            app adheres to the{' '}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
        </>
      ),
    },
    {
      number: '10',
      title: 'AI Bridge (External AI Integration)',
      content: (
        <>
          <p>
            Only when you explicitly connect the AI Bridge feature, SsamPin connects the student,
            seating, and observation data stored on your computer with external AI tools (MCP
            clients such as Claude, Codex/GPT, Antigravity/Gemini). This data is passed directly
            from your computer to the external AI tool{' '}
            <strong>without going through any intermediate server</strong>.
          </p>
          <ul>
            <li>
              Before being sent to an external AI, identifying information such as real names,
              contact details, and dates of birth is <strong>replaced with opaque tokens</strong>.
              However, tokenization alone does not guarantee complete anonymity, and individuals may
              still be re-identified from the context of the observations.
            </li>
            <li>
              <strong>
                Exposing raw observation content (get_observations) and writing (add_observation)
                are disabled by default
              </strong>
              , and operate only when you explicitly turn on the corresponding gate (or per-student,
              per-period, per-purpose consent). When enabled, raw observation content (which may
              include sensitive information) may be sent to the external AI.
            </li>
            <li>
              Data passed to a connected external AI tool is subject to{' '}
              <strong>that provider&apos;s policies (Anthropic, OpenAI, Google, etc.)</strong>.
              SsamPin is not involved in the external AI provider&apos;s data processing.
            </li>
            <li>
              All bridge access is recorded in a local audit log (raw values are not recorded), and
              consent can be withdrawn at any time.
            </li>
          </ul>
          <p>
            For more details, see the{' '}
            <a href="/ai-bridge" target="_blank" rel="noopener noreferrer">
              AI Bridge information page
            </a>
            .
          </p>
        </>
      ),
    },
    {
      number: '11',
      title: 'Processing Consignment (Collaboration Features Using External Servers)',
      content: (
        <>
          <p>
            Most SsamPin features work offline, with data stored only on your PC. However, when you
            use certain <strong>collaboration features</strong> that must exchange information
            online with students and guardians, some data is transmitted to and stored on a cloud
            backend (Supabase Inc.) as needed to provide that feature. This is not the provision or
            sale of information to a third party, but a <strong>processing consignment</strong> for
            delivering the feature. These features operate only when a teacher explicitly uses them;
            if not used, no data is transmitted.
          </p>
          <ul>
            <li>
              <strong>Consultation booking</strong> — the schedule and target class/student numbers,
              and the student number at the time of booking. The booker&apos;s contact details and
              memo are encrypted on your device before transmission and storage.
            </li>
            <li>
              <strong>Assignment collection</strong> — assignment information and submission status
              (student name and number). Because students submit by picking their own name from a
              list,{' '}
              <strong>
                the target roster (name, number, grade, class) is stored when the teacher creates
                the assignment
              </strong>{' '}
              and is shown to anyone holding the submission link. Submissions are stored as links in
              the teacher&apos;s Google Drive. Teacher identity is verified via the Google account.
            </li>
            <li>
              <strong>E-signature</strong> — the signer&apos;s name, submitted fields, and the
              signature image (cloud storage). As with assignment collection, signers pick their own
              name from a list, so{' '}
              <strong>
                the target roster (name, affiliation) is stored when the teacher creates the
                signature request
              </strong>{' '}
              and is shown to anyone holding the signing link. Access IP and device information
              (User-Agent) are stored only as <strong>hashes</strong>, not in raw form.
            </li>
            <li>
              <strong>Surveys / checklists</strong> — student number and response content.
            </li>
            <li>
              <strong>Classroom screen-share delivery receipts</strong> — only technical information
              such as board identifiers and access timestamps; memo content is not transmitted.
            </li>
            <li>
              <strong>Google integration token storage</strong> — the teacher&apos;s email and
              encrypted OAuth tokens (AES-256-GCM).
            </li>
            <li>
              <strong>AI assistant (support chatbot)</strong> — the{' '}
              <strong>question you type</strong>, the immediately preceding conversation, and the
              name of the screen you are viewing are transmitted in order to generate an answer.
              Data stored in the app — student rosters, attendance, observation and counseling
              records — is <strong>not transmitted</strong>. However, personal information you type
              into the question itself is transmitted with it, so we recommend not including student
              names or contact details in your questions.
            </li>
            <li>
              <strong>Reports to the developer (bug reports and suggestions)</strong> — what you
              send via &quot;Send feedback&quot; in the sidebar or the report form in the AI
              assistant. The text you write, a reply email address (only if you provide one), the
              immediately preceding conversation, and <strong>any screenshots you attach</strong>{' '}
              (up to 3) are stored and emailed to the developer.{' '}
              <strong>
                When the AI assistant judges your message to be a bug or a feature request, it
                records that question and the preceding conversation at the moment it opens the
                report form
              </strong>{' '}
              — the record remains even if you close the form, and we will delete it on request via
              the contact below. Screenshots may capture student names, so please check before
              attaching.
            </li>
          </ul>
          <p>
            <strong>Consignees:</strong> Supabase Inc. (cloud infrastructure); Upstage Inc. (AI
            assistant answer generation); Google LLC (AI assistant question retrieval and fallback
            answer generation). <strong>Purpose:</strong> providing the collaboration features above
            and the AI assistant. <strong>Retention/Deletion:</strong> data is deleted when you
            remove it within each feature or when its retention period (e.g., real-time link expiry)
            passes. AI assistant conversations are retained to improve answer quality and are
            deleted on request. Data in transit is encrypted via HTTPS (TLS).
          </p>
        </>
      ),
    },
    {
      number: '12',
      title: 'Protection of Children Under 14',
      content: (
        <>
          <p>
            SsamPin&apos;s users are limited to{' '}
            <strong>teachers and other education professionals</strong>, and the SsamPin developer
            does not collect personal information directly from children under the age of 14.
            Information about students is entered and processed by teachers for work purposes;
            responsibility for its lawful processing rests with the teacher (and their
            school/institution) under Section 3 of the Terms.
          </p>
          <ul>
            <li>
              Student information is Student information held by the app itself (attendance,
              observation and counseling records) is{' '}
              <strong>stored only on the teacher&apos;s PC</strong> and is not separately collected
              by the developer. However, when the collaboration features below are used, that data
              is stored with our cloud consignee (Section 11).
            </li>
            <li>
              In online collaboration features (consultation booking, surveys, checklists), students
              are identified <strong>only by student number, not by real name</strong>, and contact
              details or memos are encrypted on the user&apos;s device before transmission (Section
              11).
            </li>
            <li>
              <strong>
                Assignment collection and e-signature do, by their nature, include a student&apos;s
                name
              </strong>
              , and that name is stored in the cloud unencrypted (for e-signature, together with the
              signature image). Because both features require a student to pick their own name from
              a list,{' '}
              <strong>
                the entire target roster — not only those who submitted — is stored and shown to
                anyone holding the link.
              </strong>{' '}
              Teachers are expected to use these features only to the extent necessary and to delete
              the data once the purpose is fulfilled.
            </li>
            <li>
              When data is sent to an external AI (Section 10), identifying information such as
              names, contact details, and dates of birth is pseudonymized with opaque tokens.
            </li>
          </ul>
          <p>
            Basis: Article 22-2 of the Personal Information Protection Act (processing of personal
            information of children under 14).
          </p>
        </>
      ),
    },
    {
      number: '13',
      title: 'Overseas Transfer of Personal Information',
      content: (
        <>
          <p>
            Some of SsamPin&apos;s collaboration features, Google integrations, and the AI assistant
            consign personal information processing to companies whose servers are located overseas,
            and personal information may be transferred abroad in the process. If a teacher does not
            use these features, no information is transferred overseas.
          </p>
          <ul>
            <li>
              <strong>Supabase Inc.</strong> (USA) — cloud storage and processing of collaboration
              feature data (consultation booking, assignment collection, e-signature, surveys, etc.;
              Section 11)
            </li>
            <li>
              <strong>Vercel Inc.</strong> (USA) — hosting of the web pages used by collaboration
              features
            </li>
            <li>
              <strong>Google LLC</strong> (USA) — (i) processing of Calendar, Drive backup, and
              Tasks data when you enable Google integration (Sections 1 and 6); (ii) processing of
              your question text to retrieve relevant help articles, and fallback answer generation,
              when you use the AI assistant (Section 11)
            </li>
            <li>
              <strong>Upstage Inc.</strong> (a Korean company; processing infrastructure in the USA)
              — answer generation when you use the AI assistant (Section 11). Under its own privacy
              policy, Upstage sub-consigns system operation and data storage of submitted
              conversations to Amazon Web Services, Microsoft Azure, and Google (all in the USA), so
              information may be transferred abroad in that process.
            </li>
          </ul>
          <p>
            The items, purposes, and retention/use periods of the transferred data follow Sections
            1, 2, 4, and 11, and data in transit is encrypted via HTTPS (TLS). Basis: Article 28-8
            of the Personal Information Protection Act (overseas transfer of personal information).
          </p>
        </>
      ),
    },
    {
      number: '14',
      title: 'Security Measures for Personal Information',
      content: (
        <>
          <p>
            SsamPin takes the following measures to prevent personal information from being lost,
            stolen, leaked, forged, altered, or damaged. Basis: Article 29 of the Personal
            Information Protection Act (duty to take security measures).
          </p>
          <p>
            <strong>A. Technical measures</strong>
          </p>
          <ul>
            <li>
              <strong>Encryption in transit</strong> — all communication is encrypted with HTTPS
              (TLS), and HTTP requests are forced to HTTPS (HSTS applied).
            </li>
            <li>
              <strong>Encryption at rest</strong> — Google OAuth tokens are stored in the OS
              keychain (Windows DPAPI / Electron safeStorage), and tokens kept in the cloud are
              encrypted with AES-256-GCM. Contact details and memos in consultation booking are{' '}
              <strong>encrypted on your device before transmission</strong>.
            </li>
            <li>
              <strong>Access control</strong> — cloud data is protected by row-level security (RLS)
              and <strong>column-level privileges</strong>. Teacher admin keys and survey PIN hashes
              cannot be read by public requests, and listing of the signature-image bucket is
              blocked. The app reads bookings and survey responses{' '}
              <strong>only through a path that verifies the admin key</strong> of that schedule or
              survey.
            </li>
            <li>
              <strong>Minimizing identifiers</strong> — the access IP and device information
              (User-Agent) for e-signatures are stored only as hashes, and identifying information
              sent to external AI tools is pseudonymized with opaque tokens (Section 10).
            </li>
            <li>
              <strong>Web security headers</strong> — Content-Security-Policy, X-Frame-Options,
              X-Content-Type-Options, Referrer-Policy, and Permissions-Policy response headers are
              applied to block script injection (XSS) and clickjacking.
            </li>
          </ul>
          <p>
            <strong>B. Administrative measures</strong>
          </p>
          <ul>
            <li>
              The number of people handling personal information is kept to one — the
              developer/operator (Protection Officer, Section 15) — and no one else is granted
              access.
            </li>
            <li>
              Server-only secret keys are never included in the code delivered to users&apos;
              browsers and are used only on the server.
            </li>
            <li>
              External security scanning tools are used to check response headers, access control,
              secret exposure, and sensitive file exposure, and findings are fixed and deployed.
            </li>
          </ul>
          <p>
            <strong>C. Physical measures</strong>
          </p>
          <ul>
            <li>
              SsamPin operates no physical servers of its own. The original student and class
              information resides on the computer the teacher manages, and its physical security
              (screen lock, separate accounts, etc.) is managed by the teacher and their school.
            </li>
            <li>
              Physical security of the cloud infrastructure used by the collaboration features
              follows the data-center protections of the respective providers (Supabase, Vercel,
              Google; Sections 11 and 13).
            </li>
          </ul>
        </>
      ),
    },
    {
      number: '15',
      title: 'Personal Information Protection Officer',
      content: (
        <>
          <p>
            SsamPin designates the following Personal Information Protection Officer to oversee
            personal information processing and to handle inquiries and complaints from data
            subjects.
          </p>
          <ul>
            <li>
              <strong>Protection Officer:</strong> Junil Park (SsamPin developer/operator)
            </li>
            <li>
              <strong>Contact:</strong> <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            </li>
          </ul>
          <p>
            Data subjects may direct inquiries or reports about privacy infringement to the
            following Korean authorities:
          </p>
          <ul>
            <li>Privacy Infringement Report Center — privacy.kisa.or.kr / 118</li>
            <li>Personal Information Dispute Mediation Committee — kopico.go.kr / 1833-6972</li>
            <li>Supreme Prosecutors&apos; Office Cybercrime Division — spo.go.kr / 1301</li>
            <li>National Police Agency Cyber Bureau — cyberbureau.police.go.kr / 182</li>
          </ul>
        </>
      ),
    },
  ],
};

interface PageProps {
  searchParams: Promise<{ lang?: string }>;
}

export default async function PrivacyPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const isEnglish = params.lang === 'en';
  const content = isEnglish ? enContent : koContent;

  return (
    <div className="min-h-screen bg-sp-bg text-sp-text">
      {/* Header */}
      <header className="border-b border-sp-border bg-sp-surface/80 backdrop-blur-sm">
        <div className="mx-auto max-w-4xl px-6 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-sp-muted transition-colors hover:text-sp-text"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
            <span className="text-sm">{isEnglish ? 'Back to Home' : '홈으로'}</span>
          </Link>
          <a
            href={content.switchHref}
            className="rounded-md border border-sp-border px-3 py-1.5 text-xs text-sp-muted transition-colors hover:border-sp-accent/50 hover:text-sp-text"
          >
            {content.switchLang}
          </a>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-4xl px-6 py-12">
        {/* Title section */}
        <div className="mb-10">
          <p className="mb-2 text-sm font-medium text-sp-accent">{content.subtitle}</p>
          <h1 className="mb-3 text-3xl font-bold text-sp-text md:text-4xl">{content.title}</h1>
          <p className="text-sm text-sp-muted">{content.lastUpdated}</p>
        </div>

        {/* Intro notice */}
        <div className="mb-10 rounded-xl border border-sp-accent/20 bg-sp-accent/5 p-5">
          <div className="flex items-start gap-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mt-0.5 shrink-0 text-sp-accent"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
            <p className="text-sm leading-relaxed text-sp-muted">
              {isEnglish
                ? 'SsamPin does not operate its own server for storing user data, and all active data is stored on your PC by default. However, when you use Google integrations (Calendar, Drive backup, Tasks) or certain online collaboration features (consultation booking, assignment collection, e-signature, surveys, etc.), some data is transmitted to external services as needed to provide those features. See Sections 3, 5, and 11 below for details.'
                : '쌤핀은 사용자 데이터를 저장하는 자체 서버를 운영하지 않으며, 모든 활성 데이터는 기본적으로 사용자 PC에 저장됩니다. 다만 Google 연동(캘린더·Drive 백업·Tasks)과 일부 온라인 협업 기능(상담 예약·과제 수합·전자 서명·설문 등)을 사용할 때는, 그 기능 제공에 필요한 범위에서 일부 데이터가 외부 서비스로 전송됩니다. 자세한 내용은 아래 제3조·제5조·제11조를 참고하세요.'}
            </p>
          </div>
        </div>

        {/* Sections */}
        <div className="space-y-8">
          {content.sections.map((section) => (
            <section
              key={section.number}
              className="rounded-xl border border-sp-border bg-sp-card p-6 shadow-sm"
            >
              <h2 className="mb-4 flex items-center gap-3 text-lg font-bold text-sp-text">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sp-accent/15 text-sm font-bold text-sp-accent">
                  {section.number}
                </span>
                {section.title}
              </h2>
              <div className="prose-privacy text-sm leading-relaxed text-sp-muted">
                {section.content}
              </div>
            </section>
          ))}
        </div>

        {/* Footer note */}
        <div className="mt-10 text-center text-xs text-sp-muted/70">
          <p>
            {isEnglish
              ? 'This privacy policy may be updated. Changes will be posted on this page with an updated revision date.'
              : '본 개인정보처리방침은 변경될 수 있습니다. 변경 시 이 페이지를 통해 고지하며, 최종 수정일이 업데이트됩니다.'}
          </p>
        </div>
      </main>

      {/* Inline styles for prose-privacy */}
      <style>{`
        .prose-privacy p {
          margin-bottom: 0.75rem;
          line-height: 1.7;
        }
        .prose-privacy ul {
          margin: 0.5rem 0 0.75rem 0;
          padding-left: 1.25rem;
          list-style-type: disc;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .prose-privacy li {
          line-height: 1.6;
        }
        .prose-privacy strong {
          color: var(--color-sp-text);
          font-weight: 600;
        }
        .prose-privacy code {
          background: rgba(107, 99, 88, 0.12);
          padding: 0.1rem 0.35rem;
          border-radius: 0.25rem;
          font-size: 0.85em;
          color: var(--color-sp-text);
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        }
        .prose-privacy a {
          color: var(--color-sp-accent);
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .prose-privacy a:hover {
          color: var(--color-sp-accent-hover);
        }
        .prose-privacy p:last-child,
        .prose-privacy ul:last-child {
          margin-bottom: 0;
        }
      `}</style>
    </div>
  );
}
