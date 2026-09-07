/**
 * 쌤핀 AI 첨부 규칙 — 누구에게 붙일 수 있고, 무엇을 받으며, CLI 에는 어떤 모양으로 넘기나.
 *
 * ★이 파일은 도메인이다. 외부 의존성 import 금지, 순수 함수만 둔다.
 */
import {
  ASSIST_ATTACHMENT_LIMITS,
  ASSIST_ATTACHMENT_MEDIA_TYPES,
  type AssistAttachmentMediaType,
  type AssistAttachmentPayload,
} from '../entities/AssistAttachment';
import type { OwnAiProviderId } from '../entities/OwnAiProvider';

/**
 * 첨부를 붙일 수 있는가 = **"내 AI"(구독 CLI)로 답하는 동안만.**
 *
 * 쌤핀 AI(Solar) 는 중계 서버가 글만 받고, 사진 속 이름·얼굴은 별칭으로 가릴 수도 없다.
 * 그래서 Solar 를 고른 동안에는 버튼을 숨기고, 이미 붙인 것도 내려놓는다.
 */
export function attachmentsAllowedFor(
  provider: OwnAiProviderId | 'ssampin',
): provider is OwnAiProviderId {
  return provider !== 'ssampin';
}

export function isAssistAttachmentMediaType(value: string): value is AssistAttachmentMediaType {
  return (ASSIST_ATTACHMENT_MEDIA_TYPES as readonly string[]).includes(value);
}

/** 파일 선택창의 accept 값. */
export const ASSIST_ATTACHMENT_ACCEPT = ASSIST_ATTACHMENT_MEDIA_TYPES.join(',');

export type AttachmentRejection = 'not-image' | 'too-large' | 'too-many' | 'total-too-large';

export const ATTACHMENT_REJECTION_MESSAGES: Readonly<Record<AttachmentRejection, string>> = {
  'not-image': '이미지 파일(PNG·JPG·WebP·GIF)만 붙일 수 있어요.',
  'too-large': `이미지 한 장은 ${ASSIST_ATTACHMENT_LIMITS.maxBytesEach / 1024 / 1024}MB 까지예요.`,
  'too-many': `이미지는 한 번에 ${ASSIST_ATTACHMENT_LIMITS.maxCount}장까지 붙일 수 있어요.`,
  'total-too-large': `이미지를 다 합쳐 ${ASSIST_ATTACHMENT_LIMITS.maxBytesTotal / 1024 / 1024}MB 까지만 보낼 수 있어요.`,
};

export interface AttachmentCandidate {
  readonly mediaType: string;
  readonly bytes: number;
}

/**
 * 새 파일 하나를 지금 붙은 것들 옆에 더 붙여도 되는가.
 * 거부 사유는 하나만 돌려준다 — 첫 번째로 걸린 것. 화면은 그 문구를 그대로 보여 준다.
 */
export function acceptAttachment(
  candidate: AttachmentCandidate,
  existing: readonly { readonly bytes: number }[],
): { readonly ok: true } | { readonly ok: false; readonly reason: AttachmentRejection } {
  if (!isAssistAttachmentMediaType(candidate.mediaType)) return { ok: false, reason: 'not-image' };
  if (candidate.bytes > ASSIST_ATTACHMENT_LIMITS.maxBytesEach) {
    return { ok: false, reason: 'too-large' };
  }
  if (existing.length >= ASSIST_ATTACHMENT_LIMITS.maxCount)
    return { ok: false, reason: 'too-many' };
  const total = existing.reduce((sum, a) => sum + a.bytes, 0) + candidate.bytes;
  if (total > ASSIST_ATTACHMENT_LIMITS.maxBytesTotal)
    return { ok: false, reason: 'total-too-large' };
  return { ok: true };
}

/**
 * main 프로세스가 IPC 로 받은 첨부 배열을 다시 검사한다(렌더러 검사의 두 번째 그물).
 * base64 길이로 원본 크기를 어림한다(3/4).
 */
export function validateAttachmentPayloads(
  items: readonly AssistAttachmentPayload[],
): { readonly ok: true } | { readonly ok: false; readonly reason: AttachmentRejection } {
  const accepted: { bytes: number }[] = [];
  for (const item of items) {
    const bytes = Math.floor((item.dataBase64.length * 3) / 4);
    const r = acceptAttachment({ mediaType: item.mediaType, bytes }, accepted);
    if (!r.ok) return r;
    accepted.push({ bytes });
  }
  return { ok: true };
}

/** 쌤핀 AI(Solar) 포트에 첨부가 닿았을 때 화면에 띄우는 거절 문구. */
export const ASSIST_ATTACHMENT_NOT_FOR_SOLAR =
  '이미지는 내 AI(Claude Code·Codex)로만 보낼 수 있어요. 위에서 답하는 AI를 바꾸거나 이미지를 빼고 다시 보내 주세요.';

/** 글 없이 이미지만 보낼 때 대신 실을 질문. */
export const ATTACHMENT_ONLY_QUESTION = '첨부한 이미지를 보고 설명해 주세요.';

/**
 * 첨부가 있을 때 화면에 띄우는 한 줄. **가리지 않는다**는 사실을 보내기 전에 말한다 —
 * 글은 이름을 별칭으로 바꿔 내보내지만, 사진 속 글자·얼굴은 그럴 수 없다.
 */
export function attachmentNotice(providerLabel: string): string {
  return `사진 속 이름·얼굴은 가려지지 않아요. ${providerLabel}에 그대로 보냅니다.`;
}

/**
 * claude `--input-format stream-json` 에 넣을 사용자 메시지 한 줄(JSONL).
 *
 * ★`-p <프롬프트>` 대신 쓴다. 이미지는 argv 에 실을 수 없고, 내장 도구를 전부 껐으므로
 *   (`--tools ""`) 파일 경로를 알려 줘도 모델이 읽을 수 없다. 그래서 API 메시지 모양 그대로
 *   stdin 에 한 줄 쓰고 **바로 닫는다**(stdin 을 열어 두면 안 된다는 규칙은 그대로다).
 *   2026-09-07 실측: 2.1.258 이 이 모양을 받아 "빨간색"이라고 답했다.
 */
export function buildClaudeStdinMessage(
  prompt: string,
  attachments: readonly AssistAttachmentPayload[],
): string {
  const content: unknown[] = [{ type: 'text', text: prompt }];
  for (const a of attachments) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: a.mediaType, data: a.dataBase64 },
    });
  }
  return `${JSON.stringify({ type: 'user', message: { role: 'user', content } })}\n`;
}

/** codex 임시 파일 이름 — 원래 이름은 쓰지 않는다(경로 문자·개인정보가 섞여 올 수 있다). */
export function attachmentFileName(index: number, mediaType: AssistAttachmentMediaType): string {
  const ext: Record<AssistAttachmentMediaType, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
  };
  return `image-${index + 1}.${ext[mediaType]}`;
}
