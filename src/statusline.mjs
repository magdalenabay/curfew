#!/usr/bin/env node
// Claude Code statusLine command. Renders 5-hour/weekly rate-limit usage,
// prompt-cache state and context-window fill. It's the ONLY place the first
// two are exposed, so it also persists a snapshot per session for
// prompt-guard.mjs and tool-guard.mjs (hooks) to read, since hooks get
// neither `rate_limits` nor `prompt_cache` on their own stdin.
import { readState, writeState, pruneStaleSessions, MAX_HISTORY_SAMPLES } from './lib/state.mjs';
import { loadConfig } from './lib/config.mjs';
import { bar, colorFor, RESET, formatResetTime } from './lib/format.mjs';
import { cacheSegment } from './lib/cache.mjs';
import { contextSegment } from './lib/context.mjs';

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
  const promptCache = data.prompt_cache;

  if (!sessionId) {
    console.log(`[${model}]`);
    return;
  }

  const config = loadConfig();
  const now = Math.floor(Date.now() / 1000);

  // Without `rate_limits` (not a Pro/Max session, or no API response yet) and
  // `prompt_cache` (older Claude Code) there's nothing for the guards to read,
  // but the context meter can still have something to show.
  if (rateLimits || promptCache) {
    persist(sessionId, rateLimits, promptCache, now);
  }

  const segments = [];
  for (const win of WINDOWS) {
    const w = rateLimits?.[win];
    if (!w || w.used_percentage == null) continue;
    const pct = Math.round(w.used_percentage);
    const color = colorFor(pct);
    const resetStr = formatResetTime(w.resets_at);
    segments.push(
      `${color}${LABELS[win]} ${bar(pct, config.bar.width)} ${pct}%${RESET}${resetStr ? ` (resets ${resetStr})` : ''}`
    );
  }

  const cache = cacheSegment(promptCache, config, now * 1000);
  if (cache) segments.push(cache);

  const ctx = contextSegment(data, config);
  if (ctx) segments.push(ctx);

  console.log(segments.length ? `[${model}] ${segments.join('  ·  ')}` : `[${model}]`);
});

function persist(sessionId, rateLimits, promptCache, now) {
  const state = readState(sessionId);
  state.history ||= {};
  if (rateLimits) {
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
  }
  // Written on every render, so a cache entry that has since been refreshed
  // never leaves a stale `expires_at` behind for the guards to count down.
  state.prompt_cache = promptCache ?? null;
  state.updated_at = now;
  writeState(sessionId, state);

  // Occasional housekeeping; cheap enough to check on every render.
  if (Math.random() < 0.02) pruneStaleSessions();
}
