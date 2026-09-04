/**
 * 생기부 초안을 **선생님 구독 AI**로 쓴다 (오너 결정 D4·D2·D8).
 *
 * ★쌤핀 AI(Solar)로는 만들지 않는다. 구독이 연결돼 있지 않으면 요청을 보내지 않고
 *   연결 경로만 안내한다 — 초안은 폴백하지 않는다.
 *
 * ★기재 금지 항목은 프롬프트가 아니라 **꾸러미를 만들 때** 뺀다(`recordDraftPack`, ADR-072).
 *   실측에서 프롬프트로는 안 막혔다. 안 보내면 못 쓴다.
 *
 * ★결과는 미리보기다. [반영]을 눌러야 저장된다.
 *
 * ★`RecordDraftView.tsx` 는 다른 세션이 작업 중이라 건드리지 않는다 — 이 컴포넌트를 그 화면에
 *   한 줄로 꽂는 일은 통합 단계(T6)에 요청한다.
 */
import { useCallback, useMemo, useState } from 'react';

import { useAssistStore } from '@adapters/stores/useAssistStore';
import { fetchRecordPromptL1 } from '@adapters/di/container';
import {
  useConnectedOwnAiProviders,
  useOwnAiStatusStore,
} from '@adapters/stores/useOwnAiStatusStore';
import { OWN_AI_ERROR_MESSAGES } from '@domain/rules/ownAiCliRules';
import {
  buildRecordDraftPack,
  summarizeExclusions,
  type DraftPackEvidence,
} from '@domain/services/recordDraftPack';
import type { OwnAiErrorKind, OwnAiRunEvent } from '@domain/entities/OwnAiProvider';

/** 한 학생분의 초안 재료. 화면(부모)이 이미 별칭 처리를 마친 값을 준다. */
export interface DraftTarget {
  /** 저장할 때 쓰는 학생 키. */
  readonly studentRef: string;
  /** 모델에게 보낼 **별칭**(실명 아님). */
  readonly studentAlias: string;
  /** 화면에 보여 줄 이름(모델에게는 안 나간다). */
  readonly displayName: string;
  readonly evidences: readonly DraftPackEvidence[];
  readonly standardKeywords?: readonly string[];
  /** 이미 초안이 있으면 "바꾸기 / 뒤에 붙이기"를 물어본다. */
  readonly existingText?: string;
}

export interface RecordDraftAiButtonProps {
  readonly areaLabel: string;
  readonly threadTitle?: string;
  /** 지금 카드의 학생. */
  readonly target: DraftTarget;
  /** "남은 학생 모두"에 쓸 나머지 — 아직 초안이 없는 학생만 부모가 골라 준다. */
  readonly remaining?: readonly DraftTarget[];
  /** 선생님이 따로 적어 둔 지시(2층 프롬프트). */
  readonly teacherPrompt?: string;
  /** [반영] — 실제 저장은 부모가 한다(기존 upsert 경로를 그대로 쓴다). */
  readonly onApply: (studentRef: string, text: string) => Promise<void> | void;
}

type Phase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'picking' }
  | {
      readonly kind: 'running';
      readonly done: number;
      readonly total: number;
      readonly name: string;
    }
  | {
      readonly kind: 'preview';
      readonly studentRef: string;
      readonly name: string;
      readonly text: string;
      readonly excluded: string;
      /** 이어서 처리할 학생들(남은 학생 모두). */
      readonly queue: readonly DraftTarget[];
    }
  | {
      readonly kind: 'stopped';
      readonly message: string;
      /** 한도·오류로 멈춘 자리. [이어 하기] 가 여기서 다시 시작한다. */
      readonly queue: readonly DraftTarget[];
    };

interface OwnAiRunApi {
  run(payload: {
    runId: string;
    provider: 'claude' | 'codex';
    kind: 'panel' | 'draft';
    prompt: string;
    appendSystemPrompt?: string;
  }): Promise<{ ok: boolean; reason?: string }>;
  onEvent(handler: (event: unknown) => void): () => void;
}

function runApi(): OwnAiRunApi | null {
  const api = (globalThis as { electronAPI?: { ownAi?: OwnAiRunApi } }).electronAPI?.ownAi;
  return api ?? null;
}

function newRunId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 모델이 쓴 별칭을 실제 이름으로 되돌린다.
 *
 * ★지우지 않고 **되돌린다.** 세특 본문에는 보통 이름을 쓰지 않지만, 모델이 "［이름1］은 …"
 * 처럼 주어로 썼을 때 통째로 지우면 문장이 부서진다. 이름으로 되돌려 놓으면 선생님이
 * 보고 지울 수 있다 — 부서진 문장은 무엇이 없어졌는지도 모른다.
 */
export function restoreAlias(text: string, alias: string, displayName: string): string {
  return alias.length > 0 ? text.split(alias).join(displayName) : text;
}

