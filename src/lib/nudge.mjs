import { formatDuration, formatResetTime } from './format.mjs';

const WINDOWS = ['five_hour', 'seven_day'];
const LABELS = { five_hour: '5-hour', seven_day: '7-day (weekly)' };

// Shared by prompt-guard.mjs (UserPromptSubmit) and tool-guard.mjs
// (PostToolUse) so a threshold crossing detected mid-task by one doesn't
// get re-announced by the other. Mutates `state` in place (nudged sets,
// windowResetsAt) and returns message strings for any threshold freshly
// crossed since the last check.
export function computeNudges(state, config, nowSeconds) {
  if (!state.rate_limits) return [];
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
        const secondsToReset = resetsAt ? resetsAt - nowSeconds : null;
        if (secondsToReset == null || secondsToFull < secondsToReset) {
          etaStr = formatDuration(secondsToFull);
        }
      }
    }

    const resetStr = formatResetTime(resetsAt, nowSeconds * 1000);
    let msg = `Curfew: ${LABELS[win]} window at ${Math.round(pct)}%`;
    if (resetStr) msg += ` (resets ${resetStr})`;
    if (etaStr) msg += `. At the current pace you may hit the cap in ~${etaStr}`;
    msg +=
      ". Wrap up now: finish or checkpoint the current task and summarize progress before the window runs out, rather than leaving code half-edited for the window to reset.";

    messages.push(msg);
    state.nudged[win] = [...alreadyNudged, ...eligible];
  }

  return messages;
}
