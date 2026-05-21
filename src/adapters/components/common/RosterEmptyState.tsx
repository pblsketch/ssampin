/**
 * RosterEmptyState.tsx
 *
 * 학생 명단(useStudentStore.students)이 비어 있을 때 학생 의존 화면 8곳에서
 * 본문 대신 노출되는 공용 빈 상태 카드.
 *
 * 디자인: docs/02-design/features/roster-sample-data-removal.design.md §2.2 — v1.1
 * - 10개 컨텍스트별로 아이콘·제목·본문·CTA 카피가 다르다 (Material Symbol)
 * - roster_management 컨텍스트만 Secondary CTA(직접 입력 시작) 추가
 * - bg-sp-card + ring-1 ring-sp-border + shadow-sp-sm + rounded-xl
 * - WCAG: role="region", aria-label, <h2>, focus-visible outline
 *
 * onNavigate 미제공 시 기본 동작은 `ssampin:navigate` 커스텀 이벤트로
 * 사이드바 라우팅을 통해 [담임 업무 → 명렬 관리]로 이동 (App.tsx 핸들러가
 * setCurrentPage('homeroom') 수행). 동일 페이지(homeroom) 안 다른 탭이라도
 * HomeroomPage가 mount되며 RosterManagementTab 진입 흐름을 안내한다.
 */

import type { ReactNode } from 'react';

/**
 * RosterEmptyState 카드가 렌더되는 화면 컨텍스트.
 * 화면별로 카피와 아이콘이 달라지며, roster_management만 Secondary CTA를 갖는다.
 */
export type RosterEmptyStateContext =
  | 'homeroom'
  | 'seating'
  | 'attendance'
  | 'assignment'
  | 'survey'
  | 'records'
  | 'consultation'
  | 'seat_picker'
  | 'grouping'
  | 'roster_management';

interface CopyEntry {
  readonly icon: string;
  readonly title: string;
  readonly body: string;
  readonly primaryCta: string;
}

/**
 * 컨텍스트별 카피 — Design §2.2 표 그대로.
 * 텍스트 변경 시 디자인 문서와 동시에 갱신할 것.
 */
const CONTEXT_COPY: Readonly<Record<RosterEmptyStateContext, CopyEntry>> = {
  homeroom: {
    icon: 'school',
    title: '우리 반 명단을 등록해 주세요',
    body: '학생 이름을 등록하면 담임 업무 전체를 한 곳에서 관리할 수 있어요.',
    primaryCta: '학생 명단 등록하기',
  },
  seating: {
    icon: 'table_restaurant',
    title: '명단이 있어야 자리를 배치할 수 있어요',
    body: '우리 반 학생을 먼저 등록하면 한 번에 자리를 배치하고 섞을 수 있어요.',
    primaryCta: '학생 명단 등록하기',
  },
  attendance: {
    icon: 'fact_check',
    title: '출결 기록을 시작하려면 명단이 필요해요',
    body: '학생을 먼저 등록해 주세요. 등록 후 날짜별로 출결을 기록할 수 있어요.',
    primaryCta: '학생 명단 등록하기',
  },
  assignment: {
    icon: 'assignment',
    title: '과제를 수합할 학생을 등록해 주세요',
    body: '학생이 없으면 과제 수합을 시작할 수 없어요. 명단을 등록하면 바로 시작할 수 있어요.',
    primaryCta: '학생 명단 등록하기',
  },
  survey: {
    icon: 'quiz',
    title: '설문을 보낼 학생을 등록해 주세요',
    body: '우리 반 명단을 등록하면 학생별로 응답을 확인할 수 있어요.',
    primaryCta: '학생 명단 등록하기',
  },
  records: {
    icon: 'menu_book',
    title: '학생 기록을 시작하기 전에 명단이 필요해요',
    body: '학생을 등록하면 개인별 상담·행동·성적 메모를 체계적으로 쌓을 수 있어요.',
    primaryCta: '학생 명단 등록하기',
  },
  consultation: {
    icon: 'chat',
    title: '상담 일정을 잡기 전에 명단을 등록해 주세요',
    body: '학생 명단이 있어야 상담 신청·예약·기록을 연결할 수 있어요.',
    primaryCta: '학생 명단 등록하기',
  },
  seat_picker: {
    icon: 'casino',
    title: '학생이 있어야 자리를 뽑을 수 있어요',
    body: '우리 반 명단을 등록하면 공정하게 자리를 정해드려요.',
    primaryCta: '학생 명단 등록하기',
  },
  grouping: {
    icon: 'groups',
    title: '모둠을 섞으려면 명단이 필요해요',
    body: '학생을 등록하면 원하는 모둠 수로 바로 나눌 수 있어요.',
    primaryCta: '학생 명단 등록하기',
  },
  roster_management: {
    icon: 'groups_add',
    title: '아직 학생이 없어요',
    body: '엑셀에서 이름을 복사해 붙여넣거나, 직접 한 명씩 입력할 수 있어요.',
    primaryCta: '엑셀에서 붙여넣기',
  },
};

