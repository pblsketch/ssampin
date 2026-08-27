/**
 * assignmentConnectHandlers.meta.test.ts — 과제수합 [Google 계정 연결하기]는 한 길로만 간다
 *
 * 왜 이 파일이 있나 — 과제수합 화면은 셋이다(담임 과제·쌤도구 과제·수업반 과제).
 * 2026-08-27 신고("재로그인해도 학생이 못 냄")를 고칠 때 화면마다 같은 핸들러를 손으로
 * 고쳤는데, **수업반 과제 화면 하나가 옛 코드로 남았다.** 그 화면을 쓰는 교사에게는
 * 고친 것이 아무 소용이 없었고, 리뷰에서야 발견됐다.
 *
 * 저장소에 이미 같은 함정의 기록이 있다(쌤도구 목록이 두 군데라 한쪽만 고쳐 오답이 난 건).
 * 그래서 "모든 과제수합 화면이 같은 훅을 쓴다"를 사람 눈이 아니라 이 테스트가 지킨다.
 *
 * 대상을 **목록으로 박아 두지 않고 찾아낸다** — 목록을 박아 두면 네 번째 화면이 생겼을 때
 * 목록에 추가하는 걸 잊어 똑같은 사고가 난다. 그래서 "useAssignmentStore 를 쓰면서
 * needsGoogleConnect 를 다루는 파일"을 훑어 대상으로 삼는다. 그런 파일은 곧 연결 안내
 * 패널을 그리는 화면이다. (온라인 교무실에도 같은 이름의 상태가 있지만 그건
 * useStaffRoomStore 것이라 useAssignmentStore 조건에서 걸러진다.)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const COMPONENTS_DIR = resolve(REPO_ROOT, 'src', 'adapters', 'components');
const HOOK_PATH = 'src/adapters/hooks/useAssignmentGoogleConnect.ts';

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/** 과제수합 연결 안내를 그리는 화면 전부 (경로를 박지 않고 찾아낸다) */
const assignmentConnectScreens = walk(COMPONENTS_DIR)
  .filter((full) => {
    const src = readFileSync(full, 'utf-8');
    return src.includes('useAssignmentStore') && src.includes('needsGoogleConnect');
  })
  .map((full) => relative(REPO_ROOT, full).split('\\').join('/'));

function readSource(relPath: string): string {
  return readFileSync(resolve(REPO_ROOT, relPath), 'utf-8');
}

describe('과제수합 화면들은 같은 연결 경로를 쓴다', () => {
  it('연결 안내를 그리는 화면을 찾아냈다 (탐색이 0건이면 이 가드는 아무것도 지키지 않는다)', () => {
    expect(assignmentConnectScreens.length).toBeGreaterThanOrEqual(3);
  });

  it.each(assignmentConnectScreens)('%s 는 useAssignmentGoogleConnect 훅을 쓴다', (relPath) => {
    expect(readSource(relPath)).toContain('useAssignmentGoogleConnect');
  });

  it.each(assignmentConnectScreens)(
    '%s 는 연결 동작을 자체 구현하지 않는다 (한쪽만 고쳐지는 사고 방지)',
    (relPath) => {
      const src = readSource(relPath);
      // function 선언형과 화살표형을 둘 다 막는다.
      // 훅을 받는 `const handleGoogleConnect = useAssignmentGoogleConnect();` 는 통과해야 하므로
      // "= 다음에 곧바로 여는 괄호(또는 async)" 인 경우만 자체 구현으로 본다.
      expect(src).not.toMatch(/function\s+handleGoogleConnect/);
      expect(src).not.toMatch(/handleGoogleConnect\s*=\s*(async\s*)?\(/);
      // useCallback 으로 감싸도 자체 구현이다
      expect(src).not.toMatch(/handleGoogleConnect\s*=\s*useCallback\(/);
    },
  );

  it('★ 훅은 로그인만으로 끝내지 않고 서버 토큰까지 다시 맞춘다', () => {
    // 이 호출이 빠지면 "앱은 멀쩡한데 학생만 못 내는" 신고 상태로 그대로 돌아간다.
    expect(readSource(HOOK_PATH)).toContain('reconnectGoogleDrive');
  });

  it('★ 훅은 인증 창을 그냥 닫았을 때 성공으로 처리하지 않는다', () => {
    // startAuth 는 취소·거부에도 throw 하지 않는다. throw 만 믿으면 취소가 성공이 된다.
    expect(readSource(HOOK_PATH)).toContain('isConnected');
  });
});
