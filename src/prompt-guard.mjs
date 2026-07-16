#!/usr/bin/env node
// Claude Code UserPromptSubmit hook. Plain stdout from this hook (exit 0)
// is injected into Claude's context — the one hook event where that's true —
// so this is how Claude actually gets "told" to wrap up, rather than just
// showing a human a status bar.
import { readState, writeState } from './lib/state.mjs';
import { loadConfig } from './lib/config.mjs';
import { formatDuration, formatResetTime } from './lib/format.mjs';

const WINDOWS = ['five_hour', 'seven_day'];
const LABELS = { five_hour: '5-hour', seven_day: '7-day (weekly)' };

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
  state.nudged ||= {};
  state.windowResetsAt ||= {};

  const messages = [];

  for (const win of WINDOWS) {
    const w = state.rate_limits[win];
    if (!w || w.used_percentage == null) continue;

    const pct = w.used_percentage;
    const resetsAt = w.resets_at;

    // A window that has rolled over (new resets_at) gets a clean slate of nudges.
    if (state.windowResetsAt[win] && state.windowResetsAt[win] !== resetsAt) {
      state.nudged[win] = [];
    }
    state.windowResetsAt[win] = resetsAt;

    const thresholds = [...(config.thresholds[win] || [])].sort((a, b) => a - b);
    const alreadyNudged = new Set(state.nudged[win] || []);
    const eligible = thresholds.filter((t) => pct >= t && !alreadyNudged.has(t));
    if (eligible.length === 0) continue;

    let etaStr = null;
    const history = state.history?.[win] || [];
    if (history.length >= 2) {
      const first = history[0];
      const last = history[history.length - 1];
      const dt = last.t - first.t;
      const dp = last.pct - first.pct;
      if (dt > 60 && dp > 0) {
        const secondsToFull = ((100 - pct) / dp) * dt;
        const secondsToReset = resetsAt ? resetsAt - now : null;
        if (secondsToReset == null || secondsToFull < secondsToReset) {
          etaStr = formatDuration(secondsToFull);
        }
      }
    }

    const resetStr = formatResetTime(resetsAt);
    let msg = `Claude usage guard: ${LABELS[win]} window at ${Math.round(pct)}%`;
    if (resetStr) msg += ` (resets ${resetStr})`;
    if (etaStr) msg += `. At the current pace you may hit the cap in ~${etaStr}`;
    msg += '. Consider wrapping up the current task and summarizing progress soon.';

    messages.push(msg);
    state.nudged[win] = [...alreadyNudged, ...eligible];
  }

  if (messages.length) {
    writeState(sessionId, state);
    console.log(messages.join('\n'));
  }

  process.exit(0);
});
