import {
  ADMIN_PROFILE,
  INITIAL_ACTIVITIES,
  INITIAL_BOOKINGS,
  INITIAL_CINEMAS,
  INITIAL_MANAGERS,
  INITIAL_MOVIES,
  INITIAL_NOTIFICATIONS,
  INITIAL_PROMOTIONS,
  INITIAL_SETTINGS,
  INITIAL_SHOWTIMES,
  INITIAL_USERS,
  REVENUE_SERIES_BY_PERIOD,
} from '../data/mockData.js';

export function loadInitialAdminDataset() {
  return {
    adminProfile: { ...ADMIN_PROFILE },
    cinemas: INITIAL_CINEMAS.map((c) => ({ ...c })),
    movies: INITIAL_MOVIES.map((m) => ({ ...m })),
    showtimes: INITIAL_SHOWTIMES.map((s) => ({ ...s })),
    bookings: INITIAL_BOOKINGS.map((b) => ({ ...b })),
    users: INITIAL_USERS.map((u) => ({ ...u })),
    managers: INITIAL_MANAGERS.map((m) => ({ ...m })),
    promotions: INITIAL_PROMOTIONS.map((p) => ({ ...p })),
    activities: INITIAL_ACTIVITIES.map((a) => ({ ...a })),
    notifications: INITIAL_NOTIFICATIONS.map((n) => ({ ...n })),
    settings: { ...INITIAL_SETTINGS },
    revenueSeries: REVENUE_SERIES_BY_PERIOD,
  };
}

export function generateCsvContent(headers, rows) {
  const escapeCell = (val) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const headerLine = headers.map(escapeCell).join(',');
  const dataLines = rows.map((row) => row.map(escapeCell).join(','));
  return [headerLine, ...dataLines].join('\n');
}

export function downloadCsvFile(filename, headers, rows) {
  const csv = generateCsvContent(headers, rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
