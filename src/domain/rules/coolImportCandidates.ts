/**
 * "등록 후보 쪽지" 를 가려내는 규칙 (순수 함수).
 *
 * ## 무엇을 세는가
 * **날짜가 들어 있고, 아직 안 가져간 쪽지.**
 *
 * 그냥 "안 가져간 쪽지"를 세면 인사말·공지·잡담까지 다 들어가 47건 같은 숫자가 나온다.
 * 그건 알림이 아니라 소음이다. 실제로 일정·할일로 만들 만한 것만 센다.
 *
 * ## "안 읽은 쪽지"를 쓰지 않는 이유
 * `IsUnRead` 는 **쿨메신저가 관리하는 값**이다. 선생님은 보통 쪽지가 오면 쿨메신저에서
 * 바로 읽으므로 금방 꺼진다. 그런데 "일정에 넣어야겠다"는 생각은 **읽고 난 다음**에 든다.
 * 신호로 쓰면 정확히 반대로 동작한다.
 *
 * @see docs/01-plan/features/coolmessenger-import.plan.md
 */
import type { CoolImportHistory, CoolMessage } from '@domain/entities/CoolMessage';
import { extractCoolEvents } from '@domain/rules/coolMessageDateParser';
import { importKey, importedKeySet } from '@domain/rules/coolImportHistory';

/** 아직 가져가지 않은 날짜 후보가 남은 쪽지 */
export interface CoolCandidateMessage {
  readonly messageKey: number;
  readonly title: string;
  readonly sender: string;
  /** 이 쪽지에서 아직 안 가져간 날짜 후보 수 */
  readonly remaining: number;
}

/**
 * 등록 후보 쪽지를 고른다.
 *
 * 한 후보를 일정·할일 **양쪽 다** 가져갔을 때만 "끝난 것"으로 본다.
 * 일정으로만 넣고 할일로는 안 넣었다면 아직 할 일이 남았다고 보는 게 자연스럽다 —
 * 고 볼 수도 있지만, 그러면 영원히 안 사라진다. **한 번이라도 가져갔으면 끝난 것으로 친다.**
 */
export function findCoolImportCandidates(
  messages: readonly CoolMessage[],
  history: CoolImportHistory,
): CoolCandidateMessage[] {
  const imported = importedKeySet(history);
  const out: CoolCandidateMessage[] = [];

  for (const m of messages) {
    const base = new Date(m.receivedAt);
    if (Number.isNaN(base.getTime())) continue;

    const events = extractCoolEvents(`${m.title}\n${m.body}`, base);
    if (events.length === 0) continue;

    let remaining = 0;
    for (const ev of events) {
      const at = ev.start.toISOString();
      const taken =
        imported.has(importKey(m.key, at, 'event')) || imported.has(importKey(m.key, at, 'todo'));
      if (!taken) remaining += 1;
    }
    if (remaining > 0) {
      out.push({ messageKey: m.key, title: m.title, sender: m.sender, remaining });
    }
  }
  return out;
}

/** 알림에 쓸 쪽지 수 (후보 수가 아니라 **쪽지 수**다 — "쪽지 3건"이 읽기 쉽다) */
export function countCoolImportCandidates(
  messages: readonly CoolMessage[],
  history: CoolImportHistory,
): number {
  return findCoolImportCandidates(messages, history).length;
}
