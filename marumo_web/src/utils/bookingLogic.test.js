import test from 'node:test';
import assert from 'node:assert/strict';
import { tsImport } from 'tsx/esm/api';
import { fileURLToPath } from 'node:url';
import * as bookingLogic from './bookingLogic.js';
import {
  generateSeatMap,
  validatePromoCode,
  validateSeatSelection,
  calculateBookingTotals,
  filterMovies,
  filterShowtimes,
  validateBookingForm,
  canCancelBooking,
  filterBookings,
  formatCurrency,
} from './bookingLogic.js';
import * as cinemaData from '../data/cinemaData.js';
import { MOVIES, CINEMAS, CONCESSIONS, DATES, SHOWTIMES } from '../data/cinemaData.js';

test('generateSeatMap creates deterministic VND standard, VIP, and couple prices', () => {
  const mapA = generateSeatMap('show-1', 100000);
  const mapB = generateSeatMap('show-1', 100000);
  assert.equal(mapA.length, 8);
  assert.deepEqual(mapA, mapB);

  const rowA = mapA[0];
  assert.equal(rowA.row, 'A');
  assert.equal(rowA.seats.length, 12);
  assert.equal(rowA.seats[0].type, 'standard');
  assert.equal(rowA.seats[0].price, 100000);

  const rowE = mapA[4];
  assert.equal(rowE.seats[0].type, 'vip');
  assert.equal(rowE.seats[0].price, 125000);

  const rowH = mapA[7];
  assert.equal(rowH.isCoupleRow, true);
  assert.equal(rowH.seats.length, 6);
  assert.equal(rowH.seats[0].type, 'couple');
  assert.equal(rowH.seats[0].price, 220000);
});

test('generateSeatMap uses a VND default base price', () => {
  const rows = generateSeatMap();
  assert.equal(rows[0].seats[0].price, 95000);
  assert.equal(rows[4].seats[0].price, 120000);
  assert.equal(rows[7].seats[0].price, 210000);
});

test('validateSeatSelection applies solo gap exceptions and multi-seat adjacency', () => {
  const makeRow = (letter, occupied = []) => ({
    row: letter,
    seats: Array.from({ length: 12 }, (_, index) => {
      const number = index + 1;
      return {
        id: `${letter}${number}`,
        number,
        type: 'standard',
        isOccupied: occupied.includes(number),
      };
    }),
  });

  const openRow = makeRow('B');
  assert.equal(validateSeatSelection([openRow], ['B4']), '');
  assert.match(validateSeatSelection([openRow], ['B4', 'B6']), /liền kề/);
  assert.equal(validateSeatSelection([openRow], ['B4', 'B5']), '');
  assert.equal(validateSeatSelection([openRow, makeRow('C')], ['B4', 'C4']), '');
  assert.match(validateSeatSelection([openRow, makeRow('C')], ['B4', 'C5']), /liền kề/);
  assert.equal(validateSeatSelection([
    makeRow('B'), makeRow('C'), makeRow('D'),
  ], ['B1', 'D1']), '');
  assert.equal(validateSeatSelection([
    makeRow('B'), makeRow('C'), makeRow('D'),
  ], ['B12', 'D12']), '');
  assert.match(validateSeatSelection([
    makeRow('B'), makeRow('C'), makeRow('D'),
  ], ['B2', 'D2']), /liền kề/);

  const b6Booked = makeRow('B', [6]);
  assert.match(validateSeatSelection([b6Booked], ['B4']), /ghế trống lẻ/);
  assert.match(validateSeatSelection([b6Booked], ['B3', 'B4']), /ghế trống lẻ/);
  assert.equal(validateSeatSelection([makeRow('B', [3, 6])], ['B4']), '');
  assert.equal(validateSeatSelection([makeRow('B', [3, 6])], ['B5']), '');
  assert.equal(validateSeatSelection([makeRow('D', [5, 8])], ['D7']), '');

  const d5Booked = makeRow('D', [5]);
  assert.match(validateSeatSelection([d5Booked], ['D7']), /ghế trống lẻ/);
  assert.equal(validateSeatSelection([
    makeRow('D', [5]), makeRow('E'), makeRow('F', [7]),
  ], ['D6', 'D7']), '');
  assert.equal(validateSeatSelection([
    makeRow('B'), makeRow('C'), makeRow('D', [7]),
  ], ['B7', 'C7']), '');
  assert.equal(validateSeatSelection([
    makeRow('A', [8, 10]), makeRow('B'),
  ], ['B9']), '');

  assert.match(validateSeatSelection([openRow], ['B4', 'B6']), /liền kề/);
  assert.equal(validateSeatSelection([openRow], ['B4', 'B5']), '');
  assert.match(validateSeatSelection([openRow], []), /ít nhất một ghế/);

  const coupleRow = {
    row: 'H',
    seats: [1, 3, 5, 7, 9, 11].map((number) => ({
      id: `H${number}-${number + 1}`,
      number,
      type: 'couple',
      isOccupied: false,
    })),
  };
  assert.equal(validateSeatSelection([coupleRow], ['H1-2']), '');
});

