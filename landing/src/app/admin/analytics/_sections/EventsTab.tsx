// ── 이벤트 로그 탭 ──
// 지금 막 일어난 일을 그대로 본다. 다른 탭과 달리 캐시하지 않는다(loadEventLog).

import EventLog from '../EventLog';
import { Section } from '../_components/primitives';
import { Note } from '../_components/charts';
import { loadEventLog } from '../_lib/data';

export default async function EventsTab() {
  const events = await loadEventLog();

  return (
    <Section title="최근 이벤트 (최신 100건)">
      <Note>
        집계가 아니라 방금 들어온 기록을 그대로 보여줍니다. 다른 탭의 수치는 30분마다 갱신되는 미리
        계산 결과지만, 이 목록만은 항상 실시간입니다.
      </Note>
      <EventLog events={events} />
    </Section>
  );
}
