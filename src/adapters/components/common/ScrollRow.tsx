import { forwardRef, type HTMLAttributes } from 'react';

/**
 * ScrollRow — 좁은 창에서 찌그러지지 않고 좌우로 스크롤되는 가로 줄(툴바·탭·칩 그룹).
 *
 * 반응형 깨짐 패턴 A 해결용 공용 컴포넌트.
 * 기존에 `flex gap-2`로만 늘어놓은 버튼/탭 줄은 창을 좁히면 항목이 찌그러지고
 * 한글이 세로로 줄바꿈된다. ScrollRow는 항목의 자연 너비를 유지(`[&>*]:shrink-0`)한 채
 * 넘치면 가로 스크롤로 흘려 보낸다. 스크롤바는 `scrollbar-hide`로 시각적으로 숨긴다.
 *
 * - 정렬: 기본 `items-center`. (대부분의 툴바/탭 줄에 적합)
 * - 간격: 호출부에서 `className`에 `gap-2` 등으로 지정.
 * - 접근성: `role`, `aria-label` 등 div 속성을 그대로 전달(탭 줄은 `role="tablist"`).
 * - ref 전달 지원: 외부 클릭 감지 등 ref가 필요한 툴바에서 사용 가능.
 *
 * @example
 *   <ScrollRow className="gap-2 mb-4" role="tablist" aria-label="수업 관리 탭">
 *     {TABS.map((t) => <TabButton key={t.id} ... />)}
 *   </ScrollRow>
 */
export type ScrollRowProps = HTMLAttributes<HTMLDivElement>;

export const ScrollRow = forwardRef<HTMLDivElement, ScrollRowProps>(function ScrollRow(
  { className = '', children, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={`flex flex-nowrap items-center overflow-x-auto scrollbar-hide [&>*]:shrink-0 ${className}`.trim()}
      {...rest}
    >
      {children}
    </div>
  );
});
