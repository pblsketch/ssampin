import { Clock } from '@adapters/components/Dashboard/Clock';
import { WeatherBar } from '@adapters/components/Dashboard/WeatherBar';
import { MessageBanner } from '@adapters/components/Dashboard/MessageBanner';
import { triggerRefreshAll } from '../hooks/useWidgetRefresh';
import { useTimetableChangeCheck } from '../hooks/useTimetableChangeCheck';

interface DashboardHeaderProps {
  onOpenWidgetPanel: () => void;
  onOpenStylePanel: () => void;
}

/**
 * 대시보드 헤더
 * - 시계/날씨/메시지 배너 (기존 그대로)
 * - 우측 상단: 새로고침 + 📋 위젯 관리 + 🎨 스타일 버튼
 *
 * 새로고침은 위젯 창 헤더의 같은 버튼과 동작을 맞춘다 — 카드 다시 그리기 + 시간표 변동 확인.
 * 여기는 메인 창이라 토스트가 있으므로 silent 를 끄고 확인 함수의 안내를 그대로 쓴다
 * (위젯 창은 토스트 표시기가 없어 배너로 대신한다).
 */
export function DashboardHeader({ onOpenWidgetPanel, onOpenStylePanel }: DashboardHeaderProps) {
  const { state: checkState, check: checkTimetableChange } = useTimetableChangeCheck({
    silent: false,
  });
  // 확인은 네트워크를 타므로 누른 자리에서 바로 진행 표시를 준다.
  // (결과 안내는 화면 오른쪽 아래 토스트라, 버튼 근처에 아무 변화가 없으면
  //  클릭이 먹었는지 알 수 없다는 사용자 피드백 — 2026-08-12)
  const checking = checkState.kind === 'checking';

  return (
    /*
      두 덩어리를 **항상 같은 줄에** 양끝으로 둔다 (2026-08-18, 준일님 지시).

      왼쪽 = 날짜·날씨, 오른쪽 = 배너 + 아이콘 3개. 오른쪽 덩어리만 세로로 쌓는다.

      여기까지 오는 데 두 번 헛짚었다. ①처음엔 좁아지면 전체를 위아래로 쌓게 했더니
      오른쪽이 통째로 비어 보였고, ②그 다음 한 줄을 `justify-between` 으로 벌렸더니
      **아이콘 사이가 화면 폭만큼 벌어졌다**(양끝 정렬은 묶음이 둘일 때 쓰는 것인데,
      배너 하나와 아이콘 셋이라 아이콘까지 낱개로 흩어진 것이다).

      좁은 창 대응은 **쌓기가 아니라 줄이기**로 한다 — 날씨는 습도를 접고(WeatherBar),
      버튼은 글자를 감춰 아이콘만 남기며(아래 `hidden xl:inline`), 배너는 폭 상한을 낮춘다.
      그래야 두 덩어리가 계속 같은 줄에 마주 볼 수 있다.
    */
    <header className="mb-8 flex items-start justify-between gap-6">
      <div className="min-w-0">
        <Clock />
        <WeatherBar />
      </div>

      {/* 오른쪽 덩어리 — 배너가 위, 아이콘 묶음이 그 아래. 오른쪽 끝에 맞춰 붙인다.
          아이콘은 따로 감싸 서로 붙여 둔다(gap-1) — 낱개로 흩어지지 않게 하는 것이 핵심이다. */}
      <div className="flex shrink-0 flex-col items-end gap-2">
        <MessageBanner />

        <div className="flex items-center gap-1">
          {/* 새로고침 버튼 */}
          <button
            onClick={() => {
              triggerRefreshAll();
              // 사용자가 직접 누른 순간에만 컴시간·압핀 변동을 확인한다.
              // (자동 새로고침 경로인 useWidgetRefresh 에는 절대 넣지 말 것 — 5분 폴링이 된다)
              checkTimetableChange();
            }}
            disabled={checking}
            className="shrink-0 rounded-lg p-2 text-sp-muted hover:text-sp-text hover:bg-sp-card transition-colors disabled:opacity-60"
            title={
              checking
                ? '시간표 변동을 확인하는 중…'
                : '모든 위젯 새로고침 (시간표 변동도 함께 확인)'
            }
          >
            <svg
              className={checking ? 'animate-spin' : undefined}
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 2v6h-6" />
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              <path d="M3 22v-6h6" />
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            </svg>
          </button>

          {/* 위젯 관리 버튼 */}
          <button
            onClick={onOpenWidgetPanel}
            className="shrink-0 rounded-lg px-3 py-2 transition-colors flex items-center gap-1.5 text-sm font-medium text-sp-muted hover:text-sp-text hover:bg-sp-card"
            title="위젯 구성 관리"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span className="hidden xl:inline">위젯 관리</span>
          </button>

          {/* 스타일 버튼 */}
          <button
            onClick={onOpenStylePanel}
            className="shrink-0 rounded-lg px-3 py-2 transition-colors flex items-center gap-1.5 text-sm font-medium text-sp-muted hover:text-sp-text hover:bg-sp-card"
            title="대시보드 스타일 편집"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
              <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
              <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
              <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
            </svg>
            <span className="hidden xl:inline">스타일</span>
          </button>
        </div>
      </div>
    </header>
  );
}
