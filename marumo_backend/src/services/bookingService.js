import { buildPaymentUrl, vnpayTimestamp } from './vnpay.js';

export function createBookingService(repository, { now = Date.now, payment } = {}) {
  return {
    async listBookings(userId) {
      return repository.listBookings({ userId }, now());
    },
    async getBooking(userId, bookingId) {
      return repository.getBooking({ userId, bookingId }, now());
    },
    async getBookingByCode(userId, bookingCode) {
      return repository.getBookingByCode({ userId, bookingCode }, now());
    },
    async getShowtimeFnb(showtimeId) {
      return repository.getShowtimeFnb({ showtimeId }, now());
    },
    async createBooking(input, session) {
      return repository.createBooking({ ...input, userId: session.userId, sessionId: session.sessionId }, now());
    },
    async payBooking(userId, bookingId, { paymentMethod, bankCode, ipAddr }) {
      if (paymentMethod === 'POINTS') {
        return { booking: await repository.payBookingWithPoints({ userId, bookingId }, now()) };
      }
      const created = await repository.createBookingPayment({ userId, bookingId }, now());
      const paymentUrl = buildPaymentUrl(payment, {
        txnRef: created.txnRef,
        amount: created.payment.amount,
        orderInfo: created.orderInfo,
        ipAddr,
        createDate: vnpayTimestamp(now()),
        expireDate: vnpayTimestamp(Date.parse(created.payment.expiresAt)),
        bankCode,
      });
      return { payment: created.payment, attempt: created.attempt, paymentUrl };
    },
    async scanBooking({ userId, branchId, bookingCode, deviceCode }) {
      return repository.scanBooking({ userId, branchId, bookingCode, deviceCode }, now());
    },
  };
}
