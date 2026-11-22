import express from 'express';
import { HttpError } from './validation.js';
import { createSessionMiddleware, createWriteProof } from './session.js';
import { parseBookingId, parseBookingInput, parsePaymentInput } from './bookingValidation.js';
import { buildPaymentUrl, vnpayTimestamp } from './vnpay.js';

function clientIp(req) {
  return (req.ip ?? '127.0.0.1').replace(/^::ffff:/, '');
}

export function createBookingRouter(repository, { now = Date.now, allowedOrigins = [], sessionTokens, payment } = {}) {
  const router = express.Router();
  const requireSession = createSessionMiddleware(repository, sessionTokens, now);
  const requireWriteProof = createWriteProof(allowedOrigins);

  router.post('/', requireSession, requireWriteProof, async (req, res) => {
    const input = parseBookingInput(req.body);
    const booking = await repository.createBooking({ ...input, userId: req.session.userId, sessionId: req.session.sessionId }, now());
    res.status(201).location(`/bookings/${booking.id}`).json({ booking });
  });

  router.post('/:bookingId/payment', requireSession, requireWriteProof, async (req, res) => {
    const bookingId = parseBookingId(req.params.bookingId);
    const { bankCode } = parsePaymentInput(req.body);
    const created = await repository.createBookingPayment({ userId: req.session.userId, bookingId }, now());
    const paymentUrl = buildPaymentUrl(payment, {
      txnRef: created.txnRef,
      amount: created.payment.amount,
      orderInfo: created.orderInfo,
      ipAddr: clientIp(req),
      createDate: vnpayTimestamp(now()),
      expireDate: vnpayTimestamp(Date.parse(created.payment.expiresAt)),
      bankCode,
    });
    res.status(201).location(paymentUrl).json({ payment: created.payment, attempt: created.attempt, paymentUrl });
  });

  router.get('/:bookingId', requireSession, async (req, res) => {
    const booking = await repository.getBooking({ userId: req.session.userId, bookingId: parseBookingId(req.params.bookingId) }, now());
    if (!booking) throw new HttpError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
    res.status(200).json({ booking });
  });

  return router;
}
