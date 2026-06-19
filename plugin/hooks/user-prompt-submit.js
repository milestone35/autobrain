#!/usr/bin/env node
import { handleHook } from '../lib/hook.js';
import { loadPluginConfig, resolveMapFile } from '../lib/cli.js';

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { data += c; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(''));
  });
}

async function main() {
  try {
    const stdinText = await readStdin();
    const config = await loadPluginConfig();
    const mapFile = resolveMapFile(config);
    const result = await handleHook({ stdinText, config, mapFile, now: new Date().toISOString() });
    if (result) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext: result.additionalContext
        }
      }));
    }
  } catch {
    // fail-open: emit nothing
  }
  process.exit(0);
}

main();
