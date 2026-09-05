/**
 * "내 AI" 모델 목록을 서버에서 받아 온다 — **새 모델이 나와도 앱을 새로 내지 않게**.
 *
 * ★왜 서버인가(2026-09-05 실측): 두 CLI 모두 "쓸 수 있는 모델"을 알려 주는 명령이 없다.
 *   claude 는 없는 모델에 "이 버전의 model catalog 에 없다"고만 하고, codex 는 서버가
 *   400 으로 거절한다. 그래서 앱에 적어 두면 새 모델이 나올 때마다 배포해야 한다.
 *
 * ★못 받아 오면 **앱에 든 기본값으로 계속 간다.** 생기부 규정과 다른 점이다 —
 *   규정은 없으면 멈춰야 하지만(잘못된 초안이 나가므로), 모델 목록은 없다고 멈출 이유가 없다.
 *
 * ★디스크에 쓰지 않는다. 앱을 끄면 사라지고 다음에 다시 받는다.
 */
import { OWN_AI_MODELS } from '@domain/rules/ownAiCliRules';
import type { OwnAiModelOption, OwnAiProviderId } from '@domain/entities/OwnAiProvider';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const ENDPOINT = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/ssampin-ai-models` : '';

/** 목록 하나 받자고 오래 기다리지 않는다 — 기본값이 이미 있다. */
const TIMEOUT_MS = 6_000;

export type ModelCatalog = Readonly<Record<OwnAiProviderId, readonly OwnAiModelOption[]>>;

interface Cached {
  readonly catalog: ModelCatalog;
  readonly expiresAt: number;
}

let cached: Cached | null = null;

/** 서버가 준 값이 쓸 만한 모양인지 본다. 한 칸이라도 어긋나면 통째로 버린다. */
function toCatalog(raw: unknown): ModelCatalog | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== 'object') return null;

  const read = (provider: OwnAiProviderId): OwnAiModelOption[] | null => {
    const list = r[provider];
    if (!Array.isArray(list) || list.length === 0) return null;
    const options: OwnAiModelOption[] = [];
    for (const item of list) {
      const m = item as { id?: unknown; label?: unknown };
      if (typeof m?.id !== 'string' || typeof m?.label !== 'string') return null;
      if (m.label.trim().length === 0) return null;
      options.push({ id: m.id, label: m.label });
    }
    return options;
  };

  const claude = read('claude');
  const codex = read('codex');
  if (!claude || !codex) return null;
  return { claude, codex };
}

/**
 * 지금 쓸 목록. **항상 값을 준다** — 서버가 죽어 있어도 기본값이 나온다.
 *
 * 화면은 이 함수를 부르고 결과를 그대로 그리면 된다. 실패를 화면에 알릴 필요가 없다.
 */
export async function fetchModelCatalog(installId: string): Promise<ModelCatalog> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.catalog;
  if (!ENDPOINT || !SUPABASE_ANON_KEY) return OWN_AI_MODELS;

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ installId }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return OWN_AI_MODELS;

    const body = (await res.json()) as { catalog?: unknown; ttlSec?: unknown };
    const catalog = toCatalog(body.catalog);
    if (!catalog) return OWN_AI_MODELS;

    const ttlSec = typeof body.ttlSec === 'number' && body.ttlSec > 0 ? body.ttlSec : 21_600;
    cached = { catalog, expiresAt: now + ttlSec * 1000 };
    return catalog;
  } catch {
    // 끊겼거나 느리거나 형식이 어긋났다 — 어느 쪽이든 기본값으로 간다.
    return OWN_AI_MODELS;
  }
}
