import sql from 'mssql';
import { HttpError } from '../utils/validation.js';
import { BOOKING_SEAT_SELECT, BOOKING_SEAT_ORDER, mapBookingRow, mapBookingSeat, readFnbaOrder, releaseExpiredForShowtime } from './bookingRepository.js';

const LOYALTY_RATES = Object.freeze({ earnVndPerPoint: 10000, redeemVndPerPoint: 1000 });

function bookingNotFound() {
  return new HttpError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
}

function bookingExpired() {
  return new HttpError(409, 'BOOKING_EXPIRED', 'The booking hold has expired.');
}

function bookingNotPending() {
  return new HttpError(409, 'BOOKING_NOT_PENDING_PAYMENT', 'The booking is not awaiting payment.');
}

function insufficientPoints() {
  return new HttpError(409, 'INSUFFICIENT_POINTS', 'The Marumo Point balance is not enough to pay for this booking.');
}

function bookingStateConflict() {
  return new HttpError(409, 'BOOKING_STATE_CONFLICT', 'The booking was changed by another request.');
}

function procError(error, mapping) {
  const mapped = mapping[error?.number];
  if (mapped) throw mapped();
  throw error;
}

function ledgerDescription(row) {
  if (row.changeType === 'EARN') return row.bookingCode ? `Tích điểm từ vé ${row.bookingCode}` : 'Tích điểm Marumo Point';
  if (row.changeType === 'REDEEM') return row.bookingCode ? `Đổi điểm cho vé ${row.bookingCode}` : 'Đổi điểm Marumo Point';
  return row.referenceCode ? `Điều chỉnh điểm ${row.referenceCode}` : 'Điều chỉnh điểm Marumo Point';
}

export function createMemoryLoyaltyRepository(bookingRepository) {
  const balances = new Map();
  const earnedTotals = new Map();
  const redeemedTotals = new Map();
  const ledger = [];

  function accountOf(userId) {
    return {
      balancePoints: balances.get(userId) ?? 0,
      lifetimeEarned: earnedTotals.get(userId) ?? 0,
      lifetimeRedeemed: redeemedTotals.get(userId) ?? 0,
    };
  }

  return {
    async payBookingWithPoints({ userId, bookingId }, at) {
      if (ledger.some((entry) => entry.userId === userId && entry.changeType === 'REDEEM' && entry.bookingId === bookingId)) {
        const booking = await bookingRepository.getBooking({ userId, bookingId }, at);
        if (!booking) throw bookingNotFound();
        return booking;
      }
      const pendingBooking = await bookingRepository.getBooking({ userId, bookingId }, at);
      if (!pendingBooking) throw bookingNotFound();
      const total = pendingBooking.totalAmount + (pendingBooking.fnbOrder?.totalAmount ?? 0);
      const pointsRequired = Math.ceil(total / LOYALTY_RATES.redeemVndPerPoint);
      const balance = balances.get(userId) ?? 0;
      if (balance < pointsRequired) throw insufficientPoints();
      const booking = await bookingRepository.confirmBooking({ userId, bookingId }, at);
      balances.set(userId, balance - pointsRequired);
      redeemedTotals.set(userId, (redeemedTotals.get(userId) ?? 0) + pointsRequired);
      ledger.push({
        userId,
        changeType: 'REDEEM',
        points: -pointsRequired,
        balanceAfter: balance - pointsRequired,
        bookingId,
        bookingCode: booking.code,
        referenceCode: null,
        createdAt: new Date(at).toISOString(),
      });
      return booking;
    },
    async getLoyaltyAccount({ userId }) {
      return {
        balance: accountOf(userId),
        rates: LOYALTY_RATES,
        ledger: ledger
          .filter((entry) => entry.userId === userId)
          .slice(-20)
          .reverse()
          .map(({ userId: _userId, ...entry }) => ({
            changeType: entry.changeType,
            points: entry.points,
            balanceAfter: entry.balanceAfter,
            description: ledgerDescription(entry),
            createdAt: entry.createdAt,
          })),
      };
    },
  };
}

