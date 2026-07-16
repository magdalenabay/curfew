export function bar(pct, width = 10) {
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round((clamped / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

export function colorFor(pct) {
  if (pct >= 90) return '\x1b[31m'; // red
  if (pct >= 70) return '\x1b[33m'; // yellow
  return '\x1b[32m'; // green
}

export const RESET = '\x1b[0m';

export function formatResetTime(epochSeconds) {
  if (!epochSeconds) return null;
  return new Date(epochSeconds * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function formatDuration(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h > 0 ? `${h}h${m}m` : `${m}m`;
}
