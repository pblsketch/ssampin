import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const guard = resolve('scripts/agent-git-guard.cjs');
const config = JSON.parse(readFileSync('.codex/hooks.json', 'utf8'));
function invoke(command, options = {}) {
  const result = spawnSync(process.execPath, [options.wrapper || guard], {
    input: JSON.stringify({
      tool_name: options.tool || 'Bash',
      tool_input: { command },
      cwd: root,
    }),
    encoding: 'utf8',
    cwd: options.cwd || root,
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout
    ? JSON.parse(result.stdout).hookSpecificOutput?.permissionDecision
    : undefined;
}
for (const command of [
  'git add -A',
  'git.exe add -A',
  'git status || git add -A',
  'git status\ngit add -A',
  'git add .',
  'git add -u',
  'git commit -am "x"',
  'git stash',
  'git stash push -u',
  'git reset --hard',
  'git clean -fd',
  'git restore .',
  'git checkout -- .',
]) {
  test(`blocks input only: ${command}`, () => assert.equal(invoke(command), 'deny'));
}
for (const command of [
  'git status --short',
  'git diff --check',
  'git add scripts/agent-git-guard.cjs',
  'git stash list',
]) {
  test(`allows input only: ${command}`, () => assert.equal(invoke(command), undefined));
}
test('Claude wrapper and Codex tool alias use the same policy', () => {
  assert.equal(invoke('git add -A', { wrapper: resolve('.claude/hooks/git-guard.cjs') }), 'deny');
  assert.equal(invoke('git add -A', { tool: 'exec_command' }), 'deny');
});
test('registered Codex command resolves from a nested directory', () => {
  const command = config.hooks.PreToolUse[0].hooks[0].command;
  const result = spawnSync(command, {
    shell: true,
    cwd: resolve('landing'),
    encoding: 'utf8',
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git add -A' }, cwd: root }),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
});
test('both instruction entrypoints route to the shared release workflow', () => {
  for (const file of ['AGENTS.md', 'CLAUDE.md'])
    assert.match(readFileSync(file, 'utf8'), /docs\/release-workflow\.md/);
  for (const file of [
    '.agents/skills/ssampin-develop/SKILL.md',
    '.claude/skills/ssampin-develop/SKILL.md',
  ]) {
    const text = readFileSync(file, 'utf8');
    assert.match(text, /docs\/agent-workflow\.md/);
    assert.doesNotMatch(text, /model:.*(?:opus|sonnet)|run_in_background/);
  }
});
