import { createPaymentService } from '../services/paymentService.js';

export function createPaymentController(repository, { now = Date.now, payment } = {}) {
  const service = createPaymentService(repository, { now, payment });
  return {
    async vnpayIpn(req, res) {
      res.status(200).json(await service.vnpayIpn(req.query));
    },
    async vnpayReturn(req, res) {
      res.status(200).json(await service.vnpayReturn(req.session.userId, req.query));
    },
  };
}
