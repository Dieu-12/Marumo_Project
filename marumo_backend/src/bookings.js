import express from 'express';
import { HttpError } from './validation.js';
import { createSessionMiddleware, createWriteProof } from './session.js';
import { parseBookingId, parseBookingCode, parseBookingInput, parsePaymentInput } from './bookingValidation.js';
import { requirePermission } from './permissions.js';
import { buildPaymentUrl, vnpayTimestamp } from './vnpay.js';

function clientIp(req) {
  return (req.ip ?? '127.0.0.1').replace(/^::ffff:/, '');
}

export function createBookingRouter(repository, { now = Date.now, allowedOrigins = [], sessionTokens, payment } = {}) {
  const router = express.Router();
  const requireSession = createSessionMiddleware(repository, sessionTokens, now);
  const requireWriteProof = createWriteProof(allowedOrigins);
  const requireStaffScan = requirePermission('booking.scan');

  router.get('/', requireSession, async (req, res) => {
    const bookings = await repository.listBookings({ userId: req.session.userId }, now());
    res.status(200).json({ bookings });
  });

  router.get('/code/:bookingCode', requireSession, async (req, res) => {
    const bookingCode = parseBookingCode(req.params.bookingCode);
    const booking = await repository.getBookingByCode({ userId: req.session.userId, bookingCode }, now());
    if (!booking) throw new HttpError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
    res.status(200).json({ booking });
  });

  router.post('/', requireSession, requireWriteProof, async (req, res) => {
    const input = parseBookingInput(req.body);
    const booking = await repository.createBooking({ ...input, userId: req.session.userId, sessionId: req.session.sessionId }, now());
    res.status(201).location(`/bookings/${booking.id}`).json({ booking });
  });

  router.post('/:bookingId/payment', requireSession, requireWriteProof, async (req, res) => {
    const bookingId = parseBookingId(req.params.bookingId);
    const { paymentMethod, bankCode } = parsePaymentInput(req.body);
    if (paymentMethod === 'POINTS') {
      const booking = await repository.payBookingWithPoints({ userId: req.session.userId, bookingId }, now());
      res.status(200).json({ booking });
      return;
    }
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

  router.post('/:bookingCode/scan', requireSession, requireWriteProof, requireStaffScan, async (req, res) => {
    const bookingCode = parseBookingCode(req.params.bookingCode);
    const branchId = req.session.authorization?.branchAssignments?.[0]?.branchId;
    if (!branchId) throw new HttpError(403, 'BRANCH_MISMATCH', 'Staff not assigned to any branch.');
    const deviceCode = req.headers['x-device-code'];
    const scanned = await repository.scanBooking({ userId: req.session.userId, branchId, bookingCode, deviceCode }, now());
    res.status(200).json({ booking: scanned });
  });

  return router;
}
