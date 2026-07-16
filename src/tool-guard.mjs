#!/usr/bin/env node
// Claude Code PostToolUse hook — fires after EVERY tool call, mid-turn,
// not just at the start of the next user message. This is what lets
// curfew interrupt a long autonomous run before it runs out the clock
// mid-edit, instead of only warning once Claude is already done and
// waiting on you to send another message.
//
// A bash+jq "gate" version of this was tried to dodge Node's ~70ms
// startup cost on the common no-op case, but measured slower in
// practice: on Windows, process creation itself is the expensive part,
// not which interpreter you launch, so a script forking bash + jq twice
// + a couple of coreutils costs more than one Node invocation, not less.
// Plain Node it is.
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
