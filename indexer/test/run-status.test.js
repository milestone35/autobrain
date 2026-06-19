import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runStatus } from '../src/cli.js';

test('runStatus summarizes counts by kind/trust/source', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'cc-status-'));
  const map = {
    schemaVersion: 1, generatedAt: 't', sources: { official: { ok: true } },
    capabilities: [
      { id: 'a', kind: 'skill', trust: 'trusted', source: { discoveredVia: 'official' } },
      { id: 'b', kind: 'mcp', trust: 'candidate', source: { discoveredVia: 'known' } }
    ]
  };
  await writeFile(path.join(dataDir, 'capability-map.json'), JSON.stringify(map), 'utf8');

  const lines = [];
  const summary = await runStatus({ dataDir, log: (s) => lines.push(s) });

  assert.equal(summary.total, 2);
  assert.deepEqual(summary.byKind, { skill: 1, mcp: 1 });
  assert.deepEqual(summary.byTrust, { trusted: 1, candidate: 1 });
  assert.deepEqual(summary.bySource, { official: 1, known: 1 });
  assert.ok(lines.join('\n').includes('total'));

  await rm(dataDir, { recursive: true, force: true });
});
