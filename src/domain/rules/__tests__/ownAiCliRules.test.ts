import { describe, it, expect } from 'vitest';
import {
  buildClaudeArgv,
  buildCodexArgv,
  classifyOwnAiError,
  isUsageBlocked,
  isVersionAtLeast,
  isVersionSupported,
  parseCliVersion,
  supportedRangeLabel,
  OWN_AI_ALLOWED_TOOLS,
  OWN_AI_ERROR_MESSAGES,
  OWN_AI_MODELS,
  stripOwnAiEnv,
} from '@domain/rules/ownAiCliRules';
import { OWN_AI_PROVIDERS } from '@domain/entities/OwnAiProvider';

const BRIDGE = {
  command: 'C:\\Program Files\\ssampin\\ssampin.exe',
  args: ['C:\\Program Files\\ssampin\\resources\\ai-bridge\\index.mjs'],
  env: { ELECTRON_RUN_AS_NODE: '1', SSAMPIN_DATA_DIR: 'C:\\Users\\t\\data' },
} as const;

describe('버전 비교', () => {
  it('출력에서 버전만 뽑는다 — 실제 두 CLI 의 출력 형태', () => {
    expect(parseCliVersion('2.1.258 (Claude Code)')).toBe('2.1.258');
    expect(parseCliVersion('codex-cli 0.144.4')).toBe('0.144.4');
    expect(parseCliVersion('버전 정보를 못 읽었다')).toBeNull();
  });

  it('자리수가 달라도 비교된다', () => {
    expect(isVersionAtLeast('2.1.258', '2.1.200')).toBe(true);
    expect(isVersionAtLeast('2.1.9', '2.1.10')).toBe(false);
    expect(isVersionAtLeast('2.2', '2.1.999')).toBe(true);
    expect(isVersionAtLeast('2.1.200', '2.1.200')).toBe(true);
  });

  it('버전을 못 읽으면 지원하지 않는 것으로 본다 — 모르면 실행하지 않는다', () => {
    expect(isVersionSupported('claude', null)).toBe(false);
    expect(isVersionSupported('claude', '2.1.258')).toBe(true);
    expect(isVersionSupported('codex', '0.144.4')).toBe(true);
    expect(isVersionSupported('codex', '0.100.0')).toBe(false);
  });

  it('지원 범위를 한국어로 알려준다', () => {
    expect(supportedRangeLabel('claude')).toContain('이상');
  });
});

