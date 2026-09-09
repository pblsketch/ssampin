/**
 * 예약자 정보 암호화 — 판 1 / 판 2 (ADR-095, 계획서 §9.1)
 *
 * 여기서 지키는 계약은 하나다: **어떤 판으로 풀지는 암호문이 정한다.**
 * 일정 행의 `crypto_version` 은 보지 않는다. 그 이유가 아래 마지막 두 테스트다.
 */
import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, CRYPTO_V2_PREFIX } from '../cryptoUtils';

const KEY = 'admin-key-1234';
const SALT_A = 'a1b2c3d4e5f60718';
const SALT_B = '99887766554433221';

describe('판 1 — 소금값 없이 (071 이전 일정)', () => {
  it('잠갔다 풀면 원문이 그대로다', async () => {
    const sealed = await encrypt('학부모|김보호|010-0000-0000', KEY);
    expect(await decrypt(sealed, KEY)).toBe('학부모|김보호|010-0000-0000');
  });

  it('판 1 암호문에는 접두사가 붙지 않는다', async () => {
    const sealed = await encrypt('내용', KEY);
    expect(sealed.startsWith(CRYPTO_V2_PREFIX)).toBe(false);
  });
});

describe('판 2 — 일정별 난수 소금값', () => {
  it('잠갔다 풀면 원문이 그대로다', async () => {
    const sealed = await encrypt('학부모|박보호|010-1111-1111', KEY, SALT_A);
    expect(await decrypt(sealed, KEY, SALT_A)).toBe('학부모|박보호|010-1111-1111');
  });

  it('판 2 암호문에는 v2: 접두사가 붙는다', async () => {
    const sealed = await encrypt('내용', KEY, SALT_A);
    expect(sealed.startsWith(CRYPTO_V2_PREFIX)).toBe(true);
  });

  it('같은 열쇠라도 소금값이 다르면 결과가 다르다 — 그게 판 2 를 하는 이유다', async () => {
    const a = await encrypt('내용', KEY, SALT_A);
    const b = await encrypt('내용', KEY, SALT_B);
    expect(a).not.toBe(b);
  });

  it('다른 일정의 소금값으로는 못 푼다', async () => {
    const sealed = await encrypt('내용', KEY, SALT_A);
    await expect(decrypt(sealed, KEY, SALT_B)).rejects.toThrow();
  });

  it('소금값을 안 주면 조용히 실패하지 않고 이유를 말한다', async () => {
    const sealed = await encrypt('내용', KEY, SALT_A);
    await expect(decrypt(sealed, KEY)).rejects.toThrow(/소금값/);
  });
});

describe('판 오인 방지 — 계획서 §8 시나리오 5 (편도 침묵 결함)', () => {
  it('접두사가 없으면 소금값을 줘도 판 1 로 푼다', async () => {
    // 캐시된 옛 랜딩 번들이 만든 값이 이 모양이다.
    const oldBundleValue = await encrypt('학부모|이보호|010-2222-2222', KEY);
    expect(await decrypt(oldBundleValue, KEY, SALT_A)).toBe('학부모|이보호|010-2222-2222');
  });

  it('일정이 판 2 라도(소금값 있음) 접두사 없는 값은 판 1 로 읽힌다', async () => {
    // 이 테스트가 곧 그 결함의 재발 방지다. 행의 crypto_version 을 보고 판을 정하면
    // 여기서 실패하고, 선생님 화면에는 "(정보 없음)" 으로 뜬다.
    const scheduleSalt = SALT_A; // 행은 crypto_version = 2
    const valueWithoutPrefix = await encrypt('이름', KEY);
    expect(await decrypt(valueWithoutPrefix, KEY, scheduleSalt)).toBe('이름');
  });

  it('판 1 일정에 판 2 값이 섞여도 소금값만 있으면 읽힌다 (반대 방향)', async () => {
    const v2Value = await encrypt('이름', KEY, SALT_A);
    expect(await decrypt(v2Value, KEY, SALT_A)).toBe('이름');
  });
});
