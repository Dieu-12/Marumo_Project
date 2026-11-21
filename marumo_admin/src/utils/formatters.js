export function formatCurrency(amount, currency = 'USD') {
  const num = Number(amount);
  if (!Number.isFinite(num)) return '$0';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: num % 1 === 0 ? 0 : 2,
  }).format(num);
}

export function formatCompactCurrency(amount) {
  const num = Number(amount);
  if (!Number.isFinite(num)) return '$0';
  if (Math.abs(num) >= 1_000_000) {
    return `$${(num / 1_000_000).toFixed(2)}M`;
  }
  if (Math.abs(num) >= 1_000) {
    return `$${(num / 1_000).toFixed(1)}K`;
  }
  return formatCurrency(num);
}

export function formatNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  return new Intl.NumberFormat('en-US').format(num);
}

export function formatDuration(minutes) {
  const mins = Number(minutes);
  if (!Number.isFinite(mins) || mins <= 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function calculateEndTime(startTime, durationMinutes) {
  if (!startTime || typeof startTime !== 'string') return '';
  const match = startTime.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '';
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  const duration = Number(durationMinutes);
  if (!Number.isFinite(duration) || duration <= 0) return '';
  const totalMinutes = hours * 60 + mins + duration;
  const endHours = Math.floor(totalMinutes / 60) % 24;
  const endMins = totalMinutes % 60;
  return `${String(endHours).padStart(2, '0')}:${String(endMins).padStart(2, '0')}`;
}

export function formatDate(isoDate) {
  if (!isoDate) return '—';
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

export function formatPercentDelta(delta) {
  const num = Number(delta);
  if (!Number.isFinite(num)) return '0.0%';
  const prefix = num > 0 ? '+' : '';
  return `${prefix}${num.toFixed(1)}%`;
}
