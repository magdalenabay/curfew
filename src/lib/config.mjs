import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CONFIG_PATH = path.join(os.homedir(), '.claude', 'curfew', 'config.json');

const DEFAULTS = {
  // Percentages at which prompt-guard.mjs will nudge Claude, once each,
  // per rate-limit window. Set a window to [] to disable nudging for it.
  thresholds: {
    five_hour: [70, 85, 95],
    seven_day: [70, 90]
  },
  // Width in characters of the progress bar drawn in the status line.
  bar: { width: 10 },
  // Prompt-cache meter in the status line, and the one nudge it can raise.
  cache: {
    enabled: true,
    // Seconds left on the cache entry at which the meter turns yellow.
    warn_seconds: 60,
    // Prompt size that makes a cold cache worth flagging rather than ignoring.
    // A judgement call, not a documented figure: lower it if cache writes are
    // expensive for you.
    compact_at_tokens: 100000,
    // Append the session's cache-miss count to the meter.
    show_misses: false,
    // Tell Claude, once per lapsed entry, when a cold cache gets expensive.
    nudge: true
  },
  // Context-window meter in the status line.
  context: { enabled: true }
};

export function loadConfig() {
  try {
    const user = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return {
      ...DEFAULTS,
      ...user,
      thresholds: { ...DEFAULTS.thresholds, ...(user.thresholds || {}) },
      bar: { ...DEFAULTS.bar, ...(user.bar || {}) },
      cache: { ...DEFAULTS.cache, ...(user.cache || {}) },
      context: { ...DEFAULTS.context, ...(user.context || {}) }
    };
  } catch {
    return DEFAULTS;
  }
}
