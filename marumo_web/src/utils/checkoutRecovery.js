import { createBooking, fetchBookingByCode, fetchBookings } from './bookingApi.js';

const BOOKING_CODE = /^BKG-[A-Z2-9]{16}$/;
const RECOVERY_ERROR = 'Chưa xác nhận được kết quả đơn trước. Kiểm tra kết quả trước khi đặt hoặc thanh toán tiếp.';
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID = /^[1-9][0-9]{0,18}$/;

function isCreatePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  if (typeof payload.requestId !== 'string' || !REQUEST_ID.test(payload.requestId)
    || typeof payload.showtimeId !== 'string' || !ID.test(payload.showtimeId)) return false;
  if (!Array.isArray(payload.seatIds) || payload.seatIds.length < 1 || payload.seatIds.length > 10
    || !payload.seatIds.every((id) => typeof id === 'string' && ID.test(id))
    || new Set(payload.seatIds).size !== payload.seatIds.length) return false;
  if (payload.promoCode !== undefined && (typeof payload.promoCode !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(payload.promoCode))) return false;
  if (payload.items === undefined) return true;
  return Array.isArray(payload.items) && payload.items.length >= 1 && payload.items.length <= 10 && payload.items.every((item) => item && typeof item === 'object'
    && Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 50
    && ((typeof item.branchProductId === 'string' && ID.test(item.branchProductId) && item.comboId === undefined)
      || (typeof item.comboId === 'string' && ID.test(item.comboId) && item.branchProductId === undefined)));
}

function storageKey(userId) {
  return `marumo_checkout_pending_${userId}`;
}

export function readCheckoutAttempt(userId) {
  const raw = sessionStorage.getItem(storageKey(userId));
  if (!raw) return null;
  let attempt;
  try {
    attempt = JSON.parse(raw);
  } catch {
    throw new Error(RECOVERY_ERROR);
  }
  if (attempt?.kind === 'payment' && BOOKING_CODE.test(attempt.code)) return attempt;
  if (attempt?.kind === 'create' && isCreatePayload(attempt.payload)) return attempt;
  if (attempt?.kind === 'create' && /^[1-9][0-9]{0,18}$/.test(attempt.showtimeId)
    && Array.isArray(attempt.seatCodes) && attempt.seatCodes.length > 0
    && attempt.seatCodes.every((code) => typeof code === 'string' && code.length > 0)
    && Array.isArray(attempt.beforeCodes) && attempt.beforeCodes.every((code) => BOOKING_CODE.test(code))) return attempt;
  throw new Error(RECOVERY_ERROR);
}

export function saveCheckoutAttempt(userId, attempt) {
  sessionStorage.setItem(storageKey(userId), JSON.stringify(attempt));
}

export function clearCheckoutAttempt(userId) {
  sessionStorage.removeItem(storageKey(userId));
}

export async function recoverCheckoutAttempt(attempt) {
  if (attempt.kind === 'payment') return fetchBookingByCode(attempt.code);
  if (attempt.payload) {
    try {
      return await createBooking(attempt.payload);
    } catch (error) {
      if (error?.name === 'BookingRequestError' && [400, 404, 409].includes(error.status)) error.checkoutCreateRejected = true;
      throw error;
    }
  }
  const bookings = await fetchBookings();
  const seatCodes = attempt.seatCodes.slice().sort().join(',');
  const matches = bookings.filter((booking) => booking.showtimeId === attempt.showtimeId
    && !attempt.beforeCodes.includes(booking.code)
    && booking.seats.map((seat) => seat.code).sort().join(',') === seatCodes);
  if (matches.length !== 1) throw new Error(RECOVERY_ERROR);
  return matches[0];
}
