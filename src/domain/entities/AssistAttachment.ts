/**
 * 쌤핀 AI 패널에 붙이는 첨부(1차: 이미지만).
 *
 * ★"내 AI"(선생님 본인 구독 CLI — Claude Code·Codex) 로 물어볼 때만 붙일 수 있다.
 *   쌤핀 AI(Solar) 는 중계 서버가 글만 받고, 이미지 속 이름·얼굴은 별칭으로 가릴 수도 없다 —
 *   그래서 Solar 경로에는 첨부 자체를 열지 않는다(ADR-090).
 *
 * ★본문은 base64 로 들고 다닌다. 렌더러→main 은 IPC 로 넘어가고, claude 는 stdin 의
 *   stream-json 메시지에 그대로 실리며, codex 만 실행 직전 임시 파일로 풀었다가 끝나면 지운다.
 */

/** 받는 이미지 형식. 두 CLI 가 모두 읽는 것만 둔다. */
export const ASSIST_ATTACHMENT_MEDIA_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

export type AssistAttachmentMediaType = (typeof ASSIST_ATTACHMENT_MEDIA_TYPES)[number];

export interface AssistAttachment {
  readonly id: string;
  /** 화면에 보여 줄 파일 이름. 붙여넣기한 이미지는 앱이 이름을 만든다. */
  readonly name: string;
  readonly mediaType: AssistAttachmentMediaType;
  /** 원본 크기(바이트). 한도 판정용 — base64 길이가 아니다. */
  readonly bytes: number;
  /** base64 본문(data: 접두사 없음). */
  readonly dataBase64: string;
}

/** 파일 선택·붙여넣기로 막 읽어 온 것. 형식 판정 전이라 `mediaType` 이 아직 문자열이다. */
export interface AssistAttachmentCandidate {
  readonly id: string;
  readonly name: string;
  readonly mediaType: string;
  readonly bytes: number;
  readonly dataBase64: string;
}

/** 포트로 나가는 모양 — 화면용 `id`·`name` 은 빼고 모델이 볼 것만. */
export interface AssistAttachmentPayload {
  readonly name: string;
  readonly mediaType: AssistAttachmentMediaType;
  readonly dataBase64: string;
}

/**
 * 한도. 한 장 5MB 는 Claude 쪽 이미지 상한(요청당 이미지 5MB)이고, 장수·총량은
 * 붙여넣기 실수(스크린샷 수십 장)로 IPC 가 막히지 않게 두는 안전선이다.
 */
export const ASSIST_ATTACHMENT_LIMITS = {
  maxCount: 4,
  maxBytesEach: 5 * 1024 * 1024,
  maxBytesTotal: 12 * 1024 * 1024,
} as const;
