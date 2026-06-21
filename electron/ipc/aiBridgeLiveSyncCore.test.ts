import { describe, it, expect, beforeEach } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import {
  generateControlToken,
  writeControlFile,
  readControlFile,
  removeControlFile,
  isHeartbeatFresh,
  writeCapability,
  readCapability,
  mergeCapability,
  authorizeWriteRequest,
  validateApplyWrite,
  controlPath,
  capabilityPath,
  type ControlInfo,
} from './aiBridgeLiveSyncCore';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sab-livesync-'));
});

const sampleControl: ControlInfo = {
  port: 51234,
  token: 'abc123',
  pid: 4242,
  heartbeatAt: 1_000_000,
};

describe('generateControlToken', () => {
  it('urlsafe 토큰(32자 내외) + 매번 다름', () => {
    const a = generateControlToken();
    const b = generateControlToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThanOrEqual(30);
    expect(a).not.toBe(b);
  });
});

describe('control 파일 round-trip', () => {
  it('write→read 동일, 경로는 .ssampin-aibridge/control.json', () => {
    writeControlFile(dir, sampleControl);
    expect(controlPath(dir)).toBe(path.join(dir, '.ssampin-aibridge', 'control.json'));
    expect(readControlFile(dir)).toEqual(sampleControl);
  });
  it('없음/손상/형식위반 → null', () => {
    expect(readControlFile(dir)).toBeNull();
    fs.mkdirSync(path.dirname(controlPath(dir)), { recursive: true });
    fs.writeFileSync(controlPath(dir), '{ broken', 'utf-8');
    expect(readControlFile(dir)).toBeNull();
    fs.writeFileSync(controlPath(dir), JSON.stringify({ port: 'x', token: 1 }), 'utf-8');
    expect(readControlFile(dir)).toBeNull();
  });
  it('remove 후 read → null', () => {
    writeControlFile(dir, sampleControl);
    removeControlFile(dir);
    expect(readControlFile(dir)).toBeNull();
  });
});

describe('isHeartbeatFresh (fail-closed)', () => {
  const info = { ...sampleControl, heartbeatAt: 1_000_000 };
  it('maxAge 이내면 fresh', () => {
    expect(isHeartbeatFresh(info, 1_000_000 + 4_000, 5_000)).toBe(true);
    expect(isHeartbeatFresh(info, 1_000_000, 5_000)).toBe(true);
  });
  it('오래되면 stale', () => {
    expect(isHeartbeatFresh(info, 1_000_000 + 6_000, 5_000)).toBe(false);
  });
  it('과도하게 미래(>1s) 면 stale(시계 조작/좀비 방어)', () => {
    expect(isHeartbeatFresh(info, 1_000_000 - 2_000, 5_000)).toBe(false);
  });
});

describe('capability (fail-closed 기본 OFF)', () => {
  it('파일 없으면 모두 false', () => {
    expect(readCapability(dir)).toEqual({
      allowWrite: false,
      allowContent: false,
      allowGradeWrite: false,
      allowRecordWrite: false,
      updatedAt: 0,
    });
  });
  it('write→read 반영, 경로 확인', () => {
    writeCapability(dir, {
      allowWrite: true,
      allowContent: false,
      allowGradeWrite: false,
      allowRecordWrite: false,
      updatedAt: 123,
    });
    expect(capabilityPath(dir)).toBe(path.join(dir, '.ssampin-aibridge', 'capability.json'));
    expect(readCapability(dir)).toEqual({
      allowWrite: true,
      allowContent: false,
      allowGradeWrite: false,
      allowRecordWrite: false,
      updatedAt: 123,
    });
  });
  it('채점쓰기(allowGradeWrite) 독립 토글 round-trip (#11)', () => {
    writeCapability(dir, {
      allowWrite: false,
      allowContent: true,
      allowGradeWrite: true,
      allowRecordWrite: false,
      updatedAt: 7,
    });
    expect(readCapability(dir)).toEqual({
      allowWrite: false,
      allowContent: true,
      allowGradeWrite: true,
      allowRecordWrite: false,
      updatedAt: 7,
    });
  });
  it('생기부 초안 쓰기(allowRecordWrite) 독립 토글 round-trip', () => {
    writeCapability(dir, {
      allowWrite: false,
      allowContent: false,
      allowGradeWrite: false,
      allowRecordWrite: true,
      updatedAt: 9,
    });
    expect(readCapability(dir)).toEqual({
      allowWrite: false,
      allowContent: false,
      allowGradeWrite: false,
      allowRecordWrite: true,
      updatedAt: 9,
    });
  });
  it('손상 파일 → fail-closed', () => {
    fs.mkdirSync(path.dirname(capabilityPath(dir)), { recursive: true });
    fs.writeFileSync(capabilityPath(dir), 'nope', 'utf-8');
    expect(readCapability(dir).allowWrite).toBe(false);
    expect(readCapability(dir).allowGradeWrite).toBe(false);
  });
});

