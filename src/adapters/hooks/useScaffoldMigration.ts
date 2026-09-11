/**
 * 옛 「내 작성 방식」 → 「내 뼈대」 옮기기를 **한 번** 실행한다(ADR-103).
 *
 * ★왜 화면에서 부르는가: 옮기기는 설정 파일 하나를 고치는 일이라 앱이 뜨자마자 해도 되지만,
 *   결과를 **선생님에게 말해야** 한다(묶는 방식은 뜻이 그대로 가지 않는다). 말할 자리가 있는
 *   화면, 곧 근거 정리·초안 화면이 열릴 때 부르는 것이 옳다.
 * ★두 번 부르지 않는다: `recordScaffoldMigratedAt` 이 찍히면 그 뒤로는 아무 일도 하지 않는다.
 *   설정 저장이 실패하면 시각도 안 찍히므로 다음에 다시 시도한다(조용히 잃지 않는다).
 */
import { useEffect, useRef, useState } from 'react';

import { migrateStylesToScaffolds } from '@domain/rules/scaffoldMigration';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';

export interface ScaffoldMigrationNotice {
  /** 선생님에게 한 번 보여 줄 문장들. 비어 있으면 보여 줄 것이 없다. */
  readonly notices: readonly string[];
  /** 읽었다고 닫기. */
  readonly dismiss: () => void;
}

export function useScaffoldMigration(enabled = true): ScaffoldMigrationNotice {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const [notices, setNotices] = useState<readonly string[]>([]);
  // ★React 18 은 개발 모드에서 효과를 두 번 부른다. 설정 저장은 비동기라 두 번째 호출이
  //   첫 번째의 저장을 기다리지 않는다 — 같은 뼈대가 두 벌 생긴다. 참조로 막는다.
  const startedRef = useRef(false);

  useEffect(() => {
    if (!enabled || startedRef.current) return;
    if (settings.recordScaffoldMigratedAt !== undefined) return;
    startedRef.current = true;

    const now = Date.now();
    const result = migrateStylesToScaffolds({
      ...(settings.recordStylePresets !== undefined
        ? { presets: settings.recordStylePresets }
        : {}),
      ...(settings.recordWritingStyles !== undefined
        ? { styles: settings.recordWritingStyles }
        : {}),
      ...(settings.recordScaffolds !== undefined ? { scaffolds: settings.recordScaffolds } : {}),
      now,
    });
    if (!result.changed) return;

    void update({
      recordScaffolds: result.scaffolds,
      ...(Object.keys(result.areaScaffolds).length > 0
        ? {
            recordAreaScaffolds: {
              ...(settings.recordAreaScaffolds ?? {}),
              ...result.areaScaffolds,
            },
          }
        : {}),
      recordScaffoldMigratedAt: now,
    })
      .then(() => {
        if (result.notices.length > 0) setNotices(result.notices);
      })
      .catch(() => {
        // 저장이 안 됐으면 시각도 안 찍혔다. 다음에 이 화면을 열 때 다시 시도한다.
        startedRef.current = false;
      });
  }, [enabled, settings, update]);

  return { notices, dismiss: () => setNotices([]) };
}
