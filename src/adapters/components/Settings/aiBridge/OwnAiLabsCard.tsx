/**
 * 내 AI로 실행 — 실험실 스위치 카드
 *
 * 쌤핀 AI 카드(`InAppAssistCard`) 바로 아래에 온다(계획서 §6.1). 모양은 같지만
 * **알려야 할 내용이 다르다** — 여기서는 선생님 구독을 쓰고, 대화가 어디로 가는지도 다르다.
 *
 * ★켤 때 안내를 한 번 띄운다. 쌤핀 AI 와 따로 받는다(고지 버전도 별개).
 * ★쌤핀은 열쇠(토큰)를 보관하지 않는다 — 로그인은 각 회사 CLI 가 직접 받는다(ADR-082 결정 3).
 */
import { useState } from 'react';

import { useAssistStore } from '@adapters/stores/useAssistStore';

function Notice({
  onAccept,
  onCancel,
}: {
  readonly onAccept: () => void;
  readonly onCancel: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-label="내 AI로 실행 안내"
      className="mt-3 rounded-xl border border-sp-border bg-sp-bg p-4"
    >
      <p className="mb-3 text-sm font-sp-semibold text-sp-text">켜기 전에 알아 두실 것</p>

      <dl className="mb-3 space-y-2 text-sm">
        <div>
          <dt className="text-sp-muted">누가 비용을 내나</dt>
          <dd className="text-sp-text">
            선생님이 이미 쓰고 계신 구독의 사용량을 씁니다. 쌤핀이 따로 받는 돈은 없고, 새로
            결제하실 것도 없습니다.
          </dd>
        </div>
        <div>
          <dt className="text-sp-muted">나가지 않는 것</dt>
          <dd className="text-sp-text">
            학생 이름·학번은 ［이름1］처럼 바꿔서 보냅니다. 기록 본문은 설정에서 &ldquo;읽기
            허용&rdquo;을 켠 경우에만 나갑니다.
          </dd>
        </div>
        <div>
          <dt className="text-sp-muted">어디로</dt>
          <dd className="text-sp-text">
            쌤핀 서버를 거치지 않고, 이 컴퓨터에 설치된 Claude Code·Codex 가 각 회사로 직접
            보냅니다.
          </dd>
        </div>
      </dl>

      {/* 색 단독으로 뜻을 전하지 않는다 — 아이콘·굵기·라벨을 함께 쓴다 */}
      <div className="mb-3 rounded-xl border-l-2 border-l-sp-warning bg-sp-card p-3">
        <p className="mb-1 flex items-center gap-1.5 text-sm font-sp-semibold text-sp-text">
          <span aria-hidden="true">⚠</span> 꼭 알아 두세요 — 대화가 AI 학습에 쓰일 수 있어요
        </p>
        <p className="text-sm text-sp-text">
          보낸 내용이 학습에 쓰이는지는 <strong>각 회사의 계정 설정</strong>이 정합니다. 끄고
          싶으시면 Claude 또는 ChatGPT 계정 설정에서 데이터 사용을 꺼 주세요. 또 선생님 컴퓨터의
          Claude Code·Codex 설정(모델·규칙)이 함께 적용됩니다.
        </p>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-sp-border bg-sp-card px-3 py-1.5 text-sm text-sp-text hover:bg-sp-surface"
        >
          그만두기
        </button>
        <button
          type="button"
          onClick={onAccept}
          className="rounded-lg bg-sp-accent px-3 py-1.5 text-sm font-sp-semibold text-sp-accent-fg"
        >
          이해했어요, 켤게요
        </button>
      </div>
    </div>
  );
}

export function OwnAiLabsCard() {
  const enabled = useAssistStore((s) => s.ownAiEnabled);
  const setOwnAiEnabled = useAssistStore((s) => s.setOwnAiEnabled);
  const needsNotice = useAssistStore((s) => s.needsOwnAiNotice);
  const acknowledgeNotice = useAssistStore((s) => s.acknowledgeOwnAiNotice);
  const [showNotice, setShowNotice] = useState(false);

  const toggle = (): void => {
    if (enabled) {
      setOwnAiEnabled(false);
      return;
    }
    // 고지문을 아직 안 봤으면 먼저 보여준다 — 확인과 켜짐이 한 동작이어야 한다.
    if (needsNotice()) {
      setShowNotice(true);
      return;
    }
    setOwnAiEnabled(true);
  };

  return (
    <section className="rounded-xl border border-sp-border bg-sp-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-sp-semibold text-sp-text">내 AI로 실행 (구독)</h3>
          <p className="mt-1 text-sm text-sp-muted">
            이미 쓰고 계신 Claude Code·Codex 로 쌤핀 AI 패널이 답하게 합니다. 생기부 초안도 이
            방식으로만 만들 수 있어요. 연결은 설정 &gt; AI 연결에서 합니다.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={toggle}
          className={[
            'shrink-0 rounded-lg px-3 py-1.5 text-sm font-sp-semibold',
            enabled
              ? 'bg-sp-accent text-sp-accent-fg'
              : 'border border-sp-border bg-sp-bg text-sp-text',
          ].join(' ')}
        >
          {enabled ? '켜짐' : '꺼짐'}
        </button>
      </div>

      {showNotice && (
        <Notice
          onAccept={() => {
            acknowledgeNotice();
            setOwnAiEnabled(true);
            setShowNotice(false);
          }}
          onCancel={() => setShowNotice(false)}
        />
      )}
    </section>
  );
}
