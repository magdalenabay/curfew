import { formatDuration, formatResetTime, fmtTokens } from './format.mjs';
import { cacheState, cacheWriteMultiplier, isExpensiveRebuild } from './cache.mjs';

const WINDOWS = ['five_hour', 'seven_day'];
const LABELS = { five_hour: '5-hour', seven_day: '7-day (weekly)' };

// Shared by prompt-guard.mjs (UserPromptSubmit) and tool-guard.mjs
// (PostToolUse) so something detected mid-task by one doesn't get
// re-announced by the other. Mutates `state` in place (nudged sets,
// windowResetsAt, cacheNudgedFor) and returns message strings for each usage
// threshold freshly crossed since the last check, plus a lapsed prompt cache
// that's expensive to rebuild.
export function computeNudges(state, config, nowSeconds) {
  return [...windowNudges(state, config, nowSeconds), ...cacheNudges(state, config, nowSeconds)];
}

function windowNudges(state, config, nowSeconds) {
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

// A cold cache is the one moment in a session that costs real quota for no
// work: the whole prompt gets re-written at 1.25x (5m) or 2x (1h) input rate,
// billed against the same windows curfew already watches. Claude can't run
// /compact itself, so this is phrased for it to relay.
function cacheNudges(state, config, nowSeconds) {
  if (!config.cache.nudge || !state.prompt_cache) return [];

  const cache = cacheState(state.prompt_cache, config, nowSeconds * 1000);
  if (!cache || cache.kind !== 'cold' || !isExpensiveRebuild(cache, config)) return [];

  // Once per cache entry. `expires_at` moves with every request that writes or
  // refreshes one, so it identifies the entry that just lapsed — and a session
  // that goes quiet repeatedly gets one nudge per lapse, not one per tool call.
  if (state.cacheNudgedFor === cache.expiresAt) return [];
  state.cacheNudgedFor = cache.expiresAt;

  let msg =
    `Curfew: the prompt cache has gone cold (${cache.ttl} lifetime lapsed). Rebuilding it means ` +
    `~${fmtTokens(cache.rebuildTokens)} of prompt re-written at ${cacheWriteMultiplier(cache.ttl)} input rate, ` +
    'charged against the same usage windows as everything else.';

  const causes = state.prompt_cache.last_miss_cause?.causes;
  if (Array.isArray(causes) && causes.length) {
    msg += ` Claude Code attributed the last cache miss to: ${causes.join(', ')}.`;
  }

  msg +=
    ' Finish or checkpoint the current step rather than starting more work on a cold prompt, and tell the' +
    ' user they can /compact to shrink the rebuild, or /clear if this task is done.';

  return [msg];
}
