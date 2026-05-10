/**
 * WS 프로토콜 Zod 스키마 + 메타테스트 (MT-1: 모든 client 메시지 타입 스키마 보유).
 */

import { describe, expect, it } from 'vitest';
import {
  CLIENT_MESSAGE_TYPES,
  ClientToServerMsgSchema,
  JoinSessionSchema,
  OverlayResponseSchema,
  PROTOCOL_VERSION,
  RATE_LIMIT_LIMIT,
  RATE_LIMIT_WINDOW_MS,
  ShortCodeSchema,
  StudentResponseDataSchema,
  UuidV4Schema,
  type ClientToServerMsg,
} from './interactiveSlides';

describe('PROTOCOL_VERSION + rate limit policy', () => {
  it('PROTOCOL_VERSION은 semver 형식', () => {
    expect(PROTOCOL_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('rate limit 정책 (학생당 overlay당 1초 5회)', () => {
    expect(RATE_LIMIT_LIMIT).toBe(5);
    expect(RATE_LIMIT_WINDOW_MS).toBe(1000);
  });
});

describe('ShortCodeSchema (PIPA §11.3)', () => {
  it('charset: A,C,D,E,F,G,H,J,K,L,M,N,P,Q,R,T,U,V,W,X,Y,3,4,7,9 6자리', () => {
    expect(ShortCodeSchema.safeParse('ACDEFG').success).toBe(true);
    expect(ShortCodeSchema.safeParse('GHJKLM').success).toBe(true);
    expect(ShortCodeSchema.safeParse('YYYYY9').success).toBe(true);
  });

  it('헷갈리는 문자(B/I/O/S/Z, 0/1/2/5/6/8) 거부', () => {
    expect(ShortCodeSchema.safeParse('ABCDEF').success).toBe(false); // B
    expect(ShortCodeSchema.safeParse('OPQRST').success).toBe(false); // O
    expect(ShortCodeSchema.safeParse('123456').success).toBe(false);
  });

  it('길이 5 또는 7 거부', () => {
    expect(ShortCodeSchema.safeParse('ACDEF').success).toBe(false);
    expect(ShortCodeSchema.safeParse('ACDEFGH').success).toBe(false);
  });
});

describe('UuidV4Schema', () => {
  it('정상 UUID v4 통과', () => {
    expect(
      UuidV4Schema.safeParse('550e8400-e29b-41d4-a716-446655440000').success,
    ).toBe(true);
  });

  it('UUID v3/v5는 거부 (4 prefix 필수)', () => {
    expect(
      UuidV4Schema.safeParse('550e8400-e29b-31d4-a716-446655440000').success,
    ).toBe(false);
  });
});

describe('JoinSession', () => {
  it('rejoin 옵션 없는 신규 join 통과', () => {
    const r = JoinSessionSchema.safeParse({
      type: 'join-session',
      sessionCode: 'ACDEFG',
      studentName: '홍길동',
    });
    expect(r.success).toBe(true);
  });

  it('rejoin previousToken 포함', () => {
    const r = JoinSessionSchema.safeParse({
      type: 'join-session',
      sessionCode: 'ACDEFG',
      studentName: '홍길동',
      rejoin: { previousToken: '550e8400-e29b-41d4-a716-446655440000' },
    });
    expect(r.success).toBe(true);
  });

  it('빈 이름 거부', () => {
    const r = JoinSessionSchema.safeParse({
      type: 'join-session',
      sessionCode: 'ACDEFG',
      studentName: '',
    });
    expect(r.success).toBe(false);
  });

  it('20자 초과 이름 거부', () => {
    const r = JoinSessionSchema.safeParse({
      type: 'join-session',
      sessionCode: 'ACDEFG',
      studentName: 'a'.repeat(21),
    });
    expect(r.success).toBe(false);
  });
});

describe('StudentResponseDataSchema (overlay type별)', () => {
  it('poll 응답 통과', () => {
    expect(
      StudentResponseDataSchema.safeParse({
        type: 'poll',
        selectedOptionIds: ['A', 'B'],
      }).success,
    ).toBe(true);
  });

  it('text: 2000자 초과 거부', () => {
    expect(
      StudentResponseDataSchema.safeParse({
        type: 'text',
        value: 'a'.repeat(2001),
      }).success,
    ).toBe(false);
  });

  it('draw: pngBase64 700KB 초과 거부 (Plan §3 페이로드 한도)', () => {
    expect(
      StudentResponseDataSchema.safeParse({
        type: 'draw',
        pngBase64: 'a'.repeat(700_001),
        widthPx: 1280,
        heightPx: 720,
      }).success,
    ).toBe(false);
  });

  it('draw: widthPx/heightPx 4096 초과 거부', () => {
    expect(
      StudentResponseDataSchema.safeParse({
        type: 'draw',
        pngBase64: 'a',
        widthPx: 5000,
        heightPx: 720,
      }).success,
    ).toBe(false);
  });

  it('draggable: targetId nullable (미배치 허용)', () => {
    expect(
      StudentResponseDataSchema.safeParse({
        type: 'draggable',
        placements: [
          { itemId: 'i1', targetId: 't1' },
          { itemId: 'i2', targetId: null },
        ],
      }).success,
    ).toBe(true);
  });
});

describe('OverlayResponseSchema (WS↔token 매핑은 서버에서 검증)', () => {
  it('정상 페이로드 통과', () => {
    const r = OverlayResponseSchema.safeParse({
      type: 'overlay-response',
      sessionCode: 'ACDEFG',
      overlayId: '550e8400-e29b-41d4-a716-446655440000',
      studentToken: '550e8400-e29b-41d4-a716-446655440001',
      clientResponseId: 'c-1',
      data: { type: 'poll', selectedOptionIds: ['A'] },
    });
    expect(r.success).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
// 메타테스트 MT-1: 모든 client message type이 union에 포함
// ─────────────────────────────────────────────────────────────
describe('MT-1: 모든 client 메시지 타입에 Zod 스키마 존재', () => {
  it('CLIENT_MESSAGE_TYPES 6종 모두 ClientToServerMsgSchema가 통과시킨다', () => {
    const validSamples: Record<ClientToServerMsg['type'], unknown> = {
      'slide-advance': {
        type: 'slide-advance',
        sessionCode: 'ACDEFG',
        slideIndex: 0,
        timestamp: 100,
      },
      'overlay-activate': {
        type: 'overlay-activate',
        sessionCode: 'ACDEFG',
        overlayId: '550e8400-e29b-41d4-a716-446655440000',
      },
      'overlay-deactivate': {
        type: 'overlay-deactivate',
        sessionCode: 'ACDEFG',
        overlayId: '550e8400-e29b-41d4-a716-446655440000',
        showResults: 'anonymous',
      },
      'lesson-end': { type: 'lesson-end', sessionCode: 'ACDEFG' },
      'join-session': {
        type: 'join-session',
        sessionCode: 'ACDEFG',
        studentName: 'a',
      },
      'overlay-response': {
        type: 'overlay-response',
        sessionCode: 'ACDEFG',
        overlayId: '550e8400-e29b-41d4-a716-446655440000',
        studentToken: '550e8400-e29b-41d4-a716-446655440001',
        clientResponseId: 'c-1',
        data: { type: 'poll', selectedOptionIds: ['A'] },
      },
    };

    expect(CLIENT_MESSAGE_TYPES.length).toBe(6);
    for (const t of CLIENT_MESSAGE_TYPES) {
      const result = ClientToServerMsgSchema.safeParse(validSamples[t]);
      expect(result.success).toBe(true);
    }
  });

  it('알 수 없는 type은 거부', () => {
    const result = ClientToServerMsgSchema.safeParse({
      type: 'unknown-message',
      sessionCode: 'ACDEFG',
    });
    expect(result.success).toBe(false);
  });
});
