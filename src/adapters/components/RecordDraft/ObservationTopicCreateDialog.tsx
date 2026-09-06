import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { InquiryThread } from '@domain/entities/InquiryThread';
import { Modal } from '@adapters/components/common/Modal';

interface ObservationTopicCreateDialogProps {
  /** 이 학생의 열린 주제. 비슷한 이름을 먼저 보여 주려고 받는다. */
  readonly openThreads: readonly InquiryThread[];
  readonly onCancel: () => void;
  /** 비슷한 이름의 기존 주제를 고른 경우. 새로 만들지 않는다. */
  readonly onPickExisting: (threadId: string) => void;
  /** 새 이름으로 확정. 이 시점에도 저장소에는 아무것도 쓰지 않는다. */
  readonly onCreate: (title: string) => void;
}

/**
 * 이름만 받는 작은 대화상자(계획 §4.2 "새 주제" 행).
 *
 * ★확정 전 저장소 쓰기 0회. [만들기] 는 "이번엔 이 이름으로 만들 것"이라는 뜻만 부모에게 넘기고,
 *   실제 생성은 기록이 저장되고 근거가 확보된 뒤 연결 단계에서 한 번에 일어난다(계획 §5.1-7).
 *   여기서 미리 만들면 저장을 취소했을 때 빈 주제가 남는다.
 *
 * ★공용 Modal 을 쓴다. 포커스 트랩·Esc·원래 포커스 복귀·바디 스크롤 잠금이 이미 들어 있다(AC-18).
 *   보드의 팝오버 패턴은 실제 포커스 트랩과 복귀가 없어 베끼지 않는다.
 */
export function ObservationTopicCreateDialog({
  openThreads,
  onCancel,
  onPickExisting,
  onCreate,
}: ObservationTopicCreateDialogProps) {
  const [name, setName] = useState('');
  const trimmed = name.trim();

  // 비슷한 이름을 **보여 주기만** 한다. 자동으로 고르거나 합치지 않는다 - 병합 판단은 교사 몫이다.
  const similar = useMemo(() => {
    if (trimmed.length === 0) return [];
    const needle = trimmed.toLowerCase();
    return openThreads
      .filter((t) => {
        const title = t.title.toLowerCase();
        return title.includes(needle) || needle.includes(title);
      })
      .slice(0, 5);
  }, [openThreads, trimmed]);

  const submit = () => {
    if (trimmed.length === 0) return;
    onCreate(trimmed);
  };

  return createPortal(
    <Modal isOpen onClose={onCancel} title="새 주제 만들기" size="sm">
      <div className="flex flex-col gap-3 px-6 pb-6 pt-2">
        <div>
          <label
            htmlFor="observation-topic-name"
            className="mb-1.5 block text-sm font-medium text-sp-text"
          >
            주제 이름
          </label>
          <input
            id="observation-topic-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="예: 할인 문구와 선택"
            autoFocus
            className="w-full rounded-lg border border-sp-border bg-sp-bg px-3.5 py-2.5 text-sm text-sp-text placeholder-sp-muted focus:border-sp-accent focus:outline-none"
          />
        </div>

        {similar.length > 0 && (
          <div className="rounded-lg bg-sp-surface p-2 ring-1 ring-sp-border">
            <p className="mb-1 text-xs text-sp-muted">
              비슷한 이름의 주제가 있어요. 이걸 선택할까요?
            </p>
            {similar.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onPickExisting(t.id)}
                className="block w-full truncate rounded-md px-2 py-1 text-left text-xs text-sp-text hover:bg-sp-card"
              >
                {t.title}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-sm text-sp-muted hover:text-sp-text"
          >
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={trimmed.length === 0}
            className="rounded-lg bg-sp-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            만들기
          </button>
        </div>
      </div>
    </Modal>,
    document.body,
  );
}
