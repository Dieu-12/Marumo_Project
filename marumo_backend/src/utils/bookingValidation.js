import { HttpError } from './validation.js';
import { objectFields, parseShowtimeId } from './catalogValidation.js';
import { MAX_BOOKING_SEATS, BOOKING_CODE_PATTERN } from '../constants/booking.js';
import { MAX_BIGINT_ID as MAX_ID } from '../constants/ids.js';

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

const FNB_LINE_LIMIT = 10;
const FNB_MAX_QUANTITY = 50;
const PROMO_CODE_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function bigIntId(value, label) {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,18}$/.test(value) || BigInt(value) > MAX_ID) {
    throw invalid(`${label} must be a positive decimal BIGINT string.`);
  }
  return value;
}

function fnbLine(value, index) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalid(`items[${index}] must be an object.`);
  }
  objectFields(value, ['branchProductId', 'comboId', 'quantity']);
  const hasProduct = value.branchProductId !== undefined;
  const hasCombo = value.comboId !== undefined;
  if (hasProduct === hasCombo) {
    throw invalid(`items[${index}] must specify exactly one of branchProductId or comboId.`);
  }
  if (!Number.isInteger(value.quantity) || value.quantity < 1 || value.quantity > FNB_MAX_QUANTITY) {
    throw invalid(`items[${index}] quantity must be an integer between 1 and ${FNB_MAX_QUANTITY}.`);
  }
  if (hasProduct) {
    return { branchProductId: bigIntId(value.branchProductId, `items[${index}].branchProductId`), comboId: null, quantity: value.quantity };
  }
  return { branchProductId: null, comboId: bigIntId(value.comboId, `items[${index}].comboId`), quantity: value.quantity };
}

export function parseBookingInput(body) {
  objectFields(body, ['showtimeId', 'seatIds', 'items', 'promoCode', 'requestId']);
  const showtimeId = parseShowtimeId(body.showtimeId);
  if (!Array.isArray(body.seatIds) || body.seatIds.length < 1 || body.seatIds.length > MAX_BOOKING_SEATS) {
    throw invalid(`seatIds must be an array of 1 to ${MAX_BOOKING_SEATS} seat IDs.`);
  }
  const seatIds = body.seatIds.map(seatId);
  if (new Set(seatIds).size !== seatIds.length) throw invalid('seatIds must not contain duplicates.');
  let items = [];
  if (body.items !== undefined) {
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > FNB_LINE_LIMIT) {
      throw invalid(`items must be an array of 1 to ${FNB_LINE_LIMIT} lines.`);
    }
    items = body.items.map(fnbLine);
  }
  let promoCode;
  if (body.promoCode !== undefined) {
    if (typeof body.promoCode !== 'string' || !PROMO_CODE_PATTERN.test(body.promoCode)) {
      throw invalid('promoCode must be 1 to 40 letters, digits, dash or underscore.');
    }
    promoCode = body.promoCode;
  }
  let requestId;
  if (body.requestId !== undefined) {
    if (typeof body.requestId !== 'string' || !REQUEST_ID_PATTERN.test(body.requestId)) {
      throw invalid('requestId must be a UUID.');
    }
    requestId = body.requestId.toLowerCase();
  }
  return { showtimeId, seatIds, items, promoCode, requestId };
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
