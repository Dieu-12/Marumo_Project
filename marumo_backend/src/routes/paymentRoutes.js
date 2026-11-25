import express from 'express';
import { createSessionMiddleware } from '../middlewares/session.js';
import { createPaymentController } from '../controllers/paymentController.js';

export function createPaymentsRouter(repository, { now = Date.now, sessionTokens, payment } = {}) {
  const router = express.Router();
  const requireSession = createSessionMiddleware(repository, sessionTokens, now);
  const controller = createPaymentController(repository, { now, payment });

  router.get('/vnpay/ipn', controller.vnpayIpn);
  router.get('/vnpay/return', requireSession, controller.vnpayReturn);
  return router;
}
