/**
 * 데모 쪽지함을 **실제 코드 경로**로 읽어, 앱 화면에 뜰 내용을 미리 찍어 본다.
 *
 * 앱을 띄우기 전에 "쪽지함 읽기 → 날짜 뽑기 → 개인정보 표시"가 실제로 도는지 확인하는 용도.
 * 화면 배선만 빼면 여기서 나오는 것이 곧 모달에 뜨는 것이다.
 *
 *   npx tsx scripts/check-cool-demo.mts
 */
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readCoolMessages, readCoolMemberNames } from '../electron/coolMessengerReader';
import {
  extractCoolEvents,
  stripCoolDateExpressions,
} from '../src/domain/rules/coolMessageDateParser';
import { detectCoolPii } from '../src/domain/privacy/coolMessagePii';

const DIR = join(tmpdir(), 'ssampin-cool-demo');

const WD = ['일', '월', '화', '수', '목', '금', '토'];
const fmt = (d: Date) =>
  `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]}) ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

const staff = readCoolMemberNames(DIR);
const roster = new Set(staff);
console.log(`교직원 명단 ${staff.length}명: ${staff.join(', ')}\n`);

const messages = readCoolMessages(DIR);
console.log(`쪽지 ${messages.length}건 (삭제된 것 제외되면 8건이 정상)\n`);
console.log('='.repeat(72));

for (const m of messages) {
  const base = new Date(m.receivedAt);
  const events = extractCoolEvents(`${m.title}\n${m.body}`, base);
  const pii = detectCoolPii(m.body, roster);

  console.log(`\n[${m.sender}] ${m.title}${m.isUnread ? '  (안읽음)' : ''}`);
  console.log(`  받은날: ${fmt(base)}`);
  console.log(`  제목안: "${stripCoolDateExpressions(m.title, base) || m.title}"`);

  if (events.length === 0) {
    console.log('  후보: 없음');
  } else {
    for (const ev of events) {
      const when = ev.allDay
        ? `${ev.start.getMonth() + 1}/${ev.start.getDate()}(${WD[ev.start.getDay()]}) 종일`
        : fmt(ev.start);
      const range = ev.end ? ` ~ ${ev.end.getMonth() + 1}/${ev.end.getDate()}` : '';
      console.log(`  후보: ${when}${range}  →  ${ev.isDeadline ? '할일' : '일정'}`);
    }
  }

  if (pii.length > 0) {
    console.log(`  개인정보 ${pii.length}곳: ${pii.map((p) => `${p.text}(${p.kind})`).join(', ')}`);
  }
}
console.log('\n' + '='.repeat(72));
