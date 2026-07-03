import { describe, it, expect } from 'vitest';
import {
  validateMiniApp,
  isValidMiniApp,
  isValidIcon,
  MINIAPP_NAME_MAX,
  MINIAPP_DESC_MAX,
  type MiniAppIcon,
} from './MiniApp';

const emojiIcon: MiniAppIcon = { kind: 'emoji', value: '🎲' };
const imageIcon: MiniAppIcon = { kind: 'image', fileName: 'icon.png' };

describe('validateMiniApp', () => {
  it('유효한 메타는 빈 오류 배열을 반환한다', () => {
    expect(validateMiniApp({ name: '내 룰렛', description: '반 뽑기', icon: emojiIcon })).toEqual(
      [],
    );
    expect(isValidMiniApp({ name: '내 룰렛', description: '', icon: imageIcon })).toBe(true);
  });

  it('이름이 비어있거나 공백뿐이면 name-empty', () => {
    expect(validateMiniApp({ name: '', description: '', icon: emojiIcon })).toContain('name-empty');
    expect(validateMiniApp({ name: '   ', description: '', icon: emojiIcon })).toContain(
      'name-empty',
    );
  });

  it('이름이 최대 길이를 넘으면 name-too-long', () => {
    const longName = 'ㄱ'.repeat(MINIAPP_NAME_MAX + 1);
    expect(validateMiniApp({ name: longName, description: '', icon: emojiIcon })).toContain(
      'name-too-long',
    );
  });

  it('이름 앞뒤 공백은 트림 후 길이로 판정한다(경계)', () => {
    const boundary = `  ${'ㄱ'.repeat(MINIAPP_NAME_MAX)}  `;
    expect(validateMiniApp({ name: boundary, description: '', icon: emojiIcon })).toEqual([]);
  });

  it('설명이 최대 길이를 넘으면 desc-too-long (빈 설명은 허용)', () => {
    const longDesc = 'a'.repeat(MINIAPP_DESC_MAX + 1);
    expect(validateMiniApp({ name: '앱', description: longDesc, icon: emojiIcon })).toContain(
      'desc-too-long',
    );
    expect(validateMiniApp({ name: '앱', description: '', icon: emojiIcon })).toEqual([]);
  });

  it('빈 이모지/빈 파일명 아이콘은 icon-invalid', () => {
    expect(
      validateMiniApp({ name: '앱', description: '', icon: { kind: 'emoji', value: '' } }),
    ).toContain('icon-invalid');
    expect(
      validateMiniApp({ name: '앱', description: '', icon: { kind: 'image', fileName: '  ' } }),
    ).toContain('icon-invalid');
  });

  it('여러 위반을 동시에 모은다', () => {
    const errors = validateMiniApp({
      name: '',
      description: 'x'.repeat(MINIAPP_DESC_MAX + 1),
      icon: { kind: 'emoji', value: '' },
    });
    expect(errors).toEqual(expect.arrayContaining(['name-empty', 'desc-too-long', 'icon-invalid']));
    expect(errors).toHaveLength(3);
  });
});

describe('isValidIcon', () => {
  it('이모지·이미지 유효/무효를 구분한다', () => {
    expect(isValidIcon(emojiIcon)).toBe(true);
    expect(isValidIcon(imageIcon)).toBe(true);
    expect(isValidIcon({ kind: 'emoji', value: '' })).toBe(false);
    expect(isValidIcon({ kind: 'image', fileName: '' })).toBe(false);
  });
});
