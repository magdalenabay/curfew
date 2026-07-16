#!/usr/bin/env node
// Claude Code statusLine command. Renders 5-hour/weekly rate-limit usage
// and is the ONLY place this data is exposed, so it also persists a snapshot
// per session for prompt-guard.mjs (a hook) to read, since hooks don't
// receive rate_limits on their own stdin.
import { readState, writeState, pruneStaleSessions, MAX_HISTORY_SAMPLES } from './lib/state.mjs';
import { loadConfig } from './lib/config.mjs';
import { bar, colorFor, RESET, formatResetTime } from './lib/format.mjs';

const WINDOWS = ['five_hour', 'seven_day'];
const LABELS = { five_hour: '5h', seven_day: '7d' };

let input = '';
process.stdin.on('data', (chunk) => (input += chunk));
process.stdin.on('end', () => {
  let data;
  try {
    data = JSON.parse(input);
  } catch {
    process.exit(0);
  }

  const model = data.model?.display_name || 'Claude';
  const sessionId = data.session_id;
  const rateLimits = data.rate_limits;

  if (!sessionId || !rateLimits) {
    // Not a Pro/Max session yet, or no API response has landed. Nothing to show.
    console.log(`[${model}]`);
    return;
  }

  const config = loadConfig();
  const state = readState(sessionId);
  const now = Math.floor(Date.now() / 1000);

  state.history ||= {};
  for (const win of WINDOWS) {
    const w = rateLimits[win];
    if (!w || w.used_percentage == null) continue;
    state.history[win] ||= [];
    state.history[win].push({ t: now, pct: w.used_percentage });
    if (state.history[win].length > MAX_HISTORY_SAMPLES) {
      state.history[win] = state.history[win].slice(-MAX_HISTORY_SAMPLES);
    }
  }
  state.rate_limits = rateLimits;
  state.updated_at = now;
  writeState(sessionId, state);

  // Occasional housekeeping; cheap enough to check on every render.
  if (Math.random() < 0.02) pruneStaleSessions();

  const segments = [];
  for (const win of WINDOWS) {
    const w = rateLimits[win];
    if (!w || w.used_percentage == null) continue;
    const pct = Math.round(w.used_percentage);
    const color = colorFor(pct);
    const resetStr = formatResetTime(w.resets_at);
    segments.push(
      `${color}${LABELS[win]} ${bar(pct, config.bar.width)} ${pct}%${RESET}${resetStr ? ` (resets ${resetStr})` : ''}`
    );
  }

  console.log(segments.length ? `[${model}] ${segments.join('  ·  ')}` : `[${model}]`);
});
