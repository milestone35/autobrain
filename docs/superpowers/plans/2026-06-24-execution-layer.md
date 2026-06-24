# Yürütme Katmanı (SP6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/route`'u pasif öneriden aktif yürütücüye çevirmek: konsey kararından sonra seçilen yeteneği kullanarak kullanıcının işini fiilen tamamlamak — salt-okunur adımlar otomatik, yan-etkili adımlar tek onayla.

**Architecture:** Deterministik çekirdek (`plugin/lib/execution.js`) kararı sıralı yürütme adımlarına çevirir ve her adımın riskini sınıflar — ama YÜRÜTMEZ. Yeni `cli.js execute` alt-komutu makine-okunur plan + onay durumu üretir (son-satır JSON, `--approved` gate; SP4 `install` desenini izler ama hiçbir şey çalıştırmaz). Fiili yürütme SKILL reçetesinin yeni Step 8'inde ana ajan tarafından gerçek araçlarla (Bash/Skill/Task/slash) yapılır.

**Tech Stack:** Node.js ESM (sıfır bağımlılık), test runner = Node built-in `node --test`.

> **Önemli — Node ortamı:** Node/npm sistem PATH'inde DEĞİL. Bu plandaki tüm komutlardan ÖNCE (Git Bash):
> ```bash
> export PATH="/c/Users/harun.hanbay/AppData/Local/anaconda3/envs/ragflow-dev:$PATH"
> ```
> **Branch:** Implementasyona başlamadan önce `master`'dan `feat/execution` dalı aç: `git checkout -b feat/execution`. Tüm task'lar bu dala işlenir.

---

## Dosya Yapısı

| Dosya | Sorumluluk | İşlem |
|-------|-----------|-------|
| `plugin/lib/execution.js` | `actionFor` + `classifyRisk` + `directiveFor` + `planExecution` (saf, yan etki yok) | **Oluştur** |
| `plugin/test/execution.test.js` | execution birim testleri | **Oluştur** |
| `plugin/lib/cli.js` | `runExecute` + `execute` alt-komutu | Değiştir |
| `plugin/test/execute-cli.test.js` | execute CLI testi | **Oluştur** |
| `plugin/test/fixtures/capability-map.exec.sample.json` | execute testleri için karma harita (builtin + kurulabilir) | **Oluştur** |
| `plugin/skills/capability-router/SKILL.md` | Step 8 (Execute) + frontmatter + Step 7 cleanup ertelemesi | Değiştir |
| `plugin/skills/capability-router/SMOKE.md` | yürütme senaryoları | Değiştir |
| `plugin/commands/route.md` | "karar ver + uygula" + allowed-tools | Değiştir (tam içerik) |

---

## Task 1: execution — `actionFor` (kind → action)

**Files:**
- Create: `plugin/lib/execution.js`
- Test: `plugin/test/execution.test.js`

- [ ] **Step 1: Write the failing test**

`plugin/test/execution.test.js` oluştur:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actionFor } from '../lib/execution.js';

test('actionFor maps each kind to its execution action', () => {
  assert.equal(actionFor('bang'), 'run_shell');
  assert.equal(actionFor('builtin-tool'), 'use_tool');
  assert.equal(actionFor('slash'), 'invoke_slash');
  assert.equal(actionFor('builtin-agent'), 'dispatch_agent');
  assert.equal(actionFor('agent'), 'dispatch_agent');
  assert.equal(actionFor('skill'), 'invoke_skill');
  assert.equal(actionFor('command'), 'invoke_slash');
  assert.equal(actionFor('mcp'), 'call_mcp');
  assert.equal(actionFor('plugin'), 'use_directly');
});