export function createSqlLoyaltyRepository(pool) {
  async function payBookingWithPoints({ userId, bookingId }) {
    const bookingRow = (await pool.request()
      .input('bookingId', sql.BigInt, bookingId)
      .query(`SELECT CONVERT(varchar(20), showtime_id) AS showtimeId FROM dbo.bookings WHERE booking_id = @bookingId;`)).recordset[0];
    if (bookingRow) await releaseExpiredForShowtime(() => pool.request(), bookingRow.showtimeId);
    let result;
    try {
      result = await pool.request()
        .input('booking_id', sql.BigInt, bookingId)
        .input('user_id', sql.BigInt, userId)
        .execute('dbo.usp_booking_pay_with_points');
    } catch (error) {
      procError(error, {
        52801: bookingNotFound,
        52802: bookingNotFound,
        52803: bookingExpired,
        52804: bookingNotPending,
        52806: insufficientPoints,
        52807: bookingStateConflict,
        52808: () => new HttpError(409, 'SEAT_UNAVAILABLE', 'The booking seats are no longer held.'),
        52408: () => new HttpError(409, 'FNB_STOCK_BUSY', 'Không lấy được khóa cập nhật kho F&B.'),
        52411: () => new HttpError(409, 'FNB_STOCK_INSUFFICIENT', 'Không đủ nguyên liệu có thể giữ cho đơn F&B.'),
      });
    }
    const row = result.recordset[0];
    if (!row) throw bookingNotFound();
    const seatRows = (await pool.request()
      .input('bookingId', sql.BigInt, row.id)
      .query(`${BOOKING_SEAT_SELECT} WHERE bs.booking_id = @bookingId
        ${BOOKING_SEAT_ORDER}`)).recordset;
    const fnbOrder = await readFnbaOrder(() => pool.request(), row.id);
    return mapBookingRow(row, seatRows.map(mapBookingSeat), fnbOrder);
  }

  async function getLoyaltyAccount({ userId }) {
    const [result, rateResult] = await Promise.all([
      pool.request()
        .input('user_id', sql.BigInt, userId)
        .execute('dbo.usp_loyalty_get'),
      pool.request().query(`
        SELECT setting_key AS settingKey, TRY_CONVERT(INT, setting_value) AS value
        FROM dbo.system_settings
        WHERE setting_key IN ('LOYALTY_EARN_VND_PER_POINT', 'LOYALTY_REDEEM_VND_PER_POINT');`),
    ]);
    const accountRow = result.recordsets[0][0];
    const ledgerRows = result.recordsets[1] ?? [];
    const rates = Object.fromEntries(rateResult.recordset.map((row) => [row.settingKey, Number(row.value)]));
    const earnVndPerPoint = rates.LOYALTY_EARN_VND_PER_POINT;
    const redeemVndPerPoint = rates.LOYALTY_REDEEM_VND_PER_POINT;
    if (!Number.isSafeInteger(earnVndPerPoint) || earnVndPerPoint <= 0
      || !Number.isSafeInteger(redeemVndPerPoint) || redeemVndPerPoint <= 0) {
      throw new Error('Loyalty conversion settings are missing or invalid.');
    }
    return {
      balance: {
        balancePoints: Number(accountRow?.balancePoints ?? 0),
        lifetimeEarned: Number(accountRow?.lifetimeEarned ?? 0),
        lifetimeRedeemed: Number(accountRow?.lifetimeRedeemed ?? 0),
      },
      rates: { earnVndPerPoint, redeemVndPerPoint },
      ledger: ledgerRows.map((row) => ({
        changeType: row.changeType,
        points: Number(row.points),
        balanceAfter: Number(row.balanceAfter),
        description: ledgerDescription(row),
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  return { payBookingWithPoints, getLoyaltyAccount };
}
