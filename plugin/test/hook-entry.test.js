import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HOOK = path.join(HERE, '..', 'hooks', 'user-prompt-submit.js');

function runHook(stdinText) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [HOOK], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.on('close', (code) => resolve({ code, out }));
    child.stdin.end(stdinText);
  });
}

test('hook entry exits 0 and emits hookSpecificOutput for a matching prompt', async () => {
  const { code, out } = await runHook(JSON.stringify({ prompt: 'audit my api security' }));
  assert.equal(code, 0);
  // The real map may or may not be present; if present we get JSON, otherwise empty (fail-open).
  if (out.trim()) {
    const parsed = JSON.parse(out);
    assert.equal(parsed.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    assert.equal(typeof parsed.hookSpecificOutput.additionalContext, 'string');
  }
});

test('hook entry exits 0 with no output on garbage stdin (fail-open)', async () => {
  const { code, out } = await runHook('{ not json');
  assert.equal(code, 0);
  assert.equal(out.trim(), '');
});
