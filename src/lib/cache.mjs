// Prompt-cache reporting, from the `prompt_cache` object Claude Code puts on
// the statusLine's stdin (Claude Code 2.1.251+; `last_miss_cause` 2.1.260+).
//
// Claude Code derives the TTL, hit ratio and miss causes itself from the cache
// token counts in each API response, so — unlike a function-hooks mod, which
// is handed only the four raw counts and has to infer the lifetime by watching
// whether a late request still hit — we just read them. Every field is
// optional: the object is absent on older Claude Code versions and until the
// main conversation's first API response.
import { bar, fmtClock, fmtTokens, formatDuration, RESET } from './format.mjs';

const TTL_MS = { '5m': 300_000, '1h': 3_600_000 };
const DEFAULT_TTL = '5m';
const DIM = '\x1b[90m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';

// A cache write costs 1.25x base input at the 5-minute lifetime and 2x at the
// hour; a read costs about 0.1x. That gap is why a cold cache on a large
// prompt is the one genuinely expensive moment in a session.
const WRITE_MULTIPLIER = { '5m': '1.25x', '1h': '2x' };

// Below this, the countdown is close enough to show seconds.
const SECONDS_MATTER_MS = 600_000;

export function ttlMs(ttl) {
  return TTL_MS[ttl] ?? TTL_MS[DEFAULT_TTL];
}

/**
 * Normalized cache state, or null when Claude Code reported nothing.
 *
 * Coldness is derived from `expires_at` against `nowMs`, never from the `warm`
 * flag: the guards read this back out of the state file seconds or minutes
 * after the status line wrote it, by which point `warm` is a stale boolean
 * while `expires_at` is still exactly as true as when it was recorded.
 */
export function cacheState(promptCache, config, nowMs = Date.now()) {
  if (!promptCache || typeof promptCache !== 'object') return null;

  const ttl = promptCache.ttl === '1h' || promptCache.ttl === '5m' ? promptCache.ttl : DEFAULT_TTL;
  const expiresAt = typeof promptCache.expires_at === 'number' ? promptCache.expires_at : null;
  const base = {
    ttl,
    expiresAt,
    hitRatio: typeof promptCache.hit_ratio === 'number' ? promptCache.hit_ratio : null,
    misses: typeof promptCache.misses === 'number' ? promptCache.misses : 0,
    rebuildTokens:
      typeof promptCache.recache_tokens_if_cold === 'number' ? promptCache.recache_tokens_if_cold : null,
    leftMs: 0,
    lifeRatio: 0
  };

  // Caching off entirely, or a provider/gateway that doesn't report it.
  if (promptCache.caching_observed === false) return { ...base, kind: 'off' };
  // No cache tokens on the last response, so there is no entry to count down —
  // a prompt under the model's minimum, or caching disabled upstream.
  if (expiresAt == null) return { ...base, kind: 'uncached' };

  const leftMs = Math.max(0, expiresAt * 1000 - nowMs);
  const state = { ...base, leftMs, lifeRatio: Math.min(1, leftMs / ttlMs(ttl)) };
  if (leftMs <= 0) return { ...state, kind: 'cold' };
  if (leftMs <= config.cache.warn_seconds * 1000) return { ...state, kind: 'expiring' };
  return { ...state, kind: 'warm' };
}

/** Whether going cold here means re-writing a prompt big enough to be worth a /compact. */
export function isExpensiveRebuild(state, config) {
  return state.rebuildTokens != null && state.rebuildTokens >= config.cache.compact_at_tokens;
}

export function cacheWriteMultiplier(ttl) {
  return WRITE_MULTIPLIER[ttl] ?? WRITE_MULTIPLIER[DEFAULT_TTL];
}

// Colour tracks cache *health*, not the hit ratio the bar already shows: green
// while warm, yellow once it's about to lapse, and red only for a cold cache
// whose rebuild is actually expensive — a cold 20k prompt is not worth alarm.
function colorFor(state, config) {
  switch (state.kind) {
    case 'off':
    case 'uncached':
      return DIM;
    case 'expiring':
      return YELLOW;
    case 'cold':
      return isExpensiveRebuild(state, config) ? RED : YELLOW;
    default:
      return GREEN;
  }
}

function noteFor(state) {
  switch (state.kind) {
    case 'uncached':
      return 'not cached';
    case 'cold': {
      const rebuild = fmtTokens(state.rebuildTokens);
      return rebuild ? `cold, rebuild ${rebuild}` : 'cold';
    }
    default:
      return `cold in ${state.leftMs < SECONDS_MATTER_MS ? fmtClock(state.leftMs) : formatDuration(state.leftMs / 1000)}`;
  }
}

/**
 * The status line's cache segment, or null when there's nothing to say.
 * The bar is the session's cache hit ratio; the parenthetical is how long the
 * current entry has left. Both come straight from Claude Code.
 */
export function cacheSegment(promptCache, config, nowMs = Date.now()) {
  if (!config.cache.enabled) return null;
  const state = cacheState(promptCache, config, nowMs);
  if (!state) return null;
  if (state.kind === 'off') return `${DIM}cache off${RESET}`;

  const color = colorFor(state, config);
  let head = 'cache';
  if (state.hitRatio != null) {
    const pct = Math.round(state.hitRatio * 100);
    head += ` ${bar(pct, config.bar.width)} ${pct}%`;
  }

  let text = `${color}${head}${RESET} (${noteFor(state)})`;
  // Single-spaced "·" so it reads as subordinate to the double-spaced one
  // separating whole segments.
  if (config.cache.show_misses && state.misses > 0) {
    text += ` · ${state.misses} miss${state.misses === 1 ? '' : 'es'}`;
  }
  return text;
}
