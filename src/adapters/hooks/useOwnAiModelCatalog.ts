/**
 * 화면이 쓸 모델 목록.
 *
 * 서버에서 받아 오되 **처음부터 값이 있다** — 받아오는 동안에도 기본값을 돌려주므로
 * 드롭다운이 비어 보이는 순간이 없다. 받아오면 조용히 최신 목록으로 바뀐다.
 *
 * ★adapters 는 infrastructure 를 직접 import 하지 않는다(아키텍처 규칙) — DI 컨테이너를 거친다.
 */
import { useEffect, useState } from 'react';

import { fetchModelCatalog, type ModelCatalog } from '@adapters/di/container';
import { OWN_AI_MODELS } from '@domain/rules/ownAiCliRules';
import { useAssistStore } from '@adapters/stores/useAssistStore';

export function useOwnAiModelCatalog(active: boolean): ModelCatalog {
  const installId = useAssistStore((s) => s.installId);
  const [catalog, setCatalog] = useState<ModelCatalog>(OWN_AI_MODELS);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    void fetchModelCatalog(installId).then((c) => {
      // 화면이 사라진 뒤 setState 하면 경고가 뜬다 — 살아 있을 때만 반영한다.
      if (alive) setCatalog(c);
    });
    return () => {
      alive = false;
    };
  }, [active, installId]);

  return catalog;
}