test('actionFor falls back to use_directly for unknown kinds', () => {
  assert.equal(actionFor('nonsense'), 'use_directly');
  assert.equal(actionFor(undefined), 'use_directly');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test test/execution.test.js`
Expected: FAIL — "Cannot find module .../execution.js".

- [ ] **Step 3: Write minimal implementation**

`plugin/lib/execution.js` oluştur:

```javascript
const KIND_ACTION = {
  bang: 'run_shell',
  'builtin-tool': 'use_tool',
  slash: 'invoke_slash',
  'builtin-agent': 'dispatch_agent',
  agent: 'dispatch_agent',
  skill: 'invoke_skill',
  command: 'invoke_slash',
  mcp: 'call_mcp',
  plugin: 'use_directly'
};

export function actionFor(kind) {
  return KIND_ACTION[kind] ?? 'use_directly';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test test/execution.test.js`
Expected: PASS (2 tests green).

- [ ] **Step 5: Commit**

```bash
git add plugin/lib/execution.js plugin/test/execution.test.js
git commit -m "feat(execution): actionFor maps capability kind to execution action"
```

---

## Task 2: execution — `classifyRisk` (risk modeli)

**Files:**
- Modify: `plugin/lib/execution.js`
- Test: `plugin/test/execution.test.js`

- [ ] **Step 1: Write the failing test**

`plugin/test/execution.test.js` dosyasının import satırını güncelle ve testleri SONUNA ekle. İlk satırı:

```javascript
import { actionFor } from '../lib/execution.js';
```
şununla değiştir:
```javascript
import { actionFor, classifyRisk } from '../lib/execution.js';
```

Dosyanın SONUNA ekle:

```javascript
test('classifyRisk: read-only allow-list entries are read-only', () => {
  for (const name of ['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch']) {
    assert.equal(classifyRisk({ kind: 'builtin-tool', name }), 'read-only');
  }
  for (const name of ['Explore', 'Plan']) {
    assert.equal(classifyRisk({ kind: 'builtin-agent', name }), 'read-only');
  }
  for (const name of ['/review', '/security-review', '/code-review']) {
    assert.equal(classifyRisk({ kind: 'slash', name }), 'read-only');
  }
});

test('classifyRisk: bang and mutating builtin tools are side-effecting', () => {
  assert.equal(classifyRisk({ kind: 'bang', name: 'shell' }), 'side-effecting');
  for (const name of ['Write', 'Edit', 'Bash', 'Task']) {
    assert.equal(classifyRisk({ kind: 'builtin-tool', name }), 'side-effecting');
  }
  for (const name of ['general-purpose', 'code-reviewer']) {
    assert.equal(classifyRisk({ kind: 'builtin-agent', name }), 'side-effecting');
  }
});

test('classifyRisk: installable kinds are side-effecting', () => {
  assert.equal(classifyRisk({ kind: 'skill', name: 'whatever' }), 'side-effecting');
  assert.equal(classifyRisk({ kind: 'agent', name: 'whatever' }), 'side-effecting');
  assert.equal(classifyRisk({ kind: 'command', name: '/whatever' }), 'side-effecting');
  assert.equal(classifyRisk({ kind: 'mcp', name: 'whatever' }), 'side-effecting');
  assert.equal(classifyRisk({ kind: 'plugin', name: 'whatever' }), 'side-effecting');
});

test('classifyRisk: unrecognized builtin name is side-effecting (fail-safe)', () => {
  assert.equal(classifyRisk({ kind: 'builtin-tool', name: 'FutureTool' }), 'side-effecting');
  assert.equal(classifyRisk({ kind: 'builtin-agent', name: 'future-agent' }), 'side-effecting');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test test/execution.test.js`
Expected: FAIL — `classifyRisk` is not a function / undefined import.

- [ ] **Step 3: Write minimal implementation**

`plugin/lib/execution.js` içine, `actionFor`'un ALTINA ekle:

```javascript
const READ_ONLY = {
  'builtin-tool': new Set(['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch']),
  'builtin-agent': new Set(['Explore', 'Plan']),
  slash: new Set(['/review', '/security-review', '/code-review'])
};

// "Not recognized as definitely read-only" => side-effecting (fail-safe).
export function classifyRisk(step) {
  const ro = READ_ONLY[step?.kind];
  return ro && ro.has(step?.name) ? 'read-only' : 'side-effecting';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test test/execution.test.js`
Expected: PASS (6 tests green).

- [ ] **Step 5: Commit**

```bash
git add plugin/lib/execution.js plugin/test/execution.test.js
git commit -m "feat(execution): classifyRisk (read-only allow-list, rest side-effecting/fail-safe)"
```

---

## Task 3: execution — `directiveFor` + `planExecution`

**Files:**
- Modify: `plugin/lib/execution.js`
- Test: `plugin/test/execution.test.js`

- [ ] **Step 1: Write the failing test**

`plugin/test/execution.test.js` import satırını şu hale getir:
```javascript
import { actionFor, classifyRisk, directiveFor, planExecution } from '../lib/execution.js';
```

Dosyanın SONUNA ekle:

```javascript
const MAP = { capabilities: [
  { id: 'builtin::core::bang::shell', kind: 'bang', name: 'shell' },
  { id: 'builtin::core::builtin-tool::Grep', kind: 'builtin-tool', name: 'Grep' },
  { id: 'mp::p::skill::s', kind: 'skill', name: 's' }
] };

test('directiveFor returns an action-appropriate hint', () => {
  assert.match(directiveFor({ name: 'shell' }, 'run_shell'), /shell command/i);
  assert.match(directiveFor({ name: 'Grep' }, 'use_tool'), /Grep/);
  assert.match(directiveFor({ name: 'Explore' }, 'dispatch_agent'), /Explore/);
  assert.match(directiveFor({ name: 'foo' }, 'invoke_skill'), /foo/);
});

test('planExecution maps chosen capabilities to ordered steps with risk', () => {
  const decision = { decision: 'use_existing', capabilities: ['mp::p::skill::s', 'builtin::core::builtin-tool::Grep'] };
  const steps = planExecution(decision, MAP);
  assert.equal(steps.length, 2);
  // order preserved
  assert.deepEqual(steps.map((s) => s.id), ['mp::p::skill::s', 'builtin::core::builtin-tool::Grep']);
  assert.equal(steps[0].action, 'invoke_skill');
  assert.equal(steps[0].risk, 'side-effecting');
  assert.equal(steps[1].action, 'use_tool');
  assert.equal(steps[1].risk, 'read-only');
  assert.ok(typeof steps[0].directive === 'string' && steps[0].directive.length > 0);
});

test('planExecution skips ids not in the map (defense)', () => {
  const decision = { decision: 'use_existing', capabilities: ['mp::p::skill::s', 'ghost::id::x::y'] };
  const steps = planExecution(decision, MAP);
  assert.deepEqual(steps.map((s) => s.id), ['mp::p::skill::s']);
});

test('planExecution returns [] for no_capability_needed or empty', () => {
  assert.deepEqual(planExecution({ decision: 'no_capability_needed', capabilities: [] }, MAP), []);
  assert.deepEqual(planExecution(null, MAP), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test test/execution.test.js`
Expected: FAIL — `directiveFor`/`planExecution` undefined.

- [ ] **Step 3: Write minimal implementation**

`plugin/lib/execution.js` SONUNA ekle:

```javascript
export function directiveFor(cap, action) {
  const name = cap?.name ?? '';
  switch (action) {
    case 'run_shell': return "Compose and run the single shell command that fulfills the user's request.";
    case 'use_tool': return `Use the ${name} tool to fulfill the request.`;
    case 'invoke_slash': return `Invoke the ${name} command.`;
    case 'dispatch_agent': return `Dispatch the ${name} agent via the Task tool.`;
    case 'invoke_skill': return `Invoke the ${name} skill.`;
    case 'call_mcp': return `Call the ${name} MCP tool.`;
    default: return `Use ${name} directly as appropriate.`;
  }
}

export function planExecution(decision, map) {
  if (!decision || decision.decision === 'no_capability_needed') return [];
  const byId = new Map((map?.capabilities || []).map((c) => [c.id, c]));
  const steps = [];
  for (const id of decision.capabilities || []) {
    const cap = byId.get(id);
    if (!cap) continue;
    const action = actionFor(cap.kind);
    const risk = classifyRisk({ kind: cap.kind, name: cap.name });
    steps.push({ id, name: cap.name, kind: cap.kind, action, risk, directive: directiveFor(cap, action) });
  }
  return steps;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test test/execution.test.js`
Expected: PASS (10 tests green).

- [ ] **Step 5: Commit**

```bash
git add plugin/lib/execution.js plugin/test/execution.test.js
git commit -m "feat(execution): directiveFor + planExecution (decision -> ordered risk-tagged steps)"
```

---

## Task 4: cli — `execute` alt-komutu

**Files:**
- Modify: `plugin/lib/cli.js`
- Create: `plugin/test/fixtures/capability-map.exec.sample.json`
- Test: `plugin/test/execute-cli.test.js`

- [ ] **Step 1: Create the test fixture**

`plugin/test/fixtures/capability-map.exec.sample.json` oluştur:

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-06-24T00:00:00Z",
  "sources": {},
  "capabilities": [
    {
      "id": "builtin::core::bang::shell",
      "kind": "bang", "name": "shell",
      "description": "Run any shell command inline in the session.",
      "keywords": ["shell", "ssh", "command"],
      "source": { "marketplace": "builtin", "repo": null, "discoveredVia": "builtin" },
      "install": null, "trust": "builtin", "cost": null,
      "popularity": { "unique_installs": null }, "lastSeen": "2026-06-24T00:00:00Z"
    },
    {
      "id": "builtin::core::builtin-tool::Grep",
      "kind": "builtin-tool", "name": "Grep",
      "description": "Search file contents with a regular expression.",
      "keywords": ["grep", "search", "find"],
      "source": { "marketplace": "builtin", "repo": null, "discoveredVia": "builtin" },
      "install": null, "trust": "builtin", "cost": null,
      "popularity": { "unique_installs": null }, "lastSeen": "2026-06-24T00:00:00Z"
    },
    {
      "id": "mp::p::skill::s",
      "kind": "skill", "name": "s",
      "description": "An installable skill.",
      "keywords": ["skill"],
      "source": { "marketplace": "mp", "repo": null, "discoveredVia": "official" },
      "install": { "method": "plugin", "command": "claude plugin install p@mp", "package": null },
      "trust": "trusted", "cost": null,
      "popularity": { "unique_installs": 10 }, "lastSeen": "2026-06-24T00:00:00Z"
    }
  ]
}
```

- [ ] **Step 2: Write the failing test**

`plugin/test/execute-cli.test.js` oluştur:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runExecute } from '../lib/cli.js';
import { loadConfig } from '../lib/config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXT = path.join(HERE, 'fixtures', 'capability-map.exec.sample.json');
const NOW = '2026-06-25T00:00:00Z';

async function tmp() { return mkdtemp(path.join(tmpdir(), 'cc-exec-')); }
async function writeDecision(dir, obj) {
  const f = path.join(dir, 'decision.json');
  await writeFile(f, JSON.stringify(obj), 'utf8');
  return f;
}
const allThree = {
  decision: 'use_existing',
  capabilities: ['builtin::core::bang::shell', 'builtin::core::builtin-tool::Grep', 'mp::p::skill::s'],
  installs: [], method: 'x', rationale: 'r', confidence: 0.9
};

test('runExecute: read-only ready, side-effecting needs-approval (no --approved)', async () => {
  const dir = await tmp();
  const f = await writeDecision(dir, allThree);
  const { steps } = await runExecute({ decisionFile: f, mapFile: FIXT, config: loadConfig({}), now: NOW });
  const byId = Object.fromEntries(steps.map((s) => [s.id, s]));
  assert.equal(byId['builtin::core::builtin-tool::Grep'].status, 'ready');        // read-only
  assert.equal(byId['builtin::core::bang::shell'].status, 'needs-approval');      // side-effecting
  assert.equal(byId['mp::p::skill::s'].status, 'needs-approval');                 // side-effecting
  await rm(dir, { recursive: true, force: true });
});

test('runExecute: --approved flips a side-effecting step to ready', async () => {
  const dir = await tmp();
  const f = await writeDecision(dir, allThree);
  const approvedIds = new Set(['builtin::core::bang::shell']);
  const { steps } = await runExecute({ decisionFile: f, mapFile: FIXT, config: loadConfig({}), approvedIds, now: NOW });
  const byId = Object.fromEntries(steps.map((s) => [s.id, s]));
  assert.equal(byId['builtin::core::bang::shell'].status, 'ready');               // approved
  assert.equal(byId['mp::p::skill::s'].status, 'needs-approval');                 // not approved
  await rm(dir, { recursive: true, force: true });
});

test('runExecute fails soft on a missing decision file', async () => {
  const { steps, lines } = await runExecute({ decisionFile: '/no/such.json', mapFile: FIXT, config: loadConfig({}), now: NOW });
  assert.deepEqual(steps, []);
  assert.match(lines.join('\n'), /okunamad|plan yok/i);
});

test('runExecute returns empty for a below-threshold decision (gate not bypassed)', async () => {
  const dir = await tmp();
  const f = await writeDecision(dir, { ...allThree, confidence: 0.3 });
  const { steps } = await runExecute({ decisionFile: f, mapFile: FIXT, config: loadConfig({ confidenceThreshold: 0.6 }), now: NOW });
  assert.deepEqual(steps, []);
  await rm(dir, { recursive: true, force: true });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test test/execute-cli.test.js`
Expected: FAIL — `runExecute` is not exported by cli.js.

- [ ] **Step 4: Write minimal implementation**

In `plugin/lib/cli.js`:

(a) Add the import near the other lib imports (after the `planInstalls, executeInstalls` import line):

```javascript
import { planExecution } from './execution.js';
```

(b) Add these two functions ABOVE the `async function main(argv)` definition:

```javascript
function formatExecStep(s) {
  return `  [${s.status}] ${s.risk} · ${s.action}: ${s.id}`;
}

export async function runExecute({ decisionFile, mapFile, config, approvedIds = new Set(), now }) {
  const { map } = await loadMap({ mapFile, staleDays: config.staleDays, now });
  let raw = null;
  try { raw = JSON.parse(await readFile(decisionFile, 'utf8')); } catch { raw = null; }
  if (!raw || !map) {
    return { steps: [], decision: 'no_capability_needed', lines: ['[cc-autopilot] yürütme: karar/harita okunamadı, plan yok'] };
  }
  // Re-apply the same gate as `decide`/`install` (low confidence / unknown ids -> nothing to run).
  const knownIds = new Set(map.capabilities.map((c) => c.id));
  const decision = normalizeDecision(raw, { confidenceThreshold: config.confidenceThreshold, knownIds });
  const steps = planExecution(decision, map).map((s) => ({
    ...s,
    status: s.risk === 'read-only' || approvedIds.has(s.id) ? 'ready' : 'needs-approval'
  }));
  const lines = ['[cc-autopilot] yürütme planı:', ...steps.map(formatExecStep)];
  if (!steps.length) lines.push('  (yürütülecek adım yok)');
  if (steps.some((s) => s.status === 'needs-approval')) {
    lines.push("(Yan-etkili adımlar onay bekliyor — '--approved <id>' ile teyit edin.)");
  }
  return { steps, decision: decision.decision, lines };
}
```

(c) In `main(argv)`, add an `execute` branch right AFTER the `install` branch's closing `}` and before the final `else`:

```javascript
  } else if (cmd === 'execute') {
    const decisionFile = argv[3];
    if (!decisionFile || decisionFile.startsWith('--')) {
      console.error('Usage: cli.js execute <decisionFile> [--approved id1,id2]');
      process.exitCode = 1;
      return;
    }
    const ai = argv.indexOf('--approved');
    const approvedIds = ai !== -1 && argv[ai + 1] ? new Set(argv[ai + 1].split(',')) : new Set();
    const { steps, decision, lines } = await runExecute({ decisionFile, mapFile, config, approvedIds, now });
    console.log(lines.join('\n'));
    console.log(`\n${JSON.stringify({ decision, steps })}`);
```

(d) Update the final usage line from:
```javascript
    console.error('Usage: cli.js <preview|candidates|decide|install> ...');
```
to:
```javascript
    console.error('Usage: cli.js <preview|candidates|decide|install|execute> ...');
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test test/execute-cli.test.js`
Expected: PASS (4 tests green).

Also run the FULL plugin suite:
`cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add plugin/lib/cli.js plugin/test/execute-cli.test.js plugin/test/fixtures/capability-map.exec.sample.json
git commit -m "feat(execution): cli execute (plan + risk + --approved gate; runs nothing)"
```

---

## Task 5: SKILL.md Step 8 + frontmatter + route.md

**Files:**
- Modify: `plugin/skills/capability-router/SKILL.md`
- Modify: `plugin/commands/route.md`

- [ ] **Step 1: Broaden SKILL.md frontmatter allowed-tools**

In `plugin/skills/capability-router/SKILL.md`, change the frontmatter line:
```
allowed-tools: Bash(node *), Task, Write, Read
```
to:
```
allowed-tools: Bash, Task, Write, Read, Skill
```
(Execution needs general `Bash` for `run_shell`/ssh and `Skill` for `invoke_skill`. CC's own permission model plus the recipe's approval gate cover safety.)

- [ ] **Step 2: Defer scratch-file cleanup from Step 7 to Step 8**

In Step 7, find this exact sentence (the last lines of Step 7):
```
Finally, clean up the scratch file — but ONLY after any `--approved` re-runs are done (the re-run
reads the same `.decision.tmp.json`, so do not delete it before then).
```
Replace it with:
```
Do NOT clean up the scratch file yet — Step 8 (Execute) reads the same `.decision.tmp.json`.
```

- [ ] **Step 3: Insert Step 8 before "## Failure handling"**

Find the line `## Failure handling` and insert the following BLOCK immediately BEFORE it (leave a blank line between this block and the `## Failure handling` heading):

````markdown
## Step 8 — Execute (carry out the task)
Turn the decision into action. Run:
```bash
node "$PLUGIN_ROOT/lib/cli.js" execute "$PLUGIN_ROOT/.decision.tmp.json"
```
Parse the **last line** (canonical JSON `{ "decision": ..., "steps": [...] }`); the lines above are a human-readable summary. Each step is `{ id, name, kind, action, risk, directive, status }`.

- If `decision` is `no_capability_needed` or `steps` is empty → do nothing here; accomplish the user's request with your normal behavior.
- **Ready steps** (`status: "ready"` — read-only) → carry them out NOW using the real tool the `action`/`directive` names: `use_tool`→use Grep/Read/etc.; `dispatch_agent`→Explore/Plan via the Task tool; `invoke_slash`→the analysis command. No approval needed.
- **Approval-pending steps** (`status: "needs-approval"` — side-effecting) → present ALL of them in ONE message. For each, show `id`, `action`, and for `run_shell` the EXACT shell command you will run (composed from the user's request). Ask for a single approval.
  - If approved: confirm with the same command plus the approved ids, then carry out each step with the real tool (`run_shell`→Bash; `use_tool`→Write/Edit/Bash; `dispatch_agent`→Task; `invoke_skill`→Skill; `call_mcp`→the MCP tool):
    ```bash
    node "$PLUGIN_ROOT/lib/cli.js" execute "$PLUGIN_ROOT/.decision.tmp.json" --approved <comma,separated,ids>
    ```
  - If declined: skip those steps and say so.
- Report what was executed, what was skipped, and any errors.

**Fail-soft:** if `execute` errors or the plan is unusable, do NOT break the user's task — fall back to your normal behavior and say so. A single step's failure does not abort the rest; continue and summarize at the end.

Finally, clean up the scratch file (`PLUGIN_ROOT/.decision.tmp.json`) — but ONLY after all `--approved` re-runs are done.
````

- [ ] **Step 4: Replace route.md with the decide+execute version**

Replace the ENTIRE contents of `plugin/commands/route.md` with:

```markdown
---
description: Route a request through the cc-autopilot capability council, then carry out the task — read-only steps run automatically, side-effecting steps (incl. shell/ssh) ask for one approval
allowed-tools: Bash, Task, Write, Read, Skill
---

# /route — capability council + executor

Use the **capability-router** skill to route the following request through the multi-agent council (Planner + Critic), reach a validated decision (use_existing / install_then_use / no_capability_needed), install any required trusted capability, and then **carry out the task** using the chosen capability.

Request: $ARGUMENTS

Follow the skill's steps exactly, including the execution step (Step 8): read-only steps run without approval; side-effecting steps (shell/ssh, file writes, agents, skills, installs) are presented for a single approval before running. If no capability is needed, just handle the request normally. Never break the underlying task — execution is fail-soft.
```

- [ ] **Step 5: Verify the edits**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot && git diff plugin/skills/capability-router/SKILL.md plugin/commands/route.md`
Expected: frontmatter broadened; Step 7 cleanup sentence replaced; Step 8 added before Failure handling; route.md fully rewritten. No contradictions (e.g. no remaining "installs nothing"/"without running them" text in route.md).

- [ ] **Step 6: Commit**

```bash
git add plugin/skills/capability-router/SKILL.md plugin/commands/route.md
git commit -m "feat(execution): council Step 8 executes the decision (read-only auto, side-effecting one approval)"
```

---

## Task 6: SMOKE.md yürütme senaryoları

**Files:**
- Modify: `plugin/skills/capability-router/SMOKE.md`

- [ ] **Step 1: Append execution smoke scenarios**

Append the following to the END of `plugin/skills/capability-router/SMOKE.md`:

```markdown

## SP6 — Execution (Step 8) smoke scenarios

These are manual transcript checks (no automated runner). The deterministic plan/risk pieces
are unit-tested in `test/execution.test.js` and `test/execute-cli.test.js`; these verify the
recipe's behavior end-to-end.

### S1 — read-only runs without approval
Request: "this repoda 'TODO' geçen yerleri bul".
Expect: council → `use_existing` with builtin `Grep` → `execute` plan shows `[ready] read-only · use_tool: builtin::core::builtin-tool::Grep` → agent runs Grep directly, no approval prompt, reports matches.

### S2 — side-effecting asks once, then runs
Request: "10.10.15.141 sunucusunda `df -h` çalıştır".
Expect: council → `use_existing` with builtin `shell` (bang) → `execute` plan shows `[needs-approval] side-effecting · run_shell: builtin::core::bang::shell` → agent shows the EXACT command (`ssh root@10.10.15.141 df -h`) and asks one approval → on yes, re-run with `--approved builtin::core::bang::shell`, run via Bash, report output; on no, skip and say so.

### S3 — mixed plan, single approval
Request that yields one read-only + one side-effecting step.
Expect: read-only step runs immediately; the side-effecting step is batched into a single approval message; declining skips only the side-effecting step while the read-only result still stands.

### S4 — fail-soft
Simulate `execute` erroring (e.g. corrupt `.decision.tmp.json`).
Expect: recipe does NOT break the task; falls back to normal behavior and says so.
```

- [ ] **Step 2: Verify**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot && git diff plugin/skills/capability-router/SMOKE.md`
Expected: only an appended section; nothing above changed.

- [ ] **Step 3: Commit**

```bash
git add plugin/skills/capability-router/SMOKE.md
git commit -m "docs(execution): SMOKE scenarios for Step 8 execution (read-only/approval/fail-soft)"
```

---

## Task 7: uçtan-uca doğrulama

**Files:** (yok — doğrulama)

- [ ] **Step 1: Run the full plugin suite**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin && node --test`
Expected: all PASS (76 previous + ~14 new = ~90).

- [ ] **Step 2: Run the full indexer suite (no regression)**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot/indexer && node --test`
Expected: 48/48 PASS (unchanged — SP6 does not touch indexer).

- [ ] **Step 3: Live execute CLI check (no --approved)**

Run:
```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin
printf '%s' '{"decision":"use_existing","capabilities":["builtin::core::bang::shell","builtin::core::builtin-tool::Grep","mp::p::skill::s"],"installs":[],"method":"x","rationale":"r","confidence":0.9}' > /tmp/cc-exec-decision.json
node lib/cli.js execute /tmp/cc-exec-decision.json --map test/fixtures/capability-map.exec.sample.json 2>/dev/null || node lib/cli.js execute /tmp/cc-exec-decision.json
```
Note: the CLI loads the map from config (the live 1047-cap map), which DOES contain `builtin::core::bang::shell` and `builtin::core::builtin-tool::Grep` (from SP5) but NOT `mp::p::skill::s`. So expect the plan to show `shell` (needs-approval), `Grep` (ready), and `mp::p::skill::s` dropped (not in live map). The last line is JSON `{ "decision": "use_existing", "steps": [...] }`.

Expected (last JSON line, ids present in the live map):
- `builtin::core::bang::shell` → `needs-approval`, `run_shell`
- `builtin::core::builtin-tool::Grep` → `ready`, `use_tool`

- [ ] **Step 4: Live execute CLI check (with --approved)**

Run:
```bash
cd /c/Users/harun.hanbay/Desktop/cc-autopilot/plugin
node lib/cli.js execute /tmp/cc-exec-decision.json --approved builtin::core::bang::shell
```
Expected: `builtin::core::bang::shell` now `ready` in the last-line JSON.

- [ ] **Step 5: Confirm clean (no stray files committed)**

Run: `cd /c/Users/harun.hanbay/Desktop/cc-autopilot && git status -s`
Expected: only the untracked `*.stackdump` junk (pre-existing); no accidental scratch/decision files staged.

---

## Tamamlanma Kriteri (spec §9 ile eşleşir)

- [ ] `plugin/lib/execution.js`: `actionFor`/`classifyRisk`/`directiveFor`/`planExecution` saf + tam testli.
- [ ] `cli execute`: doğru plan + onay durumu (son-satır JSON), `--approved` çalışıyor, hiçbir şey çalıştırmıyor, fail-soft.
- [ ] `classifyRisk` allow-list'i doğru ayırıyor; bilinmeyen → side-effecting.
- [ ] SKILL Step 8 + route.md: salt-okunur oto, yan-etkili tek onay, fail-soft.
- [ ] Tüm testler yeşil (plugin ~90 + indexer 48); teknik borç yok.
```
