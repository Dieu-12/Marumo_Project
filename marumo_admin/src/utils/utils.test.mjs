import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCurrency,
  formatCompactCurrency,
  formatDuration,
  calculateEndTime,
  formatPercentDelta,
} from './formatters.js';
import {
  validateCinemaForm,
  validateMovieForm,
  validateShowtimeForm,
  validateManagerForm,
  validatePromotionForm,
  validateSettingsForm,
} from './validators.js';
import {
  sortRecords,
  paginateRecords,
  computeDashboardKpis,
  computeBookingStatusDistribution,
} from './analytics.js';

test('formatters format currency, duration, and end times accurately', () => {
  assert.equal(formatCurrency(1250), '$1,250');
  assert.equal(formatCompactCurrency(1485000), '$1.49M');
  assert.equal(formatDuration(142), '2h 22m');
  assert.equal(calculateEndTime('19:30', 142), '21:52');
  assert.equal(calculateEndTime('23:00', 120), '01:00');
  assert.equal(formatPercentDelta(12.4), '+12.4%');
});

test('validators reject invalid inputs and accept valid records', () => {
  const badCinema = validateCinemaForm({ name: '', city: '', screens: 0 });
  assert.equal(badCinema.valid, false);
  assert.ok(badCinema.errors.name);
  assert.ok(badCinema.errors.screens);

  const goodCinema = validateCinemaForm({
    name: 'MARUMO Shibuya Flagship',
    city: 'Tokyo',
    address: '2-24-12 Shibuya',
    phone: '+81 3-5555-0192',
    screens: 12,
    totalSeats: 2100,
  });
  assert.equal(goodCinema.valid, true);

  const badMovie = validateMovieForm({ title: '', durationMinutes: 10 });
  assert.equal(badMovie.valid, false);

  const goodShowtime = validateShowtimeForm({
    movieId: 'mov-1',
    cinemaId: 'cin-1',
    room: 'IMAX Hall 1',
    date: '2026-11-18',
    startTime: '18:30',
    ticketPrice: 18.5,
    capacity: 220,
  });
  assert.equal(goodShowtime.valid, true);

  const badPromo = validatePromotionForm({
    title: 'Weekend',
    code: 'a',
    discountType: 'Percentage',
    discountValue: 95,
    startDate: '2026-11-20',
    endDate: '2026-11-10',
  });
  assert.equal(badPromo.valid, false);
  assert.ok(badPromo.errors.code);
  assert.ok(badPromo.errors.discountValue);
  assert.ok(badPromo.errors.endDate);

  assert.equal(
    validateManagerForm({
      name: 'Kenji Sato',
      email: 'kenji@marumo.io',
      phone: '+81 3-5555-0101',
      role: 'Branch Manager',
      cinemaId: 'cin-1',
    }).valid,
    true
  );

  assert.equal(
    validateSettingsForm({
      platformName: 'MARUMO',
      supportEmail: 'ops@marumo.io',
      taxRate: 10,
      convenienceFee: 1.5,
      seatHoldMinutes: 10,
    }).valid,
    true
  );
});

test('analytics helpers sort, paginate, and aggregate KPIs cleanly', () => {
  const sample = [
    { id: 1, revenue: 300, name: 'B' },
    { id: 2, revenue: 900, name: 'A' },
    { id: 3, revenue: 150, name: 'C' },
  ];
  const sorted = sortRecords(sample, 'revenue', 'desc');
  assert.deepEqual(
    sorted.map((r) => r.id),
    [2, 1, 3]
  );

  const page2 = paginateRecords(sorted, 2, 2);
  assert.equal(page2.items.length, 1);
  assert.equal(page2.startIndex, 3);
  assert.equal(page2.totalPages, 2);

  const kpis = computeDashboardKpis({
    bookings: [
      { totalAmount: 100, ticketCount: 4, bookingStatus: 'Confirmed' },
      { totalAmount: 50, ticketCount: 2, bookingStatus: 'Cancelled' },
    ],
    cinemas: [{ status: 'Active' }, { status: 'Maintenance' }],
    users: [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }],
  });
  assert.equal(kpis.totalRevenue, 100);
  assert.equal(kpis.totalBookings, 2);
  assert.equal(kpis.totalTicketsSold, 4);
  assert.equal(kpis.activeCinemas, 1);
  assert.equal(kpis.registeredCustomers, 3);

  const dist = computeBookingStatusDistribution([
    { bookingStatus: 'Confirmed' },
    { bookingStatus: 'Confirmed' },
    { bookingStatus: 'Cancelled' },
  ]);
  assert.equal(dist.length, 2);
  assert.equal(dist[0].value, 2);
});
