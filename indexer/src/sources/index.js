import * as official from './official-catalog.js';
import * as known from './known-marketplaces.js';

// Ordered by authority. Web-discovery sources (github, mcp-registry, npm, pypi)
// implement the same { name, collect(ctx) } contract and are appended here in a later plan.
export const sources = [official, known];