describe('claude argv — 실측(2.1.258)으로 확정한 형태', () => {
  const panel = buildClaudeArgv({
    kind: 'panel',
    prompt: '할 일 몇 건 남았어?',
    mcpConfigPath: 'C:\\tmp\\mcp.json',
    version: '2.1.258',
  });

  it('★--bare 를 절대 붙이지 않는다 — 구독 로그인을 안 읽는다', () => {
    expect(panel).not.toContain('--bare');
  });

  it('★내장 도구를 --tools "" 로 없앤다 — 블랙리스트(--disallowedTools)는 샜다', () => {
    const i = panel.indexOf('--tools');
    expect(i).toBeGreaterThan(-1);
    expect(panel[i + 1]).toBe('');
    expect(panel).not.toContain('--disallowedTools');
  });

  it('★--restricted 로 사용자 설정·훅을 막는다 — --setting-sources 는 쓰지 않는다', () => {
    expect(panel).toContain('--restricted');
    expect(panel).not.toContain('--setting-sources');
  });

  it('패널은 브릿지만 물리고 도구 허용은 와일드카드다', () => {
    expect(panel).toContain('--mcp-config');
    expect(panel).toContain('--strict-mcp-config');
    const i = panel.indexOf('--allowedTools');
    expect(panel[i + 1]).toBe(OWN_AI_ALLOWED_TOOLS);
    // 접두사 필터는 읽기 도구(list_classes 등)를 놓친다 — 쓰면 안 된다.
    expect(OWN_AI_ALLOWED_TOOLS).not.toContain('get_');
  });

  it('생기부는 도구를 하나도 주지 않는다 — MCP 인자가 전부 없다', () => {
    const draft = buildClaudeArgv({ kind: 'draft', prompt: '초안', version: '2.1.258' });
    expect(draft).not.toContain('--mcp-config');
    expect(draft).not.toContain('--strict-mcp-config');
    expect(draft).not.toContain('--allowedTools');
  });

  it('--permission-prompts 는 2.1.259 이상에서만 붙는다 (2.1.258 은 옵션 자체가 없다)', () => {
    expect(panel).not.toContain('--permission-prompts');
    const newer = buildClaudeArgv({ kind: 'draft', prompt: 'x', version: '2.1.259' });
    expect(newer).toContain('--permission-prompts');
  });

  it('없는 플래그를 쓰지 않는다 — --append-system-prompt-file · --max-turns', () => {
    const withPrompt = buildClaudeArgv({
      kind: 'draft',
      prompt: 'x',
      appendSystemPrompt: '규칙',
      version: '2.1.258',
    });
    expect(withPrompt).not.toContain('--append-system-prompt-file');
    expect(withPrompt).not.toContain('--max-turns');
    expect(withPrompt).toContain('--append-system-prompt');
  });

  it('모델을 안 고르면 --model 을 붙이지 않는다(CLI 기본값)', () => {
    expect(buildClaudeArgv({ kind: 'draft', prompt: 'x' })).not.toContain('--model');
    expect(buildClaudeArgv({ kind: 'draft', prompt: 'x', model: 'sonnet' })).toContain('--model');
  });

  it('프롬프트는 -p 뒤 인자로 넘긴다 — stdin 은 닫아야 하므로 파이프로 넣지 않는다', () => {
    expect(panel[0]).toBe('-p');
    expect(panel[1]).toBe('할 일 몇 건 남았어?');
  });
});

describe('codex argv — 실측(0.144.4)', () => {
  const panel = buildCodexArgv({
    kind: 'panel',
    prompt: '할 일 몇 건?',
    cwd: 'C:\\tmp\\cwd',
    bridge: BRIDGE,
  });

  it('읽기 전용 샌드박스 + 사용자 설정 무시로 띄운다', () => {
    expect(panel.slice(0, 2)).toEqual(['exec', '--json']);
    expect(panel).toContain('--skip-git-repo-check');
    expect(panel).toContain('--ignore-user-config');
    const i = panel.indexOf('-s');
    expect(panel[i + 1]).toBe('read-only');
  });

  it('브릿지를 -c 중첩 키로 넘기고 Windows 경로의 역슬래시를 TOML 로 이스케이프한다', () => {
    const joined = panel.join('\n');
    expect(joined).toContain('mcp_servers.ssampin.command=');
    expect(joined).toContain('mcp_servers.ssampin.args=[');
    expect(joined).toContain('mcp_servers.ssampin.env={');
    // TOML 문자열 안에서 \ 는 \\ 로 나가야 한다
    expect(joined).toContain('C:\\\\Program Files\\\\ssampin\\\\ssampin.exe');
    expect(joined).toContain('ELECTRON_RUN_AS_NODE="1"');
  });

  it('생기부는 -c mcp_servers.* 를 전부 생략한다', () => {
    const draft = buildCodexArgv({ kind: 'draft', prompt: '초안', cwd: 'C:\\tmp' });
    expect(draft.join('\n')).not.toContain('mcp_servers');
  });

  it('프롬프트는 마지막 위치 인자다', () => {
    expect(panel[panel.length - 1]).toBe('할 일 몇 건?');
  });
});

describe('argv 어디에도 쓰기 허용 env 를 넣지 않는다', () => {
  it('★SSAMPIN_BRIDGE_ALLOW_WRITE 는 argv 에도 브릿지 env 에도 없다 — 쓰기는 설정 토글이 정한다', () => {
    const panel = buildCodexArgv({
      kind: 'panel',
      prompt: 'x',
      cwd: 'C:\\tmp',
      bridge: BRIDGE,
    });
    expect(panel.join('\n')).not.toContain('SSAMPIN_BRIDGE_ALLOW_WRITE');
    expect(Object.keys(BRIDGE.env)).not.toContain('SSAMPIN_BRIDGE_ALLOW_WRITE');
  });
});

