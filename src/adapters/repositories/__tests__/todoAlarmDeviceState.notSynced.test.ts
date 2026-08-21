/**
 * 할 일 알람 켬/끔이 **동기화 대상이 아님**을 강제하는 메타 테스트.
 *
 * 이 규칙은 주석으로만 두면 반드시 깨진다 — 나중에 누군가 "알람 설정도 기기 간에
 * 맞춰지면 좋겠다"고 생각하고 `SYNC_REGISTRY` 에 한 줄 넣는 순간, 껐는데 되살아나는
 * 버그가 조용히 부활한다. 그러면 되돌리기 1순위 수단이 무력화된다(오너 결정 1).
 *
 * 선례: `driveSyncLastSyncedAtLocation.meta.test.ts` 가 같은 이유로 존재한다.
 */
import { describe, it, expect } from 'vitest';
import { SYNC_REGISTRY } from '@usecases/sync/syncRegistry';
import { TODO_ALARM_DEVICE_STATE_KEY } from '../todoAlarmDeviceState';

describe('todo-alarm-device-state 는 동기화하지 않는다', () => {
  it('SYNC_REGISTRY 에 등재되어 있지 않다', () => {
    const fileNames = SYNC_REGISTRY.map((d) => d.fileName);
    expect(fileNames).not.toContain(TODO_ALARM_DEVICE_STATE_KEY);
  });

  it('키 이름이 바뀌어도 검사가 무력해지지 않는다 — 상수를 그대로 쓴다', () => {
    expect(TODO_ALARM_DEVICE_STATE_KEY).toBe('todo-alarm-device-state');
  });

  it('참고: settings 는 동기화 대상이다 — 그래서 알람 켬/끔을 거기 두지 않았다', () => {
    expect(SYNC_REGISTRY.map((d) => d.fileName)).toContain('settings');
  });
});