test('validatePromoCode enforces seat requirement and computes VND discounts', () => {
  const noSeats = validatePromoCode('MARUMO20', 0, 0);
  assert.equal(noSeats.valid, false);
  assert.match(noSeats.message, /Vui lòng chọn/);
  assert.equal(validatePromoCode('MARUMO20', 250000, 0).valid, false);
  assert.deepEqual(validatePromoCode('', 250000, 2), {
    valid: false, discount: 0, message: '', code: '',
  });

  const valid20 = validatePromoCode(' marumo20 ', 250000, 2);
  assert.equal(valid20.valid, true);
  assert.equal(valid20.discount, 50000);
  assert.equal(valid20.code, 'MARUMO20');

  const wed50 = validatePromoCode('WED50', 200000, 2);
  assert.equal(wed50.valid, true);
  assert.equal(wed50.discount, 80000);
  assert.match(wed50.message, /40\.000/);
  assert.equal(validatePromoCode('WED50', 30000, 2).discount, 30000);
  assert.equal(validatePromoCode('STUDENT15', 100005, 1).discount, 15001);

  const invalid = validatePromoCode('FAKECODE', 200000, 2);
  assert.equal(invalid.valid, false);
  assert.equal(invalid.discount, 0);
  assert.match(invalid.message, /không hợp lệ/);
});

test('calculateBookingTotals sums VND seats and concessions with ticket-only discounts', () => {
  const totals = calculateBookingTotals({
    selectedSeats: [
      { id: 'D5', price: 120000 },
      { id: 'D6', price: 120000 },
    ],
    selectedCombos: { 'combo-marumo-duo': 1 },
    concessionsCatalog: CONCESSIONS,
    promoCode: 'MARUMO20',
  });

  assert.equal(totals.ticketSubtotal, 240000);
  assert.equal(totals.comboSubtotal, 115000);
  assert.equal(totals.discount, 48000);
  assert.equal(totals.grandTotal, 307000);
});

test('WED50 caps the ticket discount without discounting concessions', () => {
  const totals = calculateBookingTotals({
    selectedSeats: [{ id: 'A1', price: 30000 }],
    selectedCombos: { 'combo-solo-classic': 2, 'combo-nachos-cola': 0 },
    concessionsCatalog: CONCESSIONS,
    promoCode: 'WED50',
  });
  assert.equal(totals.discount, 30000);
  assert.equal(totals.comboSubtotal, 150000);
  assert.equal(totals.grandTotal, 150000);
  assert.equal(calculateBookingTotals({}).grandTotal, 0);
});

test('formatCurrency renders Vietnamese dong with no dollar symbol or decimal cents', () => {
  assert.equal(formatCurrency(135000), '135.000\u00a0₫');
  assert.equal(formatCurrency('115000'), '115.000\u00a0₫');
  assert.equal(formatCurrency(), '0\u00a0₫');
  assert.equal(formatCurrency(0), '0\u00a0₫');
});

test('catalog prices are VND and localized labels preserve city and format values', () => {
  assert.deepEqual(CONCESSIONS.map((combo) => combo.price), [115000, 75000, 180000, 85000]);
  assert.deepEqual([...new Set(SHOWTIMES.map((showtime) => showtime.basePrice))].sort((a, b) => a - b),
    [90000, 95000, 110000, 115000, 130000, 135000, 140000]);
  assert.equal(SHOWTIMES.find((showtime) => showtime.movieId === 'solar-odyssey' && showtime.format === 'IMAX Laser').basePrice, 135000);
  assert.deepEqual([...new Set(CINEMAS.map((cinema) => cinema.city))], ['Ho Chi Minh City', 'Hanoi', 'Da Nang']);
  assert.deepEqual([...new Set(CINEMAS.map((cinema) => cinema.cityLabel))], ['TP. Hồ Chí Minh', 'Hà Nội', 'Đà Nẵng']);
  assert.equal(cinemaData.formatLabels?.['2D Sub'], '2D phụ đề');
  assert.equal(cinemaData.formatLabels?.['2D Dub'], '2D lồng tiếng');
  assert.ok(MOVIES.every((movie) => movie.formats.every((format) => cinemaData.formatLabels?.[format])));
  assert.ok(CINEMAS.every((cinema) => cinema.formats.every((format) => cinemaData.formatLabels?.[format])));
  assert.equal(DATES[0].id, '2026-11-19');
  assert.equal(DATES[0].dayName, 'Hôm nay');
  assert.equal(DATES[0].fullLabel, 'Thứ Năm, 19/11');
  assert.equal(MOVIES[0].releaseLabel, '06/11/2026');
  assert.equal(MOVIES[0].genreKey, 'Sci-Fi');
  assert.equal(MOVIES[0].language, 'Tiếng Anh · Phụ đề tiếng Việt');
  assert.match(cinemaData.PROMOTIONS.find((promo) => promo.code === 'WED50').discountText, /40\.000/);
  assert.ok(cinemaData.MEMBERSHIP_TIERS.every((tier) => !tier.requirement.includes('$')));
});

