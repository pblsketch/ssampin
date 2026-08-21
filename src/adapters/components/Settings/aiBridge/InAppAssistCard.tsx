/**
 * 쌤핀 AI — 설정 카드 (옵트인)
 *
 * ★새 설정 탭을 만들지 않는다.
 * 탭 id 는 딥링크(`settings#widget`)와 사용자 가이드(`/docs`)가 참조하고 계약 테스트가 있다
 * (`SettingsSidebar.tsx:17` 주석). 기존 `ai-bridge` 탭("AI 연결") 안에 카드로 들어간다.
 *
 * ★켤 때 안내를 한 번 띄운다.
 * 무료로 받아 쓰는 한 "보낸 내용이 학습에 쓰일 수 있다"는 사실을 그대로 말해야 한다
 * (ADR-061 결정 7). 이건 부담이 아니라 **이 전략을 떳떳하게 만드는 조건**이다.
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
      aria-label="쌤핀 AI 안내"
      className="mt-3 rounded-xl border border-sp-border bg-sp-bg p-4"
    >
      <p className="mb-3 text-sm font-sp-semibold text-sp-text">켜기 전에 알아 두실 것</p>

      <dl className="mb-3 space-y-2 text-sm">
        <div>
          <dt className="text-sp-muted">나가는 것</dt>
          <dd className="text-sp-text">
            선생님이 친 질문(이름을 지운 뒤), 집계 숫자, 카테고리 이름, 학급 이름
          </dd>
        </div>
        <div>
          <dt className="text-sp-muted">나가지 않는 것</dt>
          <dd className="text-sp-text">
            학생 이름·학번, 기록 본문, 출결 사유, 상담 내용, 건강·가정 정보
          </dd>
        </div>
        <div>
          <dt className="text-sp-muted">어디로</dt>
          <dd className="text-sp-text">
            주식회사 업스테이지의 AI 서버. 쌤핀 중계 서버를 거치며 본문은 저장하지 않습니다. 국내
            회사지만 일부 처리를 미국 업체에 맡깁니다.
          </dd>
        </div>
      </dl>

      {/* 색 단독으로 뜻을 전하지 않는다 — 아이콘·굵기·라벨을 함께 쓴다 */}
      <div className="mb-3 rounded-xl border-l-2 border-l-sp-warning bg-sp-card p-3">
        <p className="mb-1 flex items-center gap-1.5 text-sm font-sp-semibold text-sp-text">
          <span aria-hidden="true">⚠</span> 꼭 알아 두세요 — 보낸 내용이 AI 학습에 쓰일 수 있어요
        </p>
        <p className="text-sm text-sp-text">
          지금은 이 AI를 무료로 제공받아 쓰고 있어서, 보낸 내용이 AI를 더 좋게 만드는 데 쓰일 수
          있고 이를 거부할 방법이 없습니다. 한 번 나간 내용은 되돌릴 수 없습니다. 그래서 쌤핀은
          처음부터 <strong>개인정보가 나가지 않는 범위로만</strong> 만들었습니다.
        </p>
      </div>

      <p className="mb-3 text-sm text-sp-muted">
        민감할 수 있는 표현은 <strong className="text-sp-text">화면에 표시해 드립니다.</strong>{' '}
        막지는 않으니 보낼지는 선생님이 정하시면 됩니다. 학생이 AI와 대화하는 기능이 아니라 선생님
        업무용입니다.
      </p>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-sp-border bg-sp-card px-3 py-1.5 text-sm text-sp-text hover:bg-sp-surface"
        >
          다음에 할게요
        </button>
        <button
          type="button"
          onClick={onAccept}
          className="rounded-lg bg-sp-accent px-3 py-1.5 text-sm font-sp-semibold text-sp-accent-fg"
        >
          확인했어요, 켤게요
        </button>
      </div>
    </div>
  );
}

export function InAppAssistCard() {
  const enabled = useAssistStore((s) => s.enabled);
  const setEnabled = useAssistStore((s) => s.setEnabled);
  const needsNotice = useAssistStore((s) => s.needsNotice);
  const acknowledgeNotice = useAssistStore((s) => s.acknowledgeNotice);

  const [showNotice, setShowNotice] = useState(false);

  const toggle = (): void => {
    if (enabled) {
      setEnabled(false);
      return;
    }
    // 고지문을 아직 안 봤거나 버전이 올랐으면 먼저 보여준다.
    if (needsNotice()) {
      setShowNotice(true);
      return;
    }
    setEnabled(true);
  };

  return (
    <section className="rounded-xl border border-sp-border bg-sp-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-sp-semibold text-sp-text">쌤핀 AI</h3>
          <p className="mt-1 text-sm text-sp-muted">
            앱 안에서 바로 물어보세요. 출결·기록·할 일을 말로 확인할 수 있습니다. 설치나 로그인은
            필요 없습니다.
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
            setEnabled(true);
            setShowNotice(false);
          }}
          onCancel={() => setShowNotice(false)}
        />
      )}
    </section>
  );
}
