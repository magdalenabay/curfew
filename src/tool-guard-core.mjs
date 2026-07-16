#!/usr/bin/env node
// Real PostToolUse nudge logic (threshold tracking, ETA estimate, state
// mutation). NOT wired directly into settings.json — tool-guard.sh is the
// actual hook entrypoint; it does a cheap bash+jq gate check first and
// only spawns this script when a threshold might actually have been
// crossed, since PostToolUse fires after every single tool call and
// Node's ~70ms startup cost isn't worth paying on the common no-op case.
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