test('filterMovies keeps stable filter keys and searches Vietnamese display text', () => {
  assert.equal(filterMovies(MOVIES, { status: 'now-showing' }).length, 4);
  assert.equal(filterMovies(MOVIES, { genre: 'Sci-Fi' }).length, 2);
  const searchResult = filterMovies(MOVIES, { query: 'nhung' });
  assert.equal(searchResult.length, 1);
  assert.equal(searchResult[0].id, 'velvet-syndicate');
  assert.ok(filterMovies(MOVIES, { format: '2D Dub' }).every((movie) => movie.formats.includes('2D Dub')));
  assert.equal(filterMovies(MOVIES, { query: 'không có phim này' }).length, 0);
});

test('filterShowtimes preserves existing format and cinema filtering', () => {
  const results = filterShowtimes(SHOWTIMES, {
    movieId: 'solar-odyssey', cinemaId: 'marumo-saigon-centre', dateId: '2026-11-19', format: '2D Sub',
  });
  assert.equal(results.length, 4);
  assert.ok(results.every((showtime) => showtime.format === '2D Sub'));
  assert.equal(filterShowtimes(SHOWTIMES).length, SHOWTIMES.length);
});

test('validateBookingForm returns Vietnamese validation and accepts valid details', () => {
  const invalid = validateBookingForm({ name: 'A', email: 'bad', phone: '123' });
  assert.equal(invalid.isValid, false);
  assert.match(invalid.errors.name, /Vui lòng/);
  assert.match(invalid.errors.email, /Vui lòng/);
  assert.match(invalid.errors.phone, /Vui lòng/);

  const valid = validateBookingForm({
    name: 'Trần Minh Anh', email: 'minh.anh@example.com', phone: '+84 909 123 456',
  });
  assert.equal(valid.isValid, true);
  assert.deepEqual(valid.errors, {});
});

function legacyBooking() {
  return {
    id: 'MRM-742810', status: 'cancelled', movieId: 'velvet-syndicate', movieTitle: 'The Velvet Syndicate',
    cinemaId: 'marumo-saigon-centre', cinemaName: 'MARUMO Saigon Centre',
    cinemaAddress: 'Level 5, 65 Le Loi Boulevard, Ben Nghe Ward, District 1',
    dateLabel: 'Thu, Nov 19', hall: 'Hall 2 · Atmos', createdAt: 'Nov 18, 2026',
    cancelledAt: '20/11/2026', seats: ['E5', 'E6'],
    seatDetails: [{ id: 'E5', type: 'vip', price: 13.5 }, { id: 'E6', type: 'vip', price: 13.5 }],
    combos: [{ name: 'MARUMO Duo Caramel Combo', qty: 1, price: 11.5 }],
    ticketSubtotal: 27, comboSubtotal: 11.5, discount: 5.4, grandTotal: 33.1,
    promoCode: 'MARUMO20', customerName: 'Tên khách giữ nguyên', customerEmail: 'guest@example.com',
  };
}

test('legacy booking migration converts money once and preserves customer and cancellation data', () => {
  const old = legacyBooking();
  const [migrated] = bookingLogic.migrateStoredBookings([old]);
  assert.equal(migrated.currency, 'VND');
  assert.equal(migrated.ticketSubtotal, 270000);
  assert.equal(migrated.comboSubtotal, 115000);
  assert.equal(migrated.discount, 54000);
  assert.equal(migrated.grandTotal, 331000);
  assert.equal(migrated.seatDetails[0].price, 135000);
  assert.equal(migrated.combos[0].price, 115000);
  assert.equal(migrated.movieTitle, MOVIES.find((movie) => movie.id === old.movieId).title);
  assert.equal(migrated.cinemaAddress, CINEMAS[0].address);
  assert.equal(migrated.combos[0].name, CONCESSIONS[0].name);
  assert.equal(migrated.dateLabel, DATES[0].fullLabel);
  assert.equal(migrated.hall, 'Phòng 2 · Atmos');
  assert.equal(migrated.createdAt, '18/11/2026');
  assert.equal(migrated.id, old.id);
  assert.equal(migrated.status, old.status);
  assert.equal(migrated.cancelledAt, old.cancelledAt);
  assert.equal(migrated.customerName, old.customerName);
  assert.equal(migrated.customerEmail, old.customerEmail);
  assert.deepEqual(migrated.seats, old.seats);
  assert.equal(old.grandTotal, 33.1);
  assert.deepEqual(bookingLogic.migrateStoredBookings([migrated]), [migrated]);
});

