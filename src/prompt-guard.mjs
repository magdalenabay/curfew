#!/usr/bin/env node
// Claude Code UserPromptSubmit hook. Plain stdout from this hook (exit 0)
// is injected into Claude's context — the one hook event where that's true —
// so this is how Claude actually gets "told" to wrap up, rather than just
// showing a human a status bar. Catches sessions where a whole reply had
// no tool calls, which tool-guard.mjs (PostToolUse) would otherwise miss.
import { readState, writeState } from './lib/state.mjs';
import { loadConfig } from './lib/config.mjs';
import { computeNudges } from './lib/nudge.mjs';

let input = '';
process.stdin.on('data', (chunk) => (input += chunk));
process.stdin.on('end', () => {
  let hookInput;
  try {
    hookInput = JSON.parse(input);
  } catch {
    process.exit(0);
  }

  const sessionId = hookInput.session_id;
  if (!sessionId) process.exit(0);

  const state = readState(sessionId);
  // Nothing from statusline.mjs yet. Either source alone is enough: usage
  // windows need a subscription, the prompt cache doesn't.
  if (!state.rate_limits && !state.prompt_cache) process.exit(0);

  const config = loadConfig();
  const now = Math.floor(Date.now() / 1000);
  const messages = computeNudges(state, config, now);

  if (messages.length) {
    writeState(sessionId, state);
    console.log(messages.join('\n'));
  }

  process.exit(0);
});
