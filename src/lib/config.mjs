import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CONFIG_PATH = path.join(os.homedir(), '.claude', 'usage-guard', 'config.json');

const DEFAULTS = {
  // Percentages at which prompt-guard.mjs will nudge Claude, once each,
  // per rate-limit window. Set a window to [] to disable nudging for it.
  thresholds: {
    five_hour: [70, 85, 95],
    seven_day: [70, 90]
  },
  // Width in characters of the progress bar drawn in the status line.
  bar: { width: 10 }
};

export function loadConfig() {
  try {
    const user = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return {
      ...DEFAULTS,
      ...user,
      thresholds: { ...DEFAULTS.thresholds, ...(user.thresholds || {}) },
      bar: { ...DEFAULTS.bar, ...(user.bar || {}) }
    };
  } catch {
    return DEFAULTS;
  }
}
