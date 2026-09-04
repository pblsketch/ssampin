import { AiBridgeCard } from '../aiBridge/AiBridgeCard';
import { OwnAiProviderCard } from '../aiBridge/OwnAiProviderCard';
import { useAssistStore } from '@adapters/stores/useAssistStore';
import { useOwnAiStatusRefresh } from '@adapters/stores/useOwnAiStatusStore';
import { OWN_AI_PROVIDERS } from '@domain/entities/OwnAiProvider';

/**
 * "내 AI로 실행" — 공급자 카드 두 장(Claude Code · Codex)을 담는 묶음.
 *
 * 실험실 스위치가 꺼져 있어도 카드는 보인다 — 연결(설치·로그인)은 미리 해 두어도 되고,
 * 스위치를 켜는 순간 패널에서 바로 고를 수 있어야 하기 때문이다. 대신 꺼져 있다는 사실은
 * 위에 한 줄로 말해 준다("연결했는데 왜 안 보이지"를 막는다).
 */
function OwnAiSection() {
  const ownAiEnabled = useAssistStore((s) => s.ownAiEnabled);
  // 이 탭을 여는 순간 + 창이 돌아올 때 다시 묻는다 — 설치·로그인은 쌤핀 밖에서 끝난다.
  useOwnAiStatusRefresh(true);

  return (
    <section
      className="rounded-xl bg-sp-card ring-1 ring-sp-border p-5"
      aria-labelledby="own-ai-section-title"
    >
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sp-surface text-sp-accent">
          <span className="material-symbols-outlined" aria-hidden="true">
            terminal
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 id="own-ai-section-title" className="text-base font-bold text-sp-text">
            내 AI로 실행 (구독)
          </h3>
          <p className="mt-0.5 text-xs text-sp-muted">
            선생님이 이미 쓰는 Claude Code·Codex 로 쌤핀 AI 패널이 답하게 해요. 설치·로그인은 각
            회사 방식 그대로이고, 쌤핀은 열쇠(토큰)를 보관하지 않아요.
          </p>
        </div>
      </div>

      {!ownAiEnabled && (
        <p className="mt-4 rounded-lg border border-sp-border bg-sp-surface px-3 py-2 text-xs text-sp-muted">
          지금은 <strong className="text-sp-text">실험실 기능</strong>에서 &ldquo;내 AI로
          실행&rdquo;이 꺼져 있어요. 연결은 미리 해 두어도 되고, 켜면 AI 패널에서 고를 수 있어요.
        </p>
      )}

      <div className="mt-4 space-y-3">
        {OWN_AI_PROVIDERS.map((provider) => (
          <OwnAiProviderCard key={provider} provider={provider} />
        ))}
      </div>
    </section>
  );
}

export function AiBridgeTab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-sp-text">AI 연결</h2>
        <p className="mt-1 text-sm text-sp-muted">
          쌤핀 데이터를 외부 AI 도구와 안전하게 잇습니다. 사용자 PC에 별도 설치(Node 등) 없이, 버튼
          하나로 연결됩니다.
        </p>
      </div>
      {/* 쌤핀 AI(앱 안에서 묻고 답하기)는 설정 > 실험실 기능 탭으로 옮겼다 (2026-08-24 오너 결정) */}
      <AiBridgeCard />
      {/* 내 AI로 실행(구독) — 설치·로그인·모델 선택. 스위치 자체는 실험실 기능 탭에 있다. */}
      <OwnAiSection />
    </div>
  );
}
