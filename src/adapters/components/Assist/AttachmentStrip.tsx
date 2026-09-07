/**
 * 입력창 위 첨부 줄 — 붙인 이미지의 작은 미리보기와 "가려지지 않는다"는 한 줄.
 *
 * ★"내 AI"로 답할 때만 그려진다(부모가 정한다). 여기서는 붙은 것을 보여 주고 빼게만 한다.
 * ★경고 줄은 첨부가 하나라도 있으면 항상 보인다 — 글은 이름을 별칭으로 가려 내보내지만,
 *   사진 속 글자·얼굴은 그럴 수 없다는 사실을 보내기 **전에** 읽게 한다.
 */
import type { AssistAttachment } from '@domain/entities/AssistAttachment';
import { attachmentNotice } from '@domain/rules/assistAttachmentRules';

interface Props {
  readonly attachments: readonly AssistAttachment[];
  /** "Claude Code" 같은 답하는 AI 이름 — 경고 줄에 들어간다. */
  readonly providerLabel: string;
  /** 방금 거절된 파일이 있으면 그 사유. 없으면 null. */
  readonly rejection: string | null;
  readonly onRemove: (id: string) => void;
  readonly disabled?: boolean;
}

export function AttachmentStrip({
  attachments,
  providerLabel,
  rejection,
  onRemove,
  disabled = false,
}: Props) {
  if (attachments.length === 0 && rejection === null) return null;

  return (
    <div className="mt-2 flex flex-col gap-1.5" data-testid="assist-attachment-strip">
      {attachments.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="붙인 이미지">
          {attachments.map((a) => (
            <li key={a.id} className="group relative">
              <img
                src={`data:${a.mediaType};base64,${a.dataBase64}`}
                alt={a.name}
                title={a.name}
                className="h-14 w-14 rounded-lg border border-sp-border object-cover"
              />
              <button
                type="button"
                onClick={() => onRemove(a.id)}
                disabled={disabled}
                aria-label={`${a.name} 빼기`}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-sp-border bg-sp-surface text-[0.65rem] leading-none text-sp-muted hover:text-sp-text disabled:opacity-50"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {attachments.length > 0 && (
        <p className="text-xs text-sp-warning">{attachmentNotice(providerLabel)}</p>
      )}
      {rejection !== null && (
        <p role="alert" className="text-xs text-sp-warning">
          {rejection}
        </p>
      )}
    </div>
  );
}
