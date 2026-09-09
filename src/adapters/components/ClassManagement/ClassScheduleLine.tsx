import type { ClassScheduleLabel } from '@adapters/presenters/classSchedulePresenter';

/**
 * 학급 목록 한 칸의 세 번째 줄 — "이 반은 평소 언제 수업하나".
 *
 * ## 왜 색 대신 점선인가
 *
 * 교실 이름만 맞아서 찾은 날(2단계)이나 우리 반 시간표로 추정한 날(3단계)은 **틀린 게 아니라 덜
 * 확실한** 것이다. 색으로 구분하면 빨강은 오류처럼, 노랑은 경고처럼 읽히고 테마 3종에서 대비도
 * 보장하기 어렵다. 진도 화면(`ExcludedDaysPanel`)이 이미 같은 뜻을 점선으로 쓰고 있어 그 표현을
 * 그대로 따른다 — 같은 개념에 시각 언어를 두 개 만들지 않는다.
 *
 * ## 왜 행 전체 폭을 쓰나
 *
 * 이름·과목과 같은 칸에 두면 학생 수 배지와 폭을 나눠 갖는다. 선택된 행은 확인 아이콘까지 붙어
 * 224px 패널에서 `수3 · 금5`가 잘렸다(실렌더로 확인). **지금 보고 있는 반에서만 정보가 사라지는**
 * 최악의 형태라, 배지 아래 빈 자리까지 쓰도록 행 맨 아래로 내렸다. 행 높이는 그대로다.
 *
 * `ml-[22px]`는 앞의 색 점(`w-2.5` = 10px) + 그 뒤 간격(`gap-3` = 12px)이다. 이름·과목 글자와
 * 같은 세로선에서 시작하게 맞춘 값이라 둘 중 하나가 바뀌면 여기도 같이 바뀌어야 한다.
 *
 * ## 화면 낭독기
 *
 * `title`은 마우스 사용자에게만 닿는다. 그래서 덜 확실한 경우의 안내 문구는 `sr-only`로 한 번 더
 * 읽어 준다. 아이콘은 정보가 텍스트에 이미 있으므로 낭독에서 뺀다.
 */
export function ClassScheduleLine({ schedule }: { readonly schedule: ClassScheduleLabel }) {
  return (
    <p className="mt-1 ml-[22px] flex items-center gap-1 text-sp-muted" title={schedule.fullText}>
      <span aria-hidden="true" className="material-symbols-outlined text-icon-xs shrink-0">
        schedule
      </span>
      <span
        className={`min-w-0 truncate text-caption tabular-nums ${
          schedule.uncertain ? 'border-b border-dashed border-sp-border' : ''
        }`}
      >
        {schedule.label}
      </span>
      {schedule.confidenceNote !== undefined && (
        <span className="sr-only"> · {schedule.confidenceNote}</span>
      )}
    </p>
  );
}
