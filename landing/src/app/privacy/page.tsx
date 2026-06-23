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
  lastUpdated: '최종 수정일: 2026년 6월 24일',
  switchLang: 'View in English',
  switchHref: '?lang=en',
  sections: [
    {
      number: '1',
      title: '수집하는 정보',
      content: (
        <>
          <p>
            쌤핀은 사용자가 <strong>Google 연동 기능을 명시적으로 활성화한 경우에 한해</strong> 다음
            정보를 수집합니다. 연동 기능을 사용하지 않는 경우, 어떠한 개인정보도 수집하지 않습니다.
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
          <p>수집된 정보는 다음 목적으로만 사용됩니다:</p>
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
              <strong>로컬 저장:</strong> 모든 활성 사용 데이터는 사용자의 PC(
              <code>userData/data/*.json</code>)에만 저장됩니다.
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
              필요한 범위에서 일부 데이터가 클라우드 백엔드(Supabase)로 전송·저장됩니다. 이는 제3자
              제공이 아니라 기능 제공을 위한 <strong>처리위탁</strong>이며, 자세한 내용은 제11조에
              따릅니다. 그 외 어떤 외부 서비스에도 데이터를 전달하지 않습니다.
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
      title: '사용자 권리',
      content: (
        <>
          <p>사용자는 언제든지 다음 권리를 행사할 수 있습니다:</p>
          <ul>
            <li>앱 내 설정 &gt; Google 연동 탭에서 계정 연결 해제 (모든 OAuth 토큰 즉시 삭제)</li>
            <li>앱 데이터 백업 토글 OFF 또는 &quot;클라우드 데이터 전체 삭제&quot; 실행</li>
            <li>Google Tasks 토글 OFF로 동기화 중단</li>
            <li>Google 계정 앱 권한 페이지에서 직접 접근 권한 철회</li>
            <li>
              개인정보 처리 현황에 관한 열람·수정·삭제 요청:{' '}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
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
              <strong>과제 수합</strong> — 과제 정보와 제출 현황(학생 이름·번호). 제출물은 교사의
              Google Drive 링크로 보관되며, 교사 본인 확인은 Google 계정으로 처리합니다.
            </li>
            <li>
              <strong>전자 서명(서명받기)</strong> — 서명자 이름과 제출 항목, 서명 이미지(클라우드
              저장). 접속 IP·기기정보(User-Agent)는 원문이 아니라 <strong>해시값</strong>으로만
              저장합니다.
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
          </ul>
          <p>
            <strong>위탁받는 자:</strong> Supabase Inc.(클라우드 인프라).{' '}
            <strong>위탁 목적:</strong> 위 협업 기능 제공. <strong>보관·삭제:</strong> 각 기능에서
            자료를 삭제하거나 보관 기간(예: 실시간 링크 만료)이 지나면 삭제됩니다. 전송 구간은
            HTTPS(TLS)로 암호화됩니다.
          </p>
        </>
      ),
    },
  ],
};

const enContent = {
  lang: 'en',
  title: 'Privacy Policy',
  subtitle: 'SsamPin',
  lastUpdated: 'Last updated: June 24, 2026',
  switchLang: '한국어로 보기',
  switchHref: '?lang=ko',
  sections: [
    {
      number: '1',
      title: 'Information We Collect',
      content: (
        <>
          <p>
            SsamPin collects the following information{' '}
            <strong>only when you explicitly enable a specific Google integration feature</strong>.
            If you do not use any integration feature, no personal information is collected.
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
          <p>The collected information is used solely for the following purposes:</p>
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
              <strong>Local storage only:</strong> All active user data is stored exclusively on
              your PC (<code>userData/data/*.json</code>).
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
              to and stored on a cloud backend (Supabase) as needed to provide those features. This
              is a <strong>processing consignment</strong> for feature delivery, not third-party
              provision; see Section 11 for details. No data is sent to any other external services.
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
      title: 'Your Rights',
      content: (
        <>
          <p>You may exercise the following rights at any time:</p>
          <ul>
            <li>
              Disconnect your Google account in Settings &gt; Google Integration (all OAuth tokens
              are deleted immediately)
            </li>
            <li>Turn off App-Data Backup or run &quot;Delete all cloud data&quot;</li>
            <li>Turn off Google Tasks to stop synchronization</li>
            <li>Revoke access directly from the Google Account app permissions page</li>
            <li>
              Request access, correction, or deletion of personal data processing:{' '}
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
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
              (student name and number); submissions are stored as links in the teacher&apos;s
              Google Drive. Teacher identity is verified via the Google account.
            </li>
            <li>
              <strong>E-signature</strong> — the signer&apos;s name, submitted fields, and the
              signature image (cloud storage). Access IP and device information (User-Agent) are
              stored only as <strong>hashes</strong>, not in raw form.
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
          </ul>
          <p>
            <strong>Consignee:</strong> Supabase Inc. (cloud infrastructure).{' '}
            <strong>Purpose:</strong> providing the collaboration features above.{' '}
            <strong>Retention/Deletion:</strong> data is deleted when you remove it within each
            feature or when its retention period (e.g., real-time link expiry) passes. Data in
            transit is encrypted via HTTPS (TLS).
          </p>
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