describe('mergeCapability (부분 갱신 + 미지 필드 보존)', () => {
  it('지정한 토글만 바꾸고 나머지는 보존', () => {
    writeCapability(dir, {
      allowWrite: true,
      allowContent: false,
      allowGradeWrite: false,
      allowRecordWrite: false,
      updatedAt: 1,
    });
    const after = mergeCapability(dir, { allowContent: true });
    expect(after.allowContent).toBe(true);
    expect(after.allowWrite).toBe(true); // 보존
    expect(after.allowGradeWrite).toBe(false);
  });
  it('false 명시도 반영(끄기)', () => {
    writeCapability(dir, {
      allowWrite: true,
      allowContent: true,
      allowGradeWrite: true,
      allowRecordWrite: false,
      updatedAt: 1,
    });
    expect(mergeCapability(dir, { allowWrite: false }).allowWrite).toBe(false);
  });
  it('이 타입이 모르는 필드(allowRecordWrite)도 보존 — 토글 한 번에 다른 기능 안 꺼짐 (codex MED #4)', () => {
    // 다른 기능(생기부 초안 쓰기)이 켠 토글을 시뮬레이션.
    fs.mkdirSync(path.dirname(capabilityPath(dir)), { recursive: true });
    fs.writeFileSync(
      capabilityPath(dir),
      JSON.stringify({
        allowWrite: false,
        allowContent: false,
        allowGradeWrite: false,
        allowRecordWrite: true,
        updatedAt: 1,
      }),
      'utf-8',
    );
    mergeCapability(dir, { allowContent: true }); // 읽기만 토글
    const rawAfter = JSON.parse(fs.readFileSync(capabilityPath(dir), 'utf-8'));
    expect(rawAfter.allowRecordWrite).toBe(true); // 보존됨(클로버 방지)
    expect(rawAfter.allowContent).toBe(true);
  });
  it('파일 없으면 미지정 토글은 false 로 생성(fail-closed)', () => {
    const after = mergeCapability(dir, { allowGradeWrite: true });
    expect(after).toMatchObject({ allowWrite: false, allowContent: false, allowGradeWrite: true });
  });
});

describe('authorizeWriteRequest', () => {
  const expectedToken = 'secret-token-xyz';
  it('POST + 토큰일치 + Origin 없음 → ok', () => {
    expect(
      authorizeWriteRequest({
        method: 'POST',
        token: expectedToken,
        expectedToken,
        origin: undefined,
      }),
    ).toEqual({ ok: true });
  });
  it('GET 등 비-POST → 405', () => {
    const r = authorizeWriteRequest({
      method: 'GET',
      token: expectedToken,
      expectedToken,
      origin: undefined,
    });
    expect(r).toMatchObject({ ok: false, status: 405 });
  });
  it('Origin 헤더 있으면 → 403 (브라우저 SSRF 차단)', () => {
    const r = authorizeWriteRequest({
      method: 'POST',
      token: expectedToken,
      expectedToken,
      origin: 'http://evil.local',
    });
    expect(r).toMatchObject({ ok: false, status: 403 });
  });
  it('Origin 이 null/빈문자면 허용(일부 클라이언트)', () => {
    expect(
      authorizeWriteRequest({ method: 'POST', token: expectedToken, expectedToken, origin: 'null' })
        .ok,
    ).toBe(true);
  });
  it('토큰 불일치/누락 → 401', () => {
    expect(
      authorizeWriteRequest({ method: 'POST', token: 'wrong', expectedToken, origin: undefined }),
    ).toMatchObject({ ok: false, status: 401 });
    expect(
      authorizeWriteRequest({ method: 'POST', token: undefined, expectedToken, origin: undefined }),
    ).toMatchObject({ ok: false, status: 401 });
  });
});

describe('validateApplyWrite', () => {
  it('정상 todo create', () => {
    const r = validateApplyWrite({
      domain: 'todos',
      op: 'create',
      idempotencyKey: 'k1',
      data: { text: '시험지 인쇄' },
    });
    expect(r.ok).toBe(true);
  });
  it('정상 event create(date 필수)', () => {
    expect(
      validateApplyWrite({
        domain: 'events',
        op: 'create',
        idempotencyKey: 'k',
        data: { title: '체육대회', date: '2026-06-25' },
      }).ok,
    ).toBe(true);
    expect(
      validateApplyWrite({
        domain: 'events',
        op: 'create',
        idempotencyKey: 'k',
        data: { title: '체육대회' },
      }).ok,
    ).toBe(false);
  });
  it('알 수 없는 domain/op 거부', () => {
    expect(
      validateApplyWrite({ domain: 'students', op: 'create', idempotencyKey: 'k', data: {} }).ok,
    ).toBe(false);
    expect(
      validateApplyWrite({ domain: 'todos', op: 'nuke', idempotencyKey: 'k', data: {} }).ok,
    ).toBe(false);
  });
  it('멱등키 누락/빈 data 거부, create text 누락 거부', () => {
    expect(
      validateApplyWrite({ domain: 'todos', op: 'create', idempotencyKey: '', data: { text: 'x' } })
        .ok,
    ).toBe(false);
    expect(
      validateApplyWrite({ domain: 'todos', op: 'create', idempotencyKey: 'k', data: {} }).ok,
    ).toBe(false);
    expect(validateApplyWrite(null).ok).toBe(false);
  });
  it('정상 recordDrafts create(area+studentRef+content 필수)', () => {
    expect(
      validateApplyWrite({
        domain: 'recordDrafts',
        op: 'create',
        idempotencyKey: 'k',
        data: { area: 'career', studentRef: 's1', content: '진로 탐색' },
      }).ok,
    ).toBe(true);
  });
  it('recordDrafts: 잘못된 area / studentRef·content 누락 거부', () => {
    expect(
      validateApplyWrite({
        domain: 'recordDrafts',
        op: 'create',
        idempotencyKey: 'k',
        data: { area: 'bogus', studentRef: 's1', content: 'x' },
      }).ok,
    ).toBe(false);
    expect(
      validateApplyWrite({
        domain: 'recordDrafts',
        op: 'create',
        idempotencyKey: 'k',
        data: { area: 'career', content: 'x' },
      }).ok,
    ).toBe(false);
  });
  it('recordDrafts: create 외 연산(update/delete) 거부', () => {
    expect(
      validateApplyWrite({
        domain: 'recordDrafts',
        op: 'update',
        idempotencyKey: 'k',
        data: { area: 'career', studentRef: 's1', content: 'x' },
      }).ok,
    ).toBe(false);
  });
});
