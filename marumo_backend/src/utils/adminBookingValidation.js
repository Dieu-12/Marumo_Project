import { HttpError } from './validation.js';
import { objectFields } from './catalogValidation.js';
import { parseBookingId } from './bookingValidation.js';

export const ADMIN_BOOKING_STATUSES = ['PENDING_PAYMENT', 'CONFIRMED', 'EXPIRED', 'CANCELLED'];
export const ADMIN_PAYMENT_STATUSES = ['NOT_STARTED', 'PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'EXPIRED', 'CANCELLED'];

function invalid(message) {
  return new HttpError(400, 'INVALID_INPUT', message);
}

export function parseAdminBookingQuery(query) {
  objectFields(query, ['limit', 'after', 'branchId', 'status', 'paymentStatus', 'q']);
  const limit = query.limit === undefined ? 25 : Number(query.limit);
  if (query.limit !== undefined && (typeof query.limit !== 'string' || !/^[1-9][0-9]{0,2}$/.test(query.limit))) throw invalid('limit must be an integer from 1 to 100.');
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw invalid('limit must be an integer from 1 to 100.');
  const result = { limit };
  for (const key of ['after', 'branchId']) if (query[key] !== undefined) result[key] = parseBookingId(query[key]);
  for (const [key, allowed] of [['status', ADMIN_BOOKING_STATUSES], ['paymentStatus', ADMIN_PAYMENT_STATUSES]]) {
    if (query[key] !== undefined) {
      if (!allowed.includes(query[key])) throw invalid(`${key} is invalid.`);
      result[key] = query[key];
    }
  }
  if (query.q !== undefined) {
    if (typeof query.q !== 'string' || query.q.length > 120) throw invalid('q must be a string of at most 120 characters.');
    result.q = query.q.trim();
  }
  return result;
}

export function parseAdminCancellation(body) {
  objectFields(body, ['reason']);
  if (typeof body.reason !== 'string' || body.reason.trim().length < 1 || body.reason.trim().length > 1000) throw invalid('reason must contain 1 to 1000 characters.');
  return { reason: body.reason.trim() };
}
