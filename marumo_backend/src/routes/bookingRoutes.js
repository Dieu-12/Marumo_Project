import express from 'express';
import { createSessionMiddleware, createWriteProof } from '../middlewares/session.js';
import { requirePermission } from '../middlewares/permissions.js';
import { createBookingController } from '../controllers/bookingController.js';

export function createBookingRouter(repository, { now = Date.now, allowedOrigins = [], sessionTokens, payment } = {}) {
  const router = express.Router();
  const requireSession = createSessionMiddleware(repository, sessionTokens, now);
  const requireWriteProof = createWriteProof(allowedOrigins);
  const requireStaffScan = requirePermission('booking.scan');
  const controller = createBookingController(repository, { now, payment });

  router.get('/', requireSession, controller.list);
  router.get('/code/:bookingCode', requireSession, controller.detailByCode);
  router.get('/showtimes/:showtimeId/fnb', requireSession, controller.showtimeFnb);
  router.post('/', requireSession, requireWriteProof, controller.create);
  router.post('/:bookingId/payment', requireSession, requireWriteProof, controller.pay);
  router.get('/:bookingId', requireSession, controller.detail);
  router.post('/:bookingCode/scan', requireSession, requireWriteProof, requireStaffScan, controller.scan);
  return router;
}
