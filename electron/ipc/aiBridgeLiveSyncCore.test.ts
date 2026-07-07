import { describe, it, expect, beforeEach, vi } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import {
  generateControlToken,
  writeControlFile,
  readControlFile,
  removeControlFile,
  removeControlFileIfOwned,
  isHeartbeatFresh,
  writeCapability,
  readCapability,
  mergeCapability,
  isDomainWriteAllowed,
  authorizeWriteRequest,
  validateApplyWrite,
  controlPath,
  capabilityPath,
  type Capability,
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
  it.skipIf(process.platform === 'win32')('POSIX: control.json 은 소유자 전용 0600 (#8)', () => {
    // 인증 토큰이 평문으로 담기는 파일 → 소유자만 읽기/쓰기. Windows 는 권한비트 무시라 skip(best-effort).
    writeControlFile(dir, sampleControl);
    expect(fs.statSync(controlPath(dir)).mode & 0o777).toBe(0o600);
  });
});

describe('removeControlFileIfOwned (#3 재시작 레이스 방어)', () => {
  it('내 token 이면 제거, 다른(새 서버) token 이면 보존', () => {
    writeControlFile(dir, sampleControl); // token 'abc123'
    removeControlFileIfOwned(dir, 'NEW-SERVER-TOKEN'); // 다른 서버 소유 → 보존
    expect(readControlFile(dir)?.token).toBe('abc123');
    removeControlFileIfOwned(dir, 'abc123'); // 내 것 → 제거
    expect(readControlFile(dir)).toBeNull();
  });
  it('control 없으면 무동작(throw 없음)', () => {
    expect(() => removeControlFileIfOwned(dir, 'x')).not.toThrow();
    expect(readControlFile(dir)).toBeNull();
  });
  it('손상된 control 은 보존(fail-closed) — 소유 판별 불가', () => {
    fs.mkdirSync(path.dirname(controlPath(dir)), { recursive: true });
    fs.writeFileSync(controlPath(dir), '{ corrupt', 'utf-8');
    removeControlFileIfOwned(dir, 'any-token');
    expect(fs.existsSync(controlPath(dir))).toBe(true); // 손상이라도 함부로 지우지 않음(새 서버가 쓰는 중일 수 있음)
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

describe('isDomainWriteAllowed (도메인별 게이트 fail-closed)', () => {
  const caps = (p: Partial<Capability>): Capability => ({
    allowWrite: false,
    allowContent: false,
    allowGradeWrite: false,
    allowRecordWrite: false,
    updatedAt: 0,
    ...p,
  });
  it('생기부 초안(recordDrafts)은 allowRecordWrite 만 본다 — allowWrite ON 이어도 거부', () => {
    // ★ 핵심 회귀 방어: 서버가 allowWrite 로 떠 있어도 생기부 쓰기는 allowRecordWrite 없이는 거부.
    expect(isDomainWriteAllowed('recordDrafts', caps({ allowWrite: true }))).toBe(false);
    expect(isDomainWriteAllowed('recordDrafts', caps({ allowRecordWrite: true }))).toBe(true);
    expect(isDomainWriteAllowed('recordDrafts', caps({}))).toBe(false);
  });
  it('할일·일정(todos/events)은 allowWrite 만 본다 — allowRecordWrite ON 이어도 거부', () => {
    expect(isDomainWriteAllowed('todos', caps({ allowRecordWrite: true }))).toBe(false);
    expect(isDomainWriteAllowed('events', caps({ allowRecordWrite: true }))).toBe(false);
    expect(isDomainWriteAllowed('todos', caps({ allowWrite: true }))).toBe(true);
    expect(isDomainWriteAllowed('events', caps({ allowWrite: true }))).toBe(true);
  });
  it('메모(memos)는 allowWrite 만 본다 — allowRecordWrite ON 이어도 거부', () => {
    expect(isDomainWriteAllowed('memos', caps({ allowRecordWrite: true }))).toBe(false);
    expect(isDomainWriteAllowed('memos', caps({ allowWrite: true }))).toBe(true);
    expect(isDomainWriteAllowed('memos', caps({}))).toBe(false);
  });
  it('북마크(bookmarks)는 allowWrite 만 본다 — allowRecordWrite ON 이어도 거부', () => {
    expect(isDomainWriteAllowed('bookmarks', caps({ allowRecordWrite: true }))).toBe(false);
    expect(isDomainWriteAllowed('bookmarks', caps({ allowWrite: true }))).toBe(true);
    expect(isDomainWriteAllowed('bookmarks', caps({}))).toBe(false);
  });
  it('노트(notes)는 allowWrite 만 본다 — allowRecordWrite ON 이어도 거부', () => {
    expect(isDomainWriteAllowed('notes', caps({ allowRecordWrite: true }))).toBe(false);
    expect(isDomainWriteAllowed('notes', caps({ allowWrite: true }))).toBe(true);
    expect(isDomainWriteAllowed('notes', caps({}))).toBe(false);
  });
  it('수업 진도(progress)는 allowWrite 만 본다 — allowRecordWrite ON 이어도 거부', () => {
    expect(isDomainWriteAllowed('progress', caps({ allowRecordWrite: true }))).toBe(false);
    expect(isDomainWriteAllowed('progress', caps({ allowWrite: true }))).toBe(true);
    expect(isDomainWriteAllowed('progress', caps({}))).toBe(false);
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
  it('Origin 이 null/빈문자여도 거부 — 없을 때만 허용 (#9)', () => {
    // 'null' Origin(샌드박스 iframe·file: 컨텍스트)도 브라우저발이므로 차단. 헤더 부재(undefined)만 통과.
    expect(
      authorizeWriteRequest({
        method: 'POST',
        token: expectedToken,
        expectedToken,
        origin: 'null',
      }),
    ).toMatchObject({ ok: false, status: 403 });
    expect(
      authorizeWriteRequest({ method: 'POST', token: expectedToken, expectedToken, origin: '' }),
    ).toMatchObject({ ok: false, status: 403 });
    expect(
      authorizeWriteRequest({
        method: 'POST',
        token: expectedToken,
        expectedToken,
        origin: undefined,
      }).ok,
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
  it('정상 progress create — classId/date/period/unit 필수', () => {
    expect(
      validateApplyWrite({
        domain: 'progress',
        op: 'create',
        idempotencyKey: 'k',
        data: {
          classId: 'cls-1',
          date: '2026-07-07',
          period: 3,
          unit: '5단원',
          lesson: '일차함수',
          status: 'completed',
          note: '메모',
        },
      }).ok,
    ).toBe(true);
    // unit 누락 → 거부
    expect(
      validateApplyWrite({
        domain: 'progress',
        op: 'create',
        idempotencyKey: 'k',
        data: { classId: 'cls-1', date: '2026-07-07', period: 3 },
      }).ok,
    ).toBe(false);
    // period 문자열 → 거부
    expect(
      validateApplyWrite({
        domain: 'progress',
        op: 'create',
        idempotencyKey: 'k',
        data: { classId: 'cls-1', date: '2026-07-07', period: '3', unit: 'x' },
      }).ok,
    ).toBe(false);
  });
  it('progress — status enum·허용 밖 필드·update 의 classId 변경 거부', () => {
    expect(
      validateApplyWrite({
        domain: 'progress',
        op: 'create',
        idempotencyKey: 'k',
        data: { classId: 'c', date: '2026-07-07', period: 1, unit: 'x', status: 'done' },
      }).ok,
    ).toBe(false);
    expect(
      validateApplyWrite({
        domain: 'progress',
        op: 'create',
        idempotencyKey: 'k',
        data: { classId: 'c', date: '2026-07-07', period: 1, unit: 'x', evil: 1 },
      }).ok,
    ).toBe(false);
    // update 는 classId 를 받지 않는다(소속 반 변경 불가).
    expect(
      validateApplyWrite({
        domain: 'progress',
        op: 'update',
        idempotencyKey: 'k',
        data: { id: 'p1', classId: 'other' },
      }).ok,
    ).toBe(false);
    expect(
      validateApplyWrite({
        domain: 'progress',
        op: 'update',
        idempotencyKey: 'k',
        data: { id: 'p1', status: 'skipped' },
      }).ok,
    ).toBe(true);
    expect(
      validateApplyWrite({
        domain: 'progress',
        op: 'delete',
        idempotencyKey: 'k',
        data: { id: 'p1' },
      }).ok,
    ).toBe(true);
    // complete 는 서버 검증 단계에서도 거부(렌더러 거부와 대칭).
    expect(
      validateApplyWrite({
        domain: 'progress',
        op: 'complete',
        idempotencyKey: 'k',
        data: { id: 'p1' },
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

  it('#5 todos update: out-of-spec 필드값 거부(브릿지와 동일 강도)', () => {
    const base = { domain: 'todos', op: 'update', idempotencyKey: 'k' } as const;
    expect(validateApplyWrite({ ...base, data: { id: 't', priority: 'urgent' } }).ok).toBe(false);
    expect(validateApplyWrite({ ...base, data: { id: 't', status: 'archived' } }).ok).toBe(false);
    expect(validateApplyWrite({ ...base, data: { id: 't', dueDate: '2026/06/25' } }).ok).toBe(
      false,
    );
    expect(validateApplyWrite({ ...base, data: { id: 't', time: '9시' } }).ok).toBe(false);
    expect(validateApplyWrite({ ...base, data: { id: 't', text: 'x'.repeat(501) } }).ok).toBe(
      false,
    );
    // 정상 update 는 통과(존재하는 필드만 검사 — id 필수는 렌더러가 본다)
    expect(
      validateApplyWrite({ ...base, data: { id: 't', priority: 'low', status: 'done' } }).ok,
    ).toBe(true);
  });

  it('#5 events update: title>200·잘못된 date 거부, 정상은 통과', () => {
    const base = { domain: 'events', op: 'update', idempotencyKey: 'k' } as const;
    expect(validateApplyWrite({ ...base, data: { id: 'e', title: '가'.repeat(201) } }).ok).toBe(
      false,
    );
    expect(validateApplyWrite({ ...base, data: { id: 'e', date: '20260625' } }).ok).toBe(false);
    expect(
      validateApplyWrite({ ...base, data: { id: 'e', title: '수정', date: '2026-06-25' } }).ok,
    ).toBe(true);
  });

  it('#5 create 도 필드값 검증: priority enum 위반 거부', () => {
    expect(
      validateApplyWrite({
        domain: 'todos',
        op: 'create',
        idempotencyKey: 'k',
        data: { text: '시험지', priority: 'boom' },
      }).ok,
    ).toBe(false);
  });

  it('#5 out-of-spec 필드 거부(strict allowlist) — unknown / startDate / completed / description', () => {
    // 브리지 스키마 밖 필드는 서버에서 거부(렌더러 drop 에만 의존하지 않음).
    expect(
      validateApplyWrite({
        domain: 'todos',
        op: 'create',
        idempotencyKey: 'k',
        data: { text: 'x', evil: '1' },
      }).ok,
    ).toBe(false);
    expect(
      validateApplyWrite({
        domain: 'todos',
        op: 'create',
        idempotencyKey: 'k',
        data: { text: 'x', startDate: '2026-06-25' },
      }).ok,
    ).toBe(false);
    expect(
      validateApplyWrite({
        domain: 'todos',
        op: 'update',
        idempotencyKey: 'k',
        data: { id: 't', completed: true },
      }).ok,
    ).toBe(false);
    expect(
      validateApplyWrite({
        domain: 'events',
        op: 'update',
        idempotencyKey: 'k',
        data: { id: 'e', description: 'd' },
      }).ok,
    ).toBe(false);
    // 허용 필드만이면 통과
    expect(
      validateApplyWrite({
        domain: 'todos',
        op: 'create',
        idempotencyKey: 'k',
        data: { text: 'x', dueDate: '2026-06-25' },
      }).ok,
    ).toBe(true);
    expect(
      validateApplyWrite({
        domain: 'events',
        op: 'update',
        idempotencyKey: 'k',
        data: { id: 'e', location: '운동장' },
      }).ok,
    ).toBe(true);
  });

  it('#7 idempotencyKey 길이 상한(256) — 렌더러 localStorage 용량 bounded', () => {
    expect(
      validateApplyWrite({
        domain: 'todos',
        op: 'create',
        idempotencyKey: 'k'.repeat(257),
        data: { text: 'x' },
      }).ok,
    ).toBe(false);
    expect(
      validateApplyWrite({
        domain: 'todos',
        op: 'create',
        idempotencyKey: 'k'.repeat(256),
        data: { text: 'x' },
      }).ok,
    ).toBe(true);
  });

  it('memos create: content 필수 + color enum + 2000자 상한 + out-of-spec 거부', () => {
    const base = { domain: 'memos', op: 'create', idempotencyKey: 'k' } as const;
    expect(validateApplyWrite({ ...base, data: {} }).ok).toBe(false); // content 누락
    expect(validateApplyWrite({ ...base, data: { content: '   ' } }).ok).toBe(false); // 공백만
    expect(validateApplyWrite({ ...base, data: { content: '메모', color: 'purple' } }).ok).toBe(
      false,
    ); // color enum
    expect(validateApplyWrite({ ...base, data: { content: 'x'.repeat(2001) } }).ok).toBe(false); // 길이
    expect(validateApplyWrite({ ...base, data: { content: 'x', evil: '1' } }).ok).toBe(false); // out-of-spec
    expect(validateApplyWrite({ ...base, data: { content: '회의 메모', color: 'green' } }).ok).toBe(
      true,
    );
  });

  it('memos update: id 핸들 + content/color/archived 만 허용, archived 타입 검증', () => {
    const base = { domain: 'memos', op: 'update', idempotencyKey: 'k' } as const;
    expect(validateApplyWrite({ ...base, data: { id: 'm', archived: 'yes' } }).ok).toBe(false); // boolean 아님
    expect(validateApplyWrite({ ...base, data: { id: 'm', evil: 1 } }).ok).toBe(false); // out-of-spec
    expect(
      validateApplyWrite({ ...base, data: { id: 'm', content: '수정', archived: true } }).ok,
    ).toBe(true);
  });

  it('memos delete: id 핸들만 허용', () => {
    expect(
      validateApplyWrite({ domain: 'memos', op: 'delete', idempotencyKey: 'k', data: { id: 'm' } })
        .ok,
    ).toBe(true);
    expect(
      validateApplyWrite({
        domain: 'memos',
        op: 'delete',
        idempotencyKey: 'k',
        data: { id: 'm', content: 'x' },
      }).ok,
    ).toBe(false);
  });

  it('bookmarks create(group): kind+name 필수', () => {
    const base = { domain: 'bookmarks', op: 'create', idempotencyKey: 'k' } as const;
    expect(validateApplyWrite({ ...base, data: { name: '업무' } }).ok).toBe(false); // kind 누락
    expect(validateApplyWrite({ ...base, data: { kind: 'group' } }).ok).toBe(false); // name 누락
    expect(
      validateApplyWrite({ ...base, data: { kind: 'group', name: '업무', emoji: '💼' } }).ok,
    ).toBe(true);
  });

  it('bookmarks create(bookmark): name+url(http)+groupId 필수, 비-http 거부', () => {
    const base = { domain: 'bookmarks', op: 'create', idempotencyKey: 'k' } as const;
    expect(
      validateApplyWrite({ ...base, data: { kind: 'bookmark', name: 'x', url: 'https://x.com' } })
        .ok,
    ).toBe(false); // groupId 누락
    expect(
      validateApplyWrite({
        ...base,
        data: { kind: 'bookmark', name: 'x', url: 'ftp://x', groupId: 'g' },
      }).ok,
    ).toBe(false); // 비-http
    expect(
      validateApplyWrite({
        ...base,
        data: { kind: 'bookmark', name: 'x', url: 'https://x.com', groupId: 'g' },
      }).ok,
    ).toBe(true);
  });

  it('bookmarks update: id + name/url(http) 만 허용, out-of-spec 거부', () => {
    const base = { domain: 'bookmarks', op: 'update', idempotencyKey: 'k' } as const;
    expect(validateApplyWrite({ ...base, data: { id: 'b', url: 'notaurl' } }).ok).toBe(false);
    expect(validateApplyWrite({ ...base, data: { id: 'b', groupId: 'g2' } }).ok).toBe(false); // groupId 는 update 불가
    expect(
      validateApplyWrite({ ...base, data: { id: 'b', name: '새이름', url: 'https://y.com' } }).ok,
    ).toBe(true);
  });

  it('bookmarks delete: id 핸들만 허용', () => {
    expect(
      validateApplyWrite({
        domain: 'bookmarks',
        op: 'delete',
        idempotencyKey: 'k',
        data: { id: 'b' },
      }).ok,
    ).toBe(true);
    expect(
      validateApplyWrite({
        domain: 'bookmarks',
        op: 'delete',
        idempotencyKey: 'k',
        data: { id: 'b', name: 'x' },
      }).ok,
    ).toBe(false);
  });

  it('notes create: kind별 필수 필드(notebook=title, section=+notebookId, page=+sectionId)', () => {
    const base = { domain: 'notes', op: 'create', idempotencyKey: 'k' } as const;
    expect(validateApplyWrite({ ...base, data: { title: 'x' } }).ok).toBe(false); // kind 누락
    expect(validateApplyWrite({ ...base, data: { kind: 'notebook' } }).ok).toBe(false); // title 누락
    expect(validateApplyWrite({ ...base, data: { kind: 'notebook', title: '상담일지' } }).ok).toBe(
      true,
    );
    expect(validateApplyWrite({ ...base, data: { kind: 'section', title: '6월' } }).ok).toBe(false); // notebookId 누락
    expect(
      validateApplyWrite({ ...base, data: { kind: 'section', title: '6월', notebookId: 'n' } }).ok,
    ).toBe(true);
    expect(validateApplyWrite({ ...base, data: { kind: 'page', title: '오늘' } }).ok).toBe(false); // sectionId 누락
    expect(
      validateApplyWrite({
        ...base,
        data: { kind: 'page', title: '오늘', sectionId: 's', body: '내용' },
      }).ok,
    ).toBe(true);
  });

  it('notes update: id + title/body/pinned 만 허용, out-of-spec·타입 위반 거부', () => {
    const base = { domain: 'notes', op: 'update', idempotencyKey: 'k' } as const;
    expect(validateApplyWrite({ ...base, data: { id: 'p', pinned: 'yes' } }).ok).toBe(false); // boolean 아님
    expect(validateApplyWrite({ ...base, data: { id: 'p', sectionId: 's2' } }).ok).toBe(false); // 이동 불가
    expect(
      validateApplyWrite({ ...base, data: { id: 'p', title: '제목', body: '본문', pinned: true } })
        .ok,
    ).toBe(true);
  });

  it('notes delete: id 핸들만 허용', () => {
    expect(
      validateApplyWrite({ domain: 'notes', op: 'delete', idempotencyKey: 'k', data: { id: 'p' } })
        .ok,
    ).toBe(true);
    expect(
      validateApplyWrite({
        domain: 'notes',
        op: 'delete',
        idempotencyKey: 'k',
        data: { id: 'p', title: 'x' },
      }).ok,
    ).toBe(false);
  });

  it('attendance create: classId/date/period + students enum 검증', () => {
    const base = { domain: 'attendance', op: 'create', idempotencyKey: 'k' } as const;
    expect(
      validateApplyWrite({
        ...base,
        data: {
          classId: 'c1',
          date: '2026-06-02',
          period: 3,
          students: [{ number: 5, status: 'late', reason: '미인정' }],
        },
      }).ok,
    ).toBe(true);
    expect(
      validateApplyWrite({
        ...base,
        data: {
          classId: 'c1',
          date: '2026-06-02',
          period: 3,
          students: [{ number: 5, status: '결석' }],
        },
      }).ok,
    ).toBe(false); // status enum 위반
    expect(
      validateApplyWrite({
        ...base,
        data: { classId: 'c1', date: '2026-06-02', period: 21, students: [] },
      }).ok,
    ).toBe(false); // period 범위 위반
    expect(
      validateApplyWrite({ ...base, data: { date: '2026-06-02', period: 3, students: [] } }).ok,
    ).toBe(false); // classId 누락
    expect(
      validateApplyWrite({
        ...base,
        data: { classId: 'c1', date: '20260602', period: 3, students: [] },
      }).ok,
    ).toBe(false); // date 형식 위반
  });

  it('attendance: 현재 학년도 밖 날짜는 확인 요청 후 확인값이 있으면 허용', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T00:00:00+09:00'));
    try {
      const base = { domain: 'attendance', op: 'create', idempotencyKey: 'k' } as const;
      const data = {
        classId: 'c1',
        date: '2025-06-22',
        period: 3,
        students: [{ number: 5, status: 'present' }],
      };
      const first = validateApplyWrite({ ...base, data });
      expect(first.ok).toBe(false);
      expect(first.ok === false ? first.reason : '').toContain(
        'confirmOutOfCurrentSchoolYearDate="2025-06-22"',
      );
      expect(
        validateApplyWrite({
          ...base,
          data: { ...data, confirmOutOfCurrentSchoolYearDate: '2025-06-22' },
        }).ok,
      ).toBe(true);
      expect(
        validateApplyWrite({
          ...base,
          data: { ...data, confirmOutOfCurrentSchoolYearDate: '2025-06-21' },
        }).ok,
      ).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('attendance: create/delete 만 지원(update 거부)', () => {
    expect(
      validateApplyWrite({
        domain: 'attendance',
        op: 'delete',
        idempotencyKey: 'k',
        data: { classId: 'c1', date: '2026-06-02', period: 3 },
      }).ok,
    ).toBe(true);
    expect(
      validateApplyWrite({
        domain: 'attendance',
        op: 'update',
        idempotencyKey: 'k',
        data: { classId: 'c1', date: '2026-06-02', period: 3 },
      }).ok,
    ).toBe(false);
  });

  it('homeroomAttendance create: allDay 또는 periods (둘 다/둘 다아님 거부)', () => {
    const base = { domain: 'homeroomAttendance', op: 'create', idempotencyKey: 'k' } as const;
    expect(
      validateApplyWrite({
        ...base,
        data: {
          date: '2026-06-01',
          students: [{ number: 1, allDay: { status: 'absent', reason: '질병' } }],
        },
      }).ok,
    ).toBe(true);
    expect(
      validateApplyWrite({
        ...base,
        data: {
          date: '2026-06-02',
          students: [{ number: 13, periods: [{ period: 0, status: 'late', reason: '미인정' }] }],
        },
      }).ok,
    ).toBe(true);
    expect(
      validateApplyWrite({
        ...base,
        data: {
          date: '2026-06-01',
          students: [
            { number: 1, allDay: { status: 'absent' }, periods: [{ period: 1, status: 'late' }] },
          ],
        },
      }).ok,
    ).toBe(false); // allDay + periods 동시
    expect(
      validateApplyWrite({ ...base, data: { date: '2026-06-01', students: [{ number: 1 }] } }).ok,
    ).toBe(false); // 둘 다 없음
    expect(validateApplyWrite({ ...base, data: { date: '2026-06-01', students: [] } }).ok).toBe(
      false,
    ); // students 빈 배열
    expect(
      validateApplyWrite({
        ...base,
        data: { date: '2026-06-01', students: [{ number: 1, allDay: { status: 'xxx' } }] },
      }).ok,
    ).toBe(false); // status enum 위반
  });

  it('homeroomAttendance: 현재 학년도 밖 날짜는 확인 요청 후 확인값이 있으면 허용', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T00:00:00+09:00'));
    try {
      const base = { domain: 'homeroomAttendance', op: 'create', idempotencyKey: 'k' } as const;
      const data = {
        date: '2025-06-22',
        students: [{ number: 1, allDay: { status: 'absent', reason: '인정' } }],
      };
      const first = validateApplyWrite({ ...base, data });
      expect(first.ok).toBe(false);
      expect(first.ok === false ? first.reason : '').toContain(
        'confirmOutOfCurrentSchoolYearDate="2025-06-22"',
      );
      expect(
        validateApplyWrite({
          ...base,
          data: { ...data, confirmOutOfCurrentSchoolYearDate: '2025-06-22' },
        }).ok,
      ).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('homeroomAttendance: create 만 지원(delete 거부)', () => {
    expect(
      validateApplyWrite({
        domain: 'homeroomAttendance',
        op: 'delete',
        idempotencyKey: 'k',
        data: { date: '2026-06-01', students: [{ number: 1, allDay: { status: 'absent' } }] },
      }).ok,
    ).toBe(false);
  });

  it('observations create: studentId+content 필수, 길이·필드·형식 검증', () => {
    const base = { domain: 'observations', op: 'create', idempotencyKey: 'k' } as const;
    expect(
      validateApplyWrite({ ...base, data: { studentId: 's1', content: '발표 잘함' } }).ok,
    ).toBe(true);
    expect(
      validateApplyWrite({
        ...base,
        data: { studentId: 's1', content: 'x', classId: 'c1', tags: ['a'], date: '2026-06-22' },
      }).ok,
    ).toBe(true);
    expect(validateApplyWrite({ ...base, data: { content: 'x' } }).ok).toBe(false); // studentId 누락
    expect(validateApplyWrite({ ...base, data: { studentId: 's1' } }).ok).toBe(false); // content 누락
    expect(
      validateApplyWrite({ ...base, data: { studentId: 's1', content: 'a'.repeat(501) } }).ok,
    ).toBe(false); // 길이 초과
    expect(
      validateApplyWrite({ ...base, data: { studentId: 's1', content: 'x', tags: [1] } }).ok,
    ).toBe(false); // tags 비문자열
    expect(
      validateApplyWrite({ ...base, data: { studentId: 's1', content: 'x', date: '2026/06/22' } })
        .ok,
    ).toBe(false); // date 형식
    expect(
      validateApplyWrite({ ...base, data: { studentId: 's1', content: 'x', foo: 1 } }).ok,
    ).toBe(false); // out-of-spec 필드
  });

  it('observations: create 만 지원(delete 거부)', () => {
    expect(
      validateApplyWrite({
        domain: 'observations',
        op: 'delete',
        idempotencyKey: 'k',
        data: { studentId: 's1', content: 'x' },
      }).ok,
    ).toBe(false);
  });

  it('recordNote create: 형태 검증(studentId·categoryId·subcategory 필수, content≤2000, 필드제한)', () => {
    const base = { domain: 'recordNote', op: 'create', idempotencyKey: 'k' } as const;
    expect(
      validateApplyWrite({
        ...base,
        data: {
          studentId: 's1',
          categoryId: 'life',
          subcategory: '칭찬',
          content: '분리수거 정리',
        },
      }).ok,
    ).toBe(true);
    expect(
      validateApplyWrite({
        ...base,
        data: {
          studentId: 's1',
          categoryId: 'life',
          subcategory: '칭찬',
          content: 'x',
          date: '2026-06-22',
        },
      }).ok,
    ).toBe(true);
    expect(
      validateApplyWrite({
        ...base,
        data: { categoryId: 'life', subcategory: '칭찬', content: 'x' },
      }).ok,
    ).toBe(false); // studentId 누락
    expect(
      validateApplyWrite({ ...base, data: { studentId: 's1', subcategory: '칭찬', content: 'x' } })
        .ok,
    ).toBe(false); // categoryId 누락
    expect(
      validateApplyWrite({ ...base, data: { studentId: 's1', categoryId: 'life', content: 'x' } })
        .ok,
    ).toBe(false); // subcategory 누락
    expect(
      validateApplyWrite({
        ...base,
        data: { studentId: 's1', categoryId: 'life', subcategory: '칭찬' },
      }).ok,
    ).toBe(false); // content 누락
    expect(
      validateApplyWrite({
        ...base,
        data: {
          studentId: 's1',
          categoryId: 'life',
          subcategory: '칭찬',
          content: 'a'.repeat(2001),
        },
      }).ok,
    ).toBe(false); // 길이 초과
    expect(
      validateApplyWrite({
        ...base,
        data: { studentId: 's1', categoryId: 'life', subcategory: '칭찬', content: 'x', bar: 1 },
      }).ok,
    ).toBe(false); // out-of-spec 필드
  });

  it('recordNote: create 만 지원(delete 거부)', () => {
    expect(
      validateApplyWrite({
        domain: 'recordNote',
        op: 'delete',
        idempotencyKey: 'k',
        data: { studentId: 's1', categoryId: 'life', subcategory: '칭찬', content: 'x' },
      }).ok,
    ).toBe(false);
  });
});
