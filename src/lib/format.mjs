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

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Calendar days between two dates, ignoring clock time, so 11pm → 1am counts
// as 1 day rather than 0. Comparing local midnights keeps DST-shortened and
// -lengthened days at exactly 1.
function calendarDaysBetween(from, to) {
  const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((midnight(to) - midnight(from)) / MS_PER_DAY);
}

export function formatResetTime(epochSeconds, nowMs = Date.now()) {
  if (!epochSeconds) return null;
  const reset = new Date(epochSeconds * 1000);
  if (Number.isNaN(reset.getTime())) return null;

  const time = reset.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  // The weekly window resets up to 7 days out, where a bare clock time says
  // nothing about *which* day the quota comes back — only a same-day reset
  // (i.e. most 5-hour ones) can safely drop the date.
  const days = calendarDaysBetween(new Date(nowMs), reset);
  if (days === 0) return time;
  if (days === 1) return `tomorrow ${time}`;
  // Weekday names repeat every 7 days, so they only disambiguate inside a week.
  if (days > 1 && days < 7) return `${reset.toLocaleDateString([], { weekday: 'short' })} ${time}`;
  return `${reset.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
}

export function formatDuration(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  const total = Math.max(0, Math.round(seconds));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  // Burn-rate ETAs against the weekly window run to days; "103h20m" is unreadable.
  if (d > 0) return h > 0 ? `${d}d${h}h` : `${d}d`;
  return h > 0 ? `${h}h${m}m` : `${m}m`;
}
