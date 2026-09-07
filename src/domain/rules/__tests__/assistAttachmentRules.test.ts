import { describe, it, expect } from 'vitest';
import {
  ASSIST_ATTACHMENT_ACCEPT,
  acceptAttachment,
  attachmentFileName,
  attachmentsAllowedFor,
  buildClaudeStdinMessage,
  validateAttachmentPayloads,
} from '@domain/rules/assistAttachmentRules';
import { ASSIST_ATTACHMENT_LIMITS } from '@domain/entities/AssistAttachment';

const MB = 1024 * 1024;

describe('누가 첨부를 받을 수 있나 (ADR-090)', () => {
  it('★쌤핀 AI(Solar) 는 못 받는다 — 서버가 글만 받고 사진 속 이름은 가릴 수 없다', () => {
    expect(attachmentsAllowedFor('ssampin')).toBe(false);
  });
  it('내 AI(Claude Code·Codex) 는 받는다', () => {
    expect(attachmentsAllowedFor('claude')).toBe(true);
    expect(attachmentsAllowedFor('codex')).toBe(true);
  });
});

describe('한 장 받을지 판정', () => {
  it('이미지가 아니면 거절한다 — PDF·한글 문서는 1차 범위 밖', () => {
    expect(acceptAttachment({ mediaType: 'application/pdf', bytes: 10 }, [])).toEqual({
      ok: false,
      reason: 'not-image',
    });
    expect(acceptAttachment({ mediaType: 'image/png', bytes: 10 }, [])).toEqual({ ok: true });
  });

  it('한 장 상한을 넘으면 거절한다', () => {
    expect(
      acceptAttachment(
        { mediaType: 'image/jpeg', bytes: ASSIST_ATTACHMENT_LIMITS.maxBytesEach + 1 },
        [],
      ),
    ).toEqual({ ok: false, reason: 'too-large' });
  });

  it('장수 상한에 닿으면 거절한다', () => {
    const full = Array.from({ length: ASSIST_ATTACHMENT_LIMITS.maxCount }, () => ({ bytes: 1 }));
    expect(acceptAttachment({ mediaType: 'image/png', bytes: 1 }, full)).toEqual({
      ok: false,
      reason: 'too-many',
    });
  });

  it('합계 상한을 넘으면 거절한다 — 한 장씩은 괜찮아도', () => {
    const existing = [{ bytes: 4.5 * MB }, { bytes: 4.5 * MB }];
    expect(acceptAttachment({ mediaType: 'image/webp', bytes: 4 * MB }, existing)).toEqual({
      ok: false,
      reason: 'total-too-large',
    });
  });

  it('accept 값은 이미지 4종이다', () => {
    expect(ASSIST_ATTACHMENT_ACCEPT).toBe('image/png,image/jpeg,image/webp,image/gif');
  });
});

describe('main 쪽 두 번째 그물', () => {
  it('base64 길이로 크기를 어림해 같은 한도를 건다', () => {
    const big = 'A'.repeat(Math.ceil((ASSIST_ATTACHMENT_LIMITS.maxBytesEach + 10) * (4 / 3)));
    expect(
      validateAttachmentPayloads([{ name: 'a.png', mediaType: 'image/png', dataBase64: big }]),
    ).toEqual({ ok: false, reason: 'too-large' });
    expect(
      validateAttachmentPayloads([{ name: 'a.png', mediaType: 'image/png', dataBase64: 'AAAA' }]),
    ).toEqual({ ok: true });
  });
});

describe('claude stdin 메시지 — 2.1.258 이 실제로 받은 모양', () => {
  it('텍스트 블록 뒤에 이미지 블록이 base64 로 붙고, 줄바꿈으로 끝난다(JSONL)', () => {
    const line = buildClaudeStdinMessage('이 표 읽어 줘', [
      { name: 'a.png', mediaType: 'image/png', dataBase64: 'iVBOR' },
    ]);
    expect(line.endsWith('\n')).toBe(true);
    expect(JSON.parse(line)).toEqual({
      type: 'user',
      message: {
        role: 'user',
        content: [
          { type: 'text', text: '이 표 읽어 줘' },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBOR' } },
        ],
      },
    });
  });
});

describe('codex 임시 파일 이름', () => {
  it('원래 파일 이름을 쓰지 않는다 — 번호와 확장자만', () => {
    expect(attachmentFileName(0, 'image/png')).toBe('image-1.png');
    expect(attachmentFileName(2, 'image/jpeg')).toBe('image-3.jpg');
  });
});
