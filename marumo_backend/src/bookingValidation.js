import { HttpError } from './validation.js';
import { objectFields, parseShowtimeId } from './catalogValidation.js';

export const MAX_BOOKING_SEATS = 10;
const MAX_ID = 9223372036854775807n;
const BOOKING_CODE_PATTERN = /^BKG-[A-Z2-9]{16}$/;

function invalid(message) {
  return new HttpError(400, 'INVALID_INPUT', message);
}

function seatId(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,18}$/.test(value) || BigInt(value) > MAX_ID) {
    throw invalid('seatIds must contain positive decimal BIGINT strings.');
  }
  return value;
}

export function parseBookingCode(value) {
  if (typeof value !== 'string' || !BOOKING_CODE_PATTERN.test(value)) {
    throw invalid('Booking code must be in format BKG-XXXXXXXXXXXXXXXX.');
  }
  return value;
}

export function parseBookingInput(body) {
  objectFields(body, ['showtimeId', 'seatIds']);
  const showtimeId = parseShowtimeId(body.showtimeId);
  if (!Array.isArray(body.seatIds) || body.seatIds.length < 1 || body.seatIds.length > MAX_BOOKING_SEATS) {
    throw invalid(`seatIds must be an array of 1 to ${MAX_BOOKING_SEATS} seat IDs.`);
  }
  const seatIds = body.seatIds.map(seatId);
  if (new Set(seatIds).size !== seatIds.length) throw invalid('seatIds must not contain duplicates.');
  return { showtimeId, seatIds };
}

export function parseBookingId(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,18}$/.test(value) || BigInt(value) > MAX_ID) {
    throw invalid('Booking ID must be a positive decimal BIGINT string.');
  }
  return value;
}

export function parsePaymentInput(body) {
  if (body === undefined || body === null) return {};
  objectFields(body, ['paymentMethod', 'bankCode']);
  const paymentMethod = body.paymentMethod ?? 'VNPAY';
  if (paymentMethod !== 'VNPAY' && paymentMethod !== 'POINTS') {
    throw invalid('paymentMethod must be VNPAY or POINTS.');
  }
  if (body.bankCode === undefined) return { paymentMethod };
  if (typeof body.bankCode !== 'string' || !/^[A-Z][A-Z0-9]{2,10}$/.test(body.bankCode)) {
    throw invalid('bankCode must be an uppercase provider bank code.');
  }
  return { paymentMethod, bankCode: body.bankCode };
}