/** CLI 를 한 번 돌려 초안 한 편을 받는다. 실패하면 갈래를 담아 던진다. */
async function askOnce(
  api: OwnAiRunApi,
  provider: 'claude' | 'codex',
  prompt: string,
  appendSystemPrompt: string,
): Promise<string> {
  const runId = newRunId();
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const off = api.onEvent((raw) => {
      const ev = raw as OwnAiRunEvent;
      if (!ev || ev.runId !== runId) return;
      if (ev.type === 'done') {
        settled = true;
        off();
        resolve(ev.text);
      } else if (ev.type === 'error') {
        settled = true;
        off();
        reject(ev.kind);
      }
    });
    void api
      .run({ runId, provider, kind: 'draft', prompt, appendSystemPrompt })
      .then((r) => {
        if (!r.ok && !settled) {
          settled = true;
          off();
          reject('crashed' satisfies OwnAiErrorKind);
        }
      })
      .catch(() => {
        if (settled) return;
        settled = true;
        off();
        reject('crashed' satisfies OwnAiErrorKind);
      });
  });
}

export function RecordDraftAiButton({
  areaLabel,
  threadTitle,
  target,
  remaining = [],
  teacherPrompt,
  onApply,
}: RecordDraftAiButtonProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const ownAiEnabled = useAssistStore((s) => s.ownAiEnabled);
  const provider = useAssistStore((s) => s.provider);
  const connected = useConnectedOwnAiProviders();
  const setUsage = useOwnAiStatusStore((s) => s.setUsage);
  const installId = useAssistStore((s) => s.installId);

  /** 실제로 쓸 공급자 — 고른 것이 연결돼 있어야 한다. 아니면 연결된 첫 번째. */
  const runProvider = useMemo(() => {
    if (!ownAiEnabled || connected.length === 0) return null;
    if (provider !== 'ssampin' && connected.includes(provider)) return provider;
    return connected[0] ?? null;
  }, [ownAiEnabled, connected, provider]);

  const buildPrompt = useCallback(
    (t: DraftTarget) =>
      buildRecordDraftPack({
        studentAlias: t.studentAlias,
        areaLabel,
        ...(threadTitle === undefined ? {} : { threadTitle }),
        evidences: t.evidences,
        ...(t.standardKeywords === undefined ? {} : { standardKeywords: t.standardKeywords }),
        ...(teacherPrompt === undefined ? {} : { teacherPrompt }),
      }),
    [areaLabel, threadTitle, teacherPrompt],
  );

  /** 큐를 하나씩 처리한다. 첫 결과가 나오면 미리보기에서 멈춰 선생님 판단을 기다린다. */
  const runQueue = useCallback(
    async (queue: readonly DraftTarget[], startedWith: number) => {
      const api = runApi();
      if (!api || !runProvider) return;
      const total = startedWith;

      // ★규정(1층 프롬프트)을 먼저 받는다 — 없으면 초안을 만들지 않는다(D7).
      //   본문은 여기 지역 변수에만 있고, 디스크에 쓰지 않는다.
      const systemPrompt = await fetchRecordPromptL1(installId);
      if (systemPrompt === null) {
        setPhase({
          kind: 'stopped',
          message: OWN_AI_ERROR_MESSAGES['prompt-unavailable'].draft,
          queue,
        });
        return;
      }

      for (let i = 0; i < queue.length; i += 1) {
        const t = queue[i];
        if (!t) continue;
        setPhase({ kind: 'running', done: total - queue.length + i, total, name: t.displayName });
        const pack = buildPrompt(t);
        try {
          const text = await askOnce(api, runProvider, pack.text, systemPrompt);
          setPhase({
            kind: 'preview',
            studentRef: t.studentRef,
            name: t.displayName,
            text,
            excluded: summarizeExclusions(pack.exclusions),
            queue: queue.slice(i + 1),
          });
          return; // 미리보기에서 멈춘다 — [반영] 을 눌러야 다음으로 간다.
        } catch (kind) {
          const k = (typeof kind === 'string' ? kind : 'crashed') as OwnAiErrorKind;
          setPhase({
            kind: 'stopped',
            message: OWN_AI_ERROR_MESSAGES[k].draft,
            queue: queue.slice(i),
          });
          return;
        }
      }
      setPhase({ kind: 'idle' });
    },
    [buildPrompt, runProvider, installId],
  );

  const start = (targets: readonly DraftTarget[]): void => {
    setUsage(null, null);
    void runQueue(targets, targets.length);
  };

  const applyAndContinue = async (mode: 'replace' | 'append'): Promise<void> => {
    if (phase.kind !== 'preview') return;
    const base = target.studentRef === phase.studentRef ? (target.existingText ?? '') : '';
    // 별칭을 실제 이름으로 되돌린 뒤에 저장한다 — 초안에 ［이름1］ 이 남으면 안 된다.
    const restored = restoreAlias(phase.text, target.studentAlias, phase.name);
    const merged =
      mode === 'append' && base.trim().length > 0 ? `${base.trim()}\n${restored}` : restored;
    await onApply(phase.studentRef, merged);
    if (phase.queue.length > 0) void runQueue(phase.queue, phase.queue.length);
    else setPhase({ kind: 'idle' });
  };

  // ── 구독이 연결돼 있지 않을 때: 요청을 보내지 않고 안내만 한다 ──
  if (!runProvider) {
    return (
      <div className="mt-2">
        <button
          type="button"
          onClick={() => setPhase({ kind: 'stopped', message: '', queue: [] })}
          className="flex w-fit items-center gap-1 rounded-md bg-sp-card px-2 py-1 text-[0.6rem] font-medium text-sp-muted ring-1 ring-sp-border hover:bg-sp-surface"
        >
          <span className="material-symbols-outlined text-[0.75rem]">auto_awesome</span>
          AI로 초안 쓰기
        </button>
        {phase.kind === 'stopped' && (
          <p className="mt-1 rounded-md bg-sp-card px-2 py-1 text-[0.6rem] text-sp-muted">
            생기부 초안은 선생님 구독 AI(Claude Code·Codex)로만 만들 수 있어요. 설정 &gt; 실험실
            기능에서 &ldquo;내 AI로 실행&rdquo;을 켜고, 설정 &gt; AI 연결에서 연결해 주세요.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-1">
      {phase.kind === 'idle' && (
        <button
          type="button"
          onClick={() => setPhase({ kind: 'picking' })}
          className="flex w-fit items-center gap-1 rounded-md bg-sp-card px-2 py-1 text-[0.6rem] font-medium text-sp-accent ring-1 ring-sp-border hover:bg-sp-surface"
        >
          <span className="material-symbols-outlined text-[0.75rem]">auto_awesome</span>
          AI로 초안 쓰기
        </button>
      )}

      {phase.kind === 'picking' && (
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => start([target])}
            className="rounded-md bg-sp-accent px-2 py-1 text-[0.6rem] font-medium text-sp-accent-fg"
          >
            이 학생만
          </button>
          {remaining.length > 0 && (
            <button
              type="button"
              onClick={() => start([target, ...remaining])}
              className="rounded-md bg-sp-card px-2 py-1 text-[0.6rem] font-medium text-sp-text ring-1 ring-sp-border"
            >
              남은 학생 모두 ({remaining.length + 1}명)
            </button>
          )}
          <button
            type="button"
            onClick={() => setPhase({ kind: 'idle' })}
            className="px-1 text-[0.6rem] text-sp-muted"
          >
            그만두기
          </button>
        </div>
      )}

      {phase.kind === 'running' && (
        <p className="text-[0.6rem] text-sp-muted">
          {phase.total > 1 ? `${phase.done + 1}/${phase.total} · ` : ''}
          {phase.name} 초안을 쓰는 중이에요…
        </p>
      )}

      {phase.kind === 'preview' && (
        <div className="rounded-md border border-sp-border bg-sp-bg p-2">
          <p className="mb-1 text-[0.6rem] font-medium text-sp-text">
            {phase.name} — 미리보기
            {phase.excluded && <span className="ml-1 text-sp-muted">· {phase.excluded}</span>}
          </p>
          {/* ★"남은 학생 모두"로 이어 만드는 동안에는 **누른 행이 아닌 학생**의 초안이 여기
              뜬다. 이름만으로는 눈이 못 따라간다 — 어디에 저장되는지 한 줄로 못 박는다.
              이 줄이 없으면 다른 학생 초안을 자기 학생 것으로 알고 [반영]을 누른다. */}
          {phase.studentRef !== target.studentRef && (
            <p className="mb-1 text-[0.6rem] text-sp-muted">{phase.name} 학생 칸에 저장됩니다.</p>
          )}
          {/* 저장될 것과 **같은 글**을 보여 준다 — 미리보기와 저장이 다르면 미리보기가 아니다. */}
          <p className="mb-2 whitespace-pre-wrap text-[0.65rem] text-sp-text">
            {restoreAlias(phase.text, target.studentAlias, phase.name)}
          </p>
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => void applyAndContinue('replace')}
              className="rounded-md bg-sp-accent px-2 py-1 text-[0.6rem] font-medium text-sp-accent-fg"
            >
              {target.existingText?.trim() ? '바꾸기' : '반영'}
            </button>
            {target.existingText?.trim() && (
              <button
                type="button"
                onClick={() => void applyAndContinue('append')}
                className="rounded-md bg-sp-card px-2 py-1 text-[0.6rem] font-medium text-sp-text ring-1 ring-sp-border"
              >
                뒤에 붙이기
              </button>
            )}
            <button
              type="button"
              onClick={() => setPhase({ kind: 'idle' })}
              className="px-1 text-[0.6rem] text-sp-muted"
            >
              버리기
            </button>
          </div>
        </div>
      )}

      {phase.kind === 'stopped' && phase.message && (
        <div className="rounded-md bg-sp-card px-2 py-1">
          <p className="text-[0.6rem] text-sp-muted">{phase.message}</p>
          {phase.queue.length > 0 && (
            <button
              type="button"
              onClick={() => void runQueue(phase.queue, phase.queue.length)}
              className="mt-1 rounded-md bg-sp-bg px-2 py-0.5 text-[0.6rem] font-medium text-sp-accent ring-1 ring-sp-border"
            >
              이어 하기 ({phase.queue.length}명 남음)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
