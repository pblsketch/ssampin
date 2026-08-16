export interface GlobalShortcutRegistrationPort {
  register(accelerator: string, callback: () => void): boolean;
  unregister(accelerator: string): void;
}

export interface OwnedGlobalShortcutRegistry {
  register(accelerator: string, callback: () => void): boolean;
  clear(): void;
}

/** 설정에서 만든 단축키만 추적해 위젯·모달 등 다른 전역 키를 보존한다. */
export function createOwnedGlobalShortcutRegistry(
  port: GlobalShortcutRegistrationPort,
): OwnedGlobalShortcutRegistry {
  const owned = new Set<string>();

  return {
    register(accelerator, callback) {
      const registered = port.register(accelerator, callback);
      if (registered) owned.add(accelerator);
      return registered;
    },
    clear() {
      for (const accelerator of owned) port.unregister(accelerator);
      owned.clear();
    },
  };
}
