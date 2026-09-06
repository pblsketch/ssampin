/*
 * git-guard — GJC pre-tool 훅 (bash 도구 전용). `.claude/hooks/git-guard.cjs` 를 GJC 형식으로 옮긴 것.
 *
 * 여러 AI 세션이 같은 워킹 디렉터리(main)를 공유하므로, 다른 세션의 미커밋 작업을 날리거나
 * 브랜치를 빼앗는 blanket git 명령을 차단한다. (AGENTS.md "AI 에이전트 작업 워크플로우")
 *
 * 계약: GJC 가 Bun import() 로 읽어 기본 내보내기(hook factory)에 HookAPI 를 넘긴다.
 *       `tool_call` 핸들러가 `{ block: true, reason }` 을 돌려주면 도구가 실행되지 않는다.
 */
import { execSync } from 'node:child_process';

interface ToolCallEvent {
  readonly type: 'tool_call';
  readonly toolName: string;
  readonly toolCallId: string;
  readonly input: unknown;
}

interface BlockResult {
  readonly block: true;
  readonly reason: string;
}

interface HookApi {
  on(
    event: 'tool_call',
    handler: (event: ToolCallEvent) => Promise<BlockResult | undefined> | BlockResult | undefined,
  ): void;
}

const PROTO = "(AGENTS.md 'AI 에이전트 작업 워크플로우' 참고)";
// 명령 시작 또는 && / || / ; 직후의 git 만 잡는다(따옴표 안 문자열의 git 언급은 제외).
const G = '(?:^|&&|\\|\\||;)\\s*git\\s+';
const re = (body: string): RegExp => new RegExp(G + body, 'm');

function commandOf(input: unknown): string {
  if (input && typeof input === 'object' && 'command' in input) {
    const c = (input as { command?: unknown }).command;
    return typeof c === 'string' ? c : '';
  }
  return '';
}

function deny(reason: string): BlockResult {
  return { block: true, reason: `${reason} ${PROTO}` };
}

function guard(cmd: string): BlockResult | undefined {
  if (!/(^|&&|\|\||;|\n)\s*git\s/.test(cmd)) return undefined;

  // 1) blanket add: git add . / -A / --all / -u
  if (re('add\\s+(-A\\b|--all\\b|-u\\b|\\.(\\s|$|;|&|\\|))').test(cmd)) {
    return deny(
      "다중 세션 환경: 'git add .' / 'git add -A' / 'git add -u' 는 다른 세션의 미스테이징 변경까지 함께 스테이징합니다. 명시한 파일 경로만 add 하세요 (예: git add src/foo/bar.ts).",
    );
  }
  // 1b) git commit -a / -am / --all
  if (re('commit\\s+-[a-zA-Z]*a[a-zA-Z]*(\\s|$)').test(cmd) || re('commit\\s+--all\\b').test(cmd)) {
    return deny(
      "다중 세션 환경: 'git commit -a' 는 추적 중인 모든 수정 파일(다른 세션 것 포함)을 함께 커밋합니다. 'git add <명시 경로>' 후 'git commit' 으로 나눠 하세요.",
    );
  }
  // 2) bare git stash (허용: stash pop|apply|list|show|drop, stash push -- <경로>)
  if (
    /(?:^|&&|\|\||;)\s*git\s+stash\b/m.test(cmd) &&
    !/(?:^|&&|\|\||;)\s*git\s+stash\s+(pop|apply|list|show|drop)\b/m.test(cmd) &&
    !/(?:^|&&|\|\||;)\s*git\s+stash(\s+push)?\b[^\n]*\s--(\s|$)/m.test(cmd)
  ) {
    return deny(
      "다중 세션 환경: 인자 없는 'git stash' 는 다른 세션의 작업까지 통째로 숨깁니다. 정말 필요하면 'git stash push -- <경로>' 처럼 명시 경로를 쓰고, 복원은 'git stash pop'.",
    );
  }
  // 3) git reset --hard / --keep
  if (re('reset\\s+(--hard\\b|--keep\\b)').test(cmd)) {
    return deny(
      "다중 세션 환경: 'git reset --hard' 는 다른 세션의 미커밋 변경을 영구 삭제할 수 있어 차단했습니다.",
    );
  }
  // 4) git clean -f...
  if (re('clean\\b[^\\n]*(\\s-[a-zA-Z]*f|\\s--force\\b)').test(cmd)) {
    return deny(
      "다중 세션 환경: 'git clean -f' 는 다른 세션이 만든 untracked 파일을 삭제합니다. 차단했습니다.",
    );
  }
  // 5) git restore . / git checkout . / git checkout -- .
  if (re('restore\\b[^\\n]*\\s\\.(\\s|$|;|&|\\|)').test(cmd)) {
    return deny(
      "다중 세션 환경: 'git restore .' 는 워킹 트리 전체를 되돌려 다른 세션 변경을 날립니다. 명시 경로만 (git restore src/foo.ts).",
    );
  }
  if (
    re('checkout\\s+(--\\s+)?\\.(\\s|$|;|&|\\|)').test(cmd) ||
    re('checkout\\s+HEAD(~\\d+)?\\s+--\\s+\\.(\\s|$|;)').test(cmd)
  ) {
    return deny(
      "다중 세션 환경: 'git checkout .' / 'git checkout -- .' 는 워킹 트리 전체를 되돌립니다. 명시 경로만.",
    );
  }

  // 6) 브랜치 전환(또는 ref/파일 checkout) — 미커밋 변경이 있을 때만 차단
  //    제외: git checkout -b/-B/--orphan, git switch -c/-C/--create/--detach, '--' 가 포함된 형태
  let switchLike = false;
  let m = cmd.match(/(?:^|&&|\|\||;)\s*git\s+switch\s+(.+)/m);
  if (m && m[1]) {
    const t = m[1].trim().split(/\s+/).filter(Boolean);
    if (t.length > 0 && t[0] !== undefined && !/^-/.test(t[0])) switchLike = true;
  }
  m = cmd.match(/(?:^|&&|\|\||;)\s*git\s+checkout\s+(.+)/m);
  if (m && m[1]) {
    const rest = m[1].trim();
    const t = rest.split(/\s+/).filter(Boolean);
    if (!/(\s|^)--($|\s)/.test(rest) && t.length === 1 && t[0] !== undefined && !/^-/.test(t[0])) {
      switchLike = true;
    }
  }
  if (switchLike) {
    let porc = '';
    try {
      porc = execSync('git status --porcelain', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 5000,
      });
    } catch {
      /* git status 실패 시 보수적으로 통과 */
    }
    const n = porc.split('\n').filter((l) => l.trim()).length;
    if (n > 0) {
      return deny(
        `다중 세션 환경: 미커밋 변경 ${n}개가 있는 상태에서 'git checkout/switch <대상>' 을 차단했습니다. ` +
          '브랜치 전환이면 다른 세션이 그 브랜치로 끌려가고, 파일 checkout 이면 다른 세션의 편집을 덮어씁니다. ' +
          "메인 워킹 트리를 안 건드리려면 'git worktree add ../ssampin-<용도> <branch>' 로 별도 디렉터리에서 작업하세요. " +
          '정말 메인에서 전환해야 하고 안전이 확실하면 사용자에게 확인 후 진행하세요.',
      );
    }
  }
  return undefined;
}

export default function gitGuard(pi: HookApi): void {
  pi.on('tool_call', (event) => {
    if (event.toolName !== 'bash') return undefined;
    return guard(commandOf(event.input));
  });
}

/** 테스트·수동 점검용. */
export { guard };
