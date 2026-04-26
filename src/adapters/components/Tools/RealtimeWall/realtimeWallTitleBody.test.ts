import { describe, expect, it } from 'vitest';
import { parseTitleBody } from './realtimeWallTitleBody';

/**
 * 2026-04-26 라운드 7 신설 — parseTitleBody lenient regex 검증.
 *
 * 결함 C 회귀 가드: regex가 `(?:\n\n|\n|$)` 패턴으로 lenient화되어
 * 다음 케이스 모두 매칭되어야 한다.
 */
describe('parseTitleBody', () => {
  describe('legacy 형식 (\\n\\n 구분자)', () => {
    it('표준 `# 제목\\n\\n본문` 매칭 — title/body 분리', () => {
      const result = parseTitleBody('# 안녕하세요\n\n본문 내용입니다');
      expect(result).not.toBeNull();
      expect(result?.title).toBe('안녕하세요');
      expect(result?.body).toBe('본문 내용입니다');
    });

    it('빈 본문 (`# 제목\\n\\n`) 매칭 — body 빈 문자열', () => {
      const result = parseTitleBody('# 제목만\n\n');
      expect(result).not.toBeNull();
      expect(result?.title).toBe('제목만');
      expect(result?.body).toBe('');
    });

    it('다중 줄 본문 매칭', () => {
      const result = parseTitleBody('# 제목\n\n첫째 줄\n둘째 줄\n셋째 줄');
      expect(result).not.toBeNull();
      expect(result?.title).toBe('제목');
      expect(result?.body).toBe('첫째 줄\n둘째 줄\n셋째 줄');
    });
  });

  describe('lenient 신규 케이스 (라운드 7)', () => {
    it('title-only `# 제목` (newline 없음) 매칭 — body 빈 문자열', () => {
      const result = parseTitleBody('# ㄴㄴ');
      expect(result).not.toBeNull();
      expect(result?.title).toBe('ㄴㄴ');
      expect(result?.body).toBe('');
    });

    it('single newline `# 제목\\n본문` 매칭 — title/body 분리', () => {
      const result = parseTitleBody('# ㄴㄴ\n본문');
      expect(result).not.toBeNull();
      expect(result?.title).toBe('ㄴㄴ');
      expect(result?.body).toBe('본문');
    });

    it('trailing single newline `# 제목\\n` 매칭 — body 빈 문자열', () => {
      const result = parseTitleBody('# 제목\n');
      expect(result).not.toBeNull();
      expect(result?.title).toBe('제목');
      expect(result?.body).toBe('');
    });

    it('한국어 + 영어 + 숫자 mix title 매칭', () => {
      const result = parseTitleBody('# Hello 안녕 123\n본문 내용');
      expect(result).not.toBeNull();
      expect(result?.title).toBe('Hello 안녕 123');
      expect(result?.body).toBe('본문 내용');
    });
  });

  describe('미매칭 케이스 (null 반환)', () => {
    it('빈 문자열 → null', () => {
      expect(parseTitleBody('')).toBeNull();
    });

    it('# 없는 plain text → null', () => {
      expect(parseTitleBody('그냥 본문 내용')).toBeNull();
    });

    it('# 다음 공백 없음 (`#제목`) → null (regex `\\s+` 미충족)', () => {
      expect(parseTitleBody('#제목')).toBeNull();
    });

    it('## (h2) → null (regex `^#\\s+` 1개 # 강제)', () => {
      // Note: '## 제목'은 첫 캐릭터가 '#', 그 다음이 '#'로 \s+ 미매칭 → null.
      expect(parseTitleBody('## 부제목\n본문')).toBeNull();
    });

    it('본문 중간에 # 등장 → null (앵커 ^# 미매칭)', () => {
      expect(parseTitleBody('서두\n# 제목\n본문')).toBeNull();
    });
  });

  describe('title trim 보장', () => {
    it('title 앞뒤 공백 trim', () => {
      const result = parseTitleBody('#   제목 with spaces   \n본문');
      expect(result).not.toBeNull();
      expect(result?.title).toBe('제목 with spaces');
    });
  });
});
