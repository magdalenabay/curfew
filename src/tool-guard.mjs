#!/usr/bin/env node
// Claude Code PostToolUse hook — fires after EVERY tool call, mid-turn,
// not just at the start of the next user message. This is what lets
// usage-guard interrupt a long autonomous run before it runs out the
// clock mid-edit, instead of only warning once Claude is already done
// and waiting on you to send another message.
//
// Uses hookSpecificOutput.additionalContext, which Claude Code injects
// next to the tool result — the conversation continues so Claude reads
// it and can act on it immediately, in the same turn.
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
  if (!state.rate_limits) process.exit(0); // statusline.mjs hasn't reported anything yet

  const config = loadConfig();
  const now = Math.floor(Date.now() / 1000);
  const messages = computeNudges(state, config, now);

  if (messages.length) {
    writeState(sessionId, state);
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: messages.join('\n')
        }
      })
    );
  }

  process.exit(0);
});