/**
 * 컨텍스트별 aria-label (region 역할의 접근 가능한 이름).
 */
const CONTEXT_ARIA_LABEL: Readonly<Record<RosterEmptyStateContext, string>> = {
  homeroom: '담임 업무 시작 안내',
  seating: '자리배치 시작 안내',
  attendance: '출결 기록 시작 안내',
  assignment: '과제 수합 시작 안내',
  survey: '설문 시작 안내',
  records: '학생 기록 시작 안내',
  consultation: '상담 예약 시작 안내',
  seat_picker: '자리 뽑기 시작 안내',
  grouping: '모둠 셔플 시작 안내',
  roster_management: '명렬 관리 시작 안내',
};

export interface RosterEmptyStateProps {
  readonly context: RosterEmptyStateContext;
  /**
   * Primary CTA 클릭 시 호출되는 핸들러.
   * 미제공 시 `ssampin:navigate` 커스텀 이벤트로 'homeroom' 페이지로 이동한다.
   */
  readonly onNavigate?: () => void;
  /**
   * roster_management 컨텍스트일 때 Secondary CTA(직접 입력 시작) 핸들러.
   * 다른 컨텍스트에서는 무시된다.
   */
  readonly onSecondaryAction?: () => void;
}

/**
 * 기본 navigation: 'homeroom' 페이지로 이동 + 명렬 관리 탭 전환.
 * - `ssampin:navigate` 리스너(App.tsx)가 setCurrentPage('homeroom')을 호출한다.
 * - `ssampin:homeroom-open-tab` 리스너(HomeroomPage)가 setActiveTab('roster')을 호출한다.
 *   이미 homeroom 페이지에 있어도 두 번째 이벤트로 탭만 전환되어 사용자가 변화를 인지한다.
 */
function defaultNavigate(): void {
  window.dispatchEvent(new CustomEvent<string>('ssampin:navigate', { detail: 'homeroom' }));
  // HomeroomPage가 마운트된 다음 tick에 탭 전환 이벤트 발사.
  // (다른 페이지에서 진입 시 HomeroomPage 마운트 전에 이벤트 발사되는 race 회피)
  setTimeout(() => {
    window.dispatchEvent(
      new CustomEvent<string>('ssampin:homeroom-open-tab', { detail: 'roster' }),
    );
  }, 0);
}

export function RosterEmptyState({
  context,
  onNavigate,
  onSecondaryAction,
}: RosterEmptyStateProps): JSX.Element {
  const copy = CONTEXT_COPY[context];
  const ariaLabel = CONTEXT_ARIA_LABEL[context];
  const handlePrimary = onNavigate ?? defaultNavigate;
  const isRosterManagement = context === 'roster_management';

  return (
    <div
      role="region"
      aria-label={ariaLabel}
      className="bg-sp-card ring-1 ring-sp-border shadow-sp-sm rounded-xl px-8 py-10 flex flex-col items-center text-center gap-4 max-w-[26rem] mx-auto"
    >
      <div
        className="bg-sp-accent/10 rounded-xl p-3 flex items-center justify-center"
        aria-hidden="true"
      >
        <span className="material-symbols-outlined text-sp-accent" style={{ fontSize: '32px' }}>
          {copy.icon}
        </span>
      </div>

      <h2 className="text-base font-bold text-sp-text">{copy.title}</h2>
      <BodyText>{copy.body}</BodyText>

      <button
        type="button"
        onClick={handlePrimary}
        className="bg-sp-accent text-white rounded-lg px-5 py-2.5 text-sm font-medium hover:bg-sp-accent/90 transition-colors duration-150 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent focus-visible:outline-offset-2"
      >
        {copy.primaryCta}
      </button>

      {isRosterManagement && onSecondaryAction !== undefined && (
        <button
          type="button"
          onClick={onSecondaryAction}
          className="text-sm text-sp-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-sp-accent focus-visible:outline-offset-2 rounded"
        >
          직접 입력 시작
        </button>
      )}
    </div>
  );
}

function BodyText({ children }: { children: ReactNode }) {
  return <p className="text-sm text-sp-muted leading-relaxed">{children}</p>;
}