describe('오류 분류 — 실제로 받은 문자열로 검증', () => {
  it('없는 모델(claude 2.1.258 실측 stderr)', () => {
    expect(
      classifyOwnAiError({
        stderr:
          '[claude-code:unrecognized_model] {"model":"gpt-9-nonexistent","query_source":"sdk"}',
        exitCode: 1,
      }),
    ).toBe('model-unavailable');
  });

  it('설치 안 됨은 spawn 오류 코드로 가른다', () => {
    expect(classifyOwnAiError({ spawnErrorCode: 'ENOENT' })).toBe('not-installed');
  });

  it('취소가 다른 무엇보다 우선한다', () => {
    expect(classifyOwnAiError({ cancelled: true, stderr: 'unauthorized' })).toBe('cancelled');
  });

  it('로그인·한도·MCP 를 갈라 본다', () => {
    expect(classifyOwnAiError({ stderr: 'Error: not signed in' })).toBe('not-signed-in');
    expect(classifyOwnAiError({ stderr: 'oauth_org_not_allowed' })).toBe('not-signed-in');
    expect(classifyOwnAiError({ text: 'You have hit your usage limit' })).toBe('usage-limit');
    expect(classifyOwnAiError({ stderr: 'MCP server failed to connect' })).toBe('mcp-boot');
  });

  it('모르는 실패는 crashed 로 떨어진다', () => {
    expect(classifyOwnAiError({ exitCode: 1, stderr: '알 수 없는 오류' })).toBe('crashed');
  });

  it('rate_limit_event 의 status 로 막힘을 판정한다', () => {
    expect(isUsageBlocked('allowed')).toBe(false);
    expect(isUsageBlocked(undefined)).toBe(false);
    expect(isUsageBlocked('blocked')).toBe(true);
  });
});

describe('문구와 모델 목록', () => {
  it('모든 오류 갈래에 패널·생기부 문구가 한국어로 있다', () => {
    for (const [kind, msg] of Object.entries(OWN_AI_ERROR_MESSAGES)) {
      expect(msg.panel.length, kind).toBeGreaterThan(0);
      expect(msg.draft.length, kind).toBeGreaterThan(0);
      expect(/[가-힣]/.test(msg.panel), kind).toBe(true);
    }
  });

  it('공급자마다 기본값(빈 id)이 첫 항목이다', () => {
    for (const p of OWN_AI_PROVIDERS) {
      expect(OWN_AI_MODELS[p][0]?.id, p).toBe('');
    }
  });
});

describe('★codex 도 규정·힌트를 함께 보낸다', () => {
  /**
   * codex 에는 claude 의 `--append-system-prompt` 에 해당하는 옵션이 없다. 안 붙이고 두면
   * **생기부 작성 규정이 통째로 빠진 채** 초안이 나간다 — codex 를 쓰는 선생님만 조용히
   * 규정 없는 초안을 받게 된다. 그래서 프롬프트 앞에 붙여 보낸다.
   */
  it('규정을 프롬프트보다 **앞에** 붙인다', () => {
    const argv = buildCodexArgv({
      kind: 'draft',
      prompt: '학생: ［이름1］',
      cwd: 'E:\\run',
      appendSystemPrompt: '[작성 규정]',
    });
    const last = argv[argv.length - 1] ?? '';

    expect(last.indexOf('[작성 규정]')).toBeLessThan(last.indexOf('학생: ［이름1］'));
  });

  it('규정과 재료를 눈에 띄게 갈라 둔다 — 모델이 둘을 섞어 읽지 않게', () => {
    const argv = buildCodexArgv({
      kind: 'draft',
      prompt: '학생: ［이름1］',
      cwd: 'E:\\run',
      appendSystemPrompt: '[작성 규정]',
    });

    expect(argv[argv.length - 1]).toBe(
      '[작성 규정]' + '\n' + '\n' + '---' + '\n' + '\n' + '학생: ［이름1］',
    );
  });

  it('붙일 게 없으면 프롬프트만 간다 — 빈 구분선을 만들지 않는다', () => {
    const argv = buildCodexArgv({ kind: 'draft', prompt: '학생: ［이름1］', cwd: 'E:\\run' });

    expect(argv[argv.length - 1]).toBe('학생: ［이름1］');
  });
});

