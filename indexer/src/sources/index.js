import * as official from './official-catalog.js';
import * as known from './known-marketplaces.js';
import * as builtin from './builtin-catalog.js';
import * as github from './github.js';
import * as npm from './npm.js';
import * as mcpRegistry from './mcp-registry.js';

// Ordered by authority. official/known/builtin are local; github/npm/mcp-registry are
// web-discovery (network via injected ctx.fetchJson; fail-soft when offline/rate-limited).
export const sources = [official, known, builtin, github, npm, mcpRegistry];
