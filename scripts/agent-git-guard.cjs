#!/usr/bin/env node
'use strict';
/*
 * git-guard — Claude Code·Codex 공용 PreToolUse 훅
 *
 * 여러 Claude Code 세션이 같은 워킹 디렉터리를 공유할 때, 다른 세션의 미커밋 작업을
 * 날리거나 브랜치를 빼앗는 위험한 blanket git 명령을 차단한다. (CLAUDE.md "다중 세션 협업 프로토콜")
 *
 * 입력: stdin 으로 { tool_name, tool_input: { command } } JSON
 * 출력: 차단 시 { hookSpecificOutput: { hookEventName:"PreToolUse", permissionDecision:"deny", permissionDecisionReason } }
 *       그 외에는 아무것도 출력하지 않고 exit 0 → 도구 그대로 진행.
 */
const { execSync } = require('node:child_process');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let cmd = '';
  let inputCwd = process.cwd();
  try {
    const input = JSON.parse(raw);
    if (
      input &&
      input.tool_name &&
      !['Bash', 'exec_command', 'shell_command'].includes(input.tool_name)
    )
      return process.exit(0);
    inputCwd = input.cwd || process.cwd();
    cmd = String(
      (input && input.tool_input && (input.tool_input.command || input.tool_input.cmd)) || '',
    );
  } catch {
    return process.exit(0);
  }
  cmd = cmd.replace(/\r?\n/g, ';').replace(/\bgit\.exe\b/gi, 'git');
  // 연결된 셸 명령도 같은 정책으로 검사한다.
  if (!/(^|&&|\|\||;)\s*git\s/.test(cmd)) return process.exit(0);

  const PROTO = "(AGENTS.md 'AI 에이전트 작업 워크플로우' 참고)";
  // 명령 시작 또는 && / ; 직후의 git 만 잡는다(따옴표 안 문자열의 git 언급은 제외).
  const G = '(?:^|&&|\\|\\||;)\\s*git\\s+';
  const re = (body, flags) => new RegExp(G + body, flags);

  function deny(reason) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: reason,
        },
      }),
    );
    process.exit(0);
  }

  // 1) blanket add: git add . / -A / --all / -u
  if (re('add\\s+(-A\\b|--all\\b|-u\\b|\\.(\\s|$|;|&|\\|))').test(cmd)) {
    deny(
      `다중 세션 환경: 'git add .' / 'git add -A' / 'git add -u' 는 다른 세션의 미스테이징 변경까지 함께 스테이징할 수 있어 차단했습니다. 명시한 파일 경로만 add 하세요 (예: git add src/foo/bar.ts). ${PROTO}`,
    );
  }
  // 1b) git commit -a / -am / --all  (commit 바로 뒤의 플래그만 검사 — 커밋 메시지 안의 "-a" 언급은 무시)
  if (re('commit\\s+-[a-zA-Z]*a[a-zA-Z]*(\\s|$)').test(cmd) || re('commit\\s+--all\\b').test(cmd)) {
    deny(
      `다중 세션 환경: 'git commit -a' 는 추적 중인 모든 수정 파일(다른 세션 것 포함)을 함께 커밋합니다. 'git add <명시 경로>' 후 'git commit' 으로 나눠 하세요. ${PROTO}`,
    );
  }
  // 2) bare git stash (허용: stash pop|apply|list|show|drop, stash push -- <경로>)
  if (
    /(?:^|&&|\|\||;)\s*git\s+stash\b/.test(cmd) &&
    !/(?:^|&&|\|\||;)\s*git\s+stash\s+(pop|apply|list|show|drop)\b/.test(cmd) &&
    !/(?:^|&&|\|\||;)\s*git\s+stash(\s+push)?\b[^\n]*\s--(\s|$)/.test(cmd)
  ) {
    deny(
      `다중 세션 환경: 인자 없는 'git stash' 는 다른 세션의 작업까지 통째로 숨깁니다. 정말 필요하면 'git stash push -- <경로>' 처럼 명시 경로를 쓰고, 복원은 'git stash pop'. ${PROTO}`,
    );
  }
  // 3) git reset --hard / --keep
  if (re('reset\\s+(--hard\\b|--keep\\b)').test(cmd)) {
    deny(
      `다중 세션 환경: 'git reset --hard' 는 다른 세션의 미커밋 변경을 영구 삭제할 수 있어 차단했습니다. ${PROTO}`,
    );
  }
  // 4) git clean -f...
  if (re('clean\\b[^\\n]*(\\s-[a-zA-Z]*f|\\s--force\\b)').test(cmd)) {
    deny(
      `다중 세션 환경: 'git clean -f' 는 다른 세션이 만든 untracked 파일을 삭제합니다. 차단했습니다. ${PROTO}`,
    );
  }
  // 5) git restore . / git checkout . / git checkout -- .
  if (re('restore\\b[^\\n]*\\s\\.(\\s|$|;|&|\\|)').test(cmd)) {
    deny(
      `다중 세션 환경: 'git restore .' 는 워킹 트리 전체를 되돌려 다른 세션 변경을 날립니다. 명시 경로만 (git restore src/foo.ts). ${PROTO}`,
    );
  }
  if (
    re('checkout\\s+(--\\s+)?\\.(\\s|$|;|&|\\|)').test(cmd) ||
    re('checkout\\s+HEAD(~\\d+)?\\s+--\\s+\\.(\\s|$|;)').test(cmd)
  ) {
    deny(
      `다중 세션 환경: 'git checkout .' / 'git checkout -- .' 는 워킹 트리 전체를 되돌립니다. 명시 경로만. ${PROTO}`,
    );
  }

  // 6) 브랜치 전환(또는 ref/파일 checkout) — 미커밋 변경이 있을 때만 차단
  //    제외: git checkout -b/-B/--orphan, git switch -c/-C/--create/--detach, '--' 가 포함된 형태
  let switchLike = false;
  let m = cmd.match(/(?:^|&&|\|\||;)\s*git\s+switch\s+(.+)/);
  if (m) {
    const t = m[1].trim().split(/\s+/).filter(Boolean);
    if (t.length && !/^-/.test(t[0])) switchLike = true; // 첫 인자가 플래그가 아님
  }
  m = cmd.match(/(?:^|&&|\|\||;)\s*git\s+checkout\s+(.+)/);
  if (m) {
    const rest = m[1].trim();
    const t = rest.split(/\s+/).filter(Boolean);
    if (!/(\s|^)--($|\s)/.test(rest) && t.length === 1 && !/^-/.test(t[0])) switchLike = true; // 단일 비플래그 토큰, '--' 없음
  }
  if (switchLike) {
    let porc = '';
    try {
      porc = execSync('git status --porcelain', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 5000,
        cwd: inputCwd,
      });
    } catch {
      deny(`작업 상태 확인 실패로 전환을 차단했습니다. ${PROTO}`);
    }
    const n = porc.split('\n').filter((l) => l.trim()).length;
    if (n > 0) {
      deny(
        `다중 세션 환경: 미커밋 변경 ${n}개가 있는 상태에서 'git checkout/switch <대상>' 을 차단했습니다. ` +
          `브랜치 전환이면 다른 세션이 그 브랜치로 끌려가고, 파일 checkout 이면 다른 세션의 편집을 덮어쓸 수 있습니다. ` +
          `새 브랜치·worktree는 사용자 명시 요청이 있어야 합니다. ` +
          `정말 메인에서 전환해야 하고 안전이 확실하면(예: 본인 변경만 있는 경우) 사용자에게 확인 후 진행하세요. ${PROTO}`,
      );
    }
  }

  process.exit(0); // 위험 패턴 아님 → 통과
});