describe('★API 키 env 스트립 — 구독이 아닌 청구 경로를 자식에게 보이지 않게', () => {
  it('키·베이스URL·클라우드 전환 스위치를 빼고 나머지는 남긴다', () => {
    const out = stripOwnAiEnv({
      PATH: 'C:\\bin',
      ANTHROPIC_API_KEY: 'sk-ant',
      ANTHROPIC_AUTH_TOKEN: 't',
      ANTHROPIC_BASE_URL: 'https://proxy',
      CLAUDE_CODE_USE_BEDROCK: '1',
      OPENAI_API_KEY: 'sk',
      HOME: 'C:\\Users\\t',
    });
    expect(out).toEqual({ PATH: 'C:\\bin', HOME: 'C:\\Users\\t' });
  });

  it('원본을 건드리지 않는다', () => {
    const env = { ANTHROPIC_API_KEY: 'sk-ant' };
    stripOwnAiEnv(env);
    expect(env.ANTHROPIC_API_KEY).toBe('sk-ant');
  });
});

describe('★모델 목록은 실제로 되는 것만, 실제 이름으로 올린다', () => {
  it('두 공급자 모두 고를 것이 있다 — codex 도 기본 말고 더 있다(2026-09-06 실측)', () => {
    // 한때 codex 를 "기본 하나뿐"으로 뒀는데, 그건 **틀린 이름으로 시험한 탓**이었다.
    // gpt-5.3-codex 류는 없는 이름이고, 진짜는 gpt-6-astra · gpt-5.6-sol 같은 것들이다.
    expect(OWN_AI_MODELS.codex.length).toBeGreaterThan(1);
    expect(OWN_AI_MODELS.claude.length).toBeGreaterThan(1);
  });

  it('첫 항목은 언제나 "기본" 이다 — 고르지 않아도 되게', () => {
    for (const p of ['claude', 'codex'] as const) {
      expect(OWN_AI_MODELS[p][0]?.id).toBe('');
    }
  });

  it('★라벨에 실제 판(버전)이 보인다 — "Opus" 만으로는 무엇인지 알 수 없다', () => {
    const labels = OWN_AI_MODELS.claude.map((m) => m.label).join(' ');
    expect(labels).toContain('Fable 5.1');
    expect(labels).toContain('Opus 5');
    expect(OWN_AI_MODELS.codex.map((m) => m.label).join(' ')).toContain('GPT-6 Astra');
  });

  it('★모델 라벨에 설명이 붙어 있지 않다 — 이름만(오너 결정 2026-09-06, ADR-085 보강 2 R4)', () => {
    for (const p of OWN_AI_PROVIDERS) {
      for (const m of OWN_AI_MODELS[p]) {
        if (m.id === '') continue; // `기본 (권장)` 은 모델명이 아니라 예외
        expect(m.label, `${p}/${m.id} 라벨에 부연 설명이 붙어 있다: ${m.label}`).not.toMatch(
          /[—·(:]/,
        );
        expect(m.label, `${p}/${m.id} 라벨에 한글 설명이 붙어 있다: ${m.label}`).not.toMatch(
          /[가-힣]/,
        );
      }
    }
  });

  it('★id 는 실제 모델 이름이다 — 별칭은 화면에 몇 판인지 못 보여 준다', () => {
    const ids = OWN_AI_MODELS.claude.map((m) => m.id).filter((x) => x.length > 0);
    expect(ids.every((id) => id.startsWith('claude-'))).toBe(true);
  });
});
