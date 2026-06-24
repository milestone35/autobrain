import { makeCapability } from '../normalize.js';

export const name = 'builtin';

// Sabit, küratörlü liste. Claude Code'un kurulum gerektirmeyen yerleşik yetenekleri.
// CC sürümüyle nadiren değişir; gerektiğinde elle güncelle (YAGNI).
const BUILTINS = [
  { kind: 'bang', name: 'shell',
    description: 'Run any shell command inline in the session (git, ls, ssh, curl, build tools).',
    keywords: ['shell', 'command', 'ssh', 'remote', 'git', 'curl', 'terminal', 'run', 'bash'] },

  { kind: 'builtin-tool', name: 'Read', description: 'Read a file from the filesystem.', keywords: ['read', 'file', 'view', 'open'] },
  { kind: 'builtin-tool', name: 'Write', description: 'Write a new file or overwrite an existing one.', keywords: ['write', 'file', 'create', 'save'] },
  { kind: 'builtin-tool', name: 'Edit', description: 'Make an exact string replacement in a file.', keywords: ['edit', 'file', 'modify', 'change', 'replace'] },
  { kind: 'builtin-tool', name: 'Grep', description: 'Search file contents with a regular expression (ripgrep).', keywords: ['grep', 'search', 'find', 'regex', 'content'] },
  { kind: 'builtin-tool', name: 'Glob', description: 'Find files by glob pattern.', keywords: ['glob', 'find', 'files', 'pattern', 'path'] },
  { kind: 'builtin-tool', name: 'Bash', description: 'Execute a bash command and return its output.', keywords: ['bash', 'command', 'shell', 'execute', 'run', 'script'] },
  { kind: 'builtin-tool', name: 'WebFetch', description: 'Fetch a URL and process its content.', keywords: ['web', 'fetch', 'url', 'http', 'download', 'page'] },
  { kind: 'builtin-tool', name: 'WebSearch', description: 'Search the web for current information.', keywords: ['web', 'search', 'google', 'internet', 'lookup', 'research'] },
  { kind: 'builtin-tool', name: 'Task', description: 'Launch a subagent to handle a complex multi-step task.', keywords: ['task', 'agent', 'subagent', 'delegate', 'parallel'] },

  { kind: 'slash', name: '/init', description: 'Initialize a CLAUDE.md with codebase documentation.', keywords: ['init', 'claudemd', 'document', 'setup', 'onboard'] },
  { kind: 'slash', name: '/review', description: 'Review a pull request.', keywords: ['review', 'pull', 'request', 'code', 'feedback'] },
  { kind: 'slash', name: '/security-review', description: 'Run a security review of pending changes on the branch.', keywords: ['security', 'review', 'vulnerability', 'audit', 'scan'] },
  { kind: 'slash', name: '/code-review', description: 'Review the current diff for bugs and cleanups.', keywords: ['code', 'review', 'diff', 'bug', 'cleanup', 'quality'] },

  { kind: 'builtin-agent', name: 'Explore', description: 'Read-only search agent for broad fan-out searches across many files.', keywords: ['explore', 'search', 'find', 'agent', 'codebase', 'discover'] },
  { kind: 'builtin-agent', name: 'Plan', description: 'Software architect agent for designing implementation plans.', keywords: ['plan', 'architect', 'design', 'agent', 'strategy'] },
  { kind: 'builtin-agent', name: 'general-purpose', description: 'General-purpose agent for complex research and multi-step tasks.', keywords: ['general', 'agent', 'research', 'task', 'multi', 'step'] },
  { kind: 'builtin-agent', name: 'code-reviewer', description: 'Agent that reviews completed work against the plan and coding standards.', keywords: ['code', 'reviewer', 'agent', 'review', 'standards', 'quality'] }
];

export async function collect(ctx) {
  const { now } = ctx;
  const capabilities = BUILTINS.map((b) => makeCapability({
    kind: b.kind, name: b.name, description: b.description, keywords: b.keywords,
    marketplace: 'builtin', plugin: 'core', component: b.name,
    // install verilmedi -> normalize install:null yapar
    cost: null, popularity: { unique_installs: null },
    source: { repo: null, discoveredVia: 'builtin' }, now
  }));
  return { capabilities, ok: true };
}