test('migration preserves VND, unknown-currency, incomplete, and inconsistent records', () => {
  const records = [
    { ...legacyBooking(), currency: 'VND' },
    { ...legacyBooking(), currency: 'EUR' },
    { id: 'partial', grandTotal: 33.1, customerName: 'Giữ nguyên' },
    { ...legacyBooking(), grandTotal: 500000 },
    { ...legacyBooking(), ticketSubtotal: 28 },
    { ...legacyBooking(), seatDetails: [{ id: 'A1', type: 'standard', price: 27 }] },
  ];
  assert.deepEqual(bookingLogic.migrateStoredBookings(records), records);
  assert.deepEqual(bookingLogic.migrateStoredBookings([]), []);
});

test('migration tolerates malformed storage without dropping individual records', () => {
  assert.deepEqual(bookingLogic.migrateStoredBookings(null), []);
  assert.deepEqual(bookingLogic.migrateStoredBookings({}), []);
  const records = [null, { ...legacyBooking(), seatDetails: 'E5, E6' }];
  assert.deepEqual(bookingLogic.migrateStoredBookings(records), records);
});

test('AppProvider starts with a localized VND sample and migrates stored bookings', async () => {
  const { readProviderSnapshot } = await tsImport('./providerFixture.jsx', {
    parentURL: import.meta.url,
    tsconfig: fileURLToPath(new URL('../../tsconfig.json', import.meta.url)),
  });
  let current;
  const stored = new Map();
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: { getItem: (key) => stored.get(key) ?? null } };
  try {
    current = readProviderSnapshot();
    const [sample] = current.bookings;
    assert.equal(sample.currency, 'VND');
    assert.equal(sample.grandTotal, 331000);
    assert.equal(sample.seatDetails[0].price, 135000);
    assert.equal(sample.dateLabel, DATES[0].fullLabel);
    assert.equal(sample.createdAt, '18/11/2026');
    assert.equal(sample.movieTitle, MOVIES.find((movie) => movie.id === 'velvet-syndicate').title);
    const matchingShowtime = SHOWTIMES.find((showtime) => showtime.movieId === sample.movieId
      && showtime.cinemaId === sample.cinemaId && showtime.format === sample.format
      && showtime.time === sample.time);
    assert.ok(matchingShowtime);

    stored.set('marumo_member_bookings', JSON.stringify([legacyBooking()]));
    current = readProviderSnapshot();
    assert.equal(current.bookings[0].grandTotal, 331000);
    assert.equal(current.bookings[0].customerName, 'Tên khách giữ nguyên');
    assert.equal(current.bookings[0].status, 'cancelled');

    stored.set('marumo_member_bookings', '[]');
    current = readProviderSnapshot();
    assert.deepEqual(current.bookings, []);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('loyalty points preserve the previous earning scale for VND amounts', () => {
  assert.equal(bookingLogic.calculateLoyaltyPoints(331000), 331);
  assert.equal(bookingLogic.calculateLoyaltyPoints(333500), 334);
  assert.equal(bookingLogic.calculateLoyaltyPoints(0), 0);
});

test('filterBookings and canCancelBooking handle status and search filtering', () => {
  const sample = [
    { id: 'MRM-1001', movieTitle: 'Hành trình Mặt Trời: Chân trời', cinemaName: 'MARUMO Saigon Centre', status: 'confirmed' },
    { id: 'MRM-1002', movieTitle: 'Tổ chức Nhung đen', cinemaName: 'MARUMO Hồ Tây', status: 'cancelled' },
  ];
  assert.equal(canCancelBooking(sample[0]), true);
  assert.equal(canCancelBooking(sample[1]), false);
  assert.equal(canCancelBooking(null), false);
  assert.equal(filterBookings(sample, { status: 'confirmed' }).length, 1);
  assert.equal(filterBookings(sample, { query: 'nhung' }).length, 1);
  assert.equal(filterBookings(sample, { query: 'MRM-1001' }).length, 1);
  assert.equal(filterBookings([{ id: 'MRM-1003' }], { status: 'confirmed' }).length, 1);
  assert.deepEqual(filterBookings(), []);
});
