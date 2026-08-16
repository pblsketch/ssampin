import { describe, expect, test, vi } from 'vitest';
import { createOwnedGlobalShortcutRegistry } from './ownedGlobalShortcutRegistry';

describe('설정 단축키 등록 소유권', () => {
  test('설정을 다시 적용해도 다른 기능의 글로벌 단축키는 해제하지 않는다', () => {
    const registered = new Set(['Ctrl+1', 'Escape']);
    const port = {
      register: vi.fn((accelerator: string) => {
        if (registered.has(accelerator)) return false;
        registered.add(accelerator);
        return true;
      }),
      unregister: vi.fn((accelerator: string) => registered.delete(accelerator)),
    };
    const registry = createOwnedGlobalShortcutRegistry(port);

    expect(registry.register('CommandOrControl+Alt+P', vi.fn())).toBe(true);
    registry.clear();

    expect([...registered]).toEqual(['Ctrl+1', 'Escape']);
    expect(port.unregister).toHaveBeenCalledTimes(1);
    expect(port.unregister).toHaveBeenCalledWith('CommandOrControl+Alt+P');
  });

  test('등록에 실패한 조합은 소유한 것으로 기록하지 않는다', () => {
    const port = {
      register: vi.fn(() => false),
      unregister: vi.fn(),
    };
    const registry = createOwnedGlobalShortcutRegistry(port);

    registry.register('CommandOrControl+Alt+P', vi.fn());
    registry.clear();

    expect(port.unregister).not.toHaveBeenCalled();
  });
});
