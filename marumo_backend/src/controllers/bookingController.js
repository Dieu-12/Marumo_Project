import { HttpError } from '../utils/validation.js';
import { parseBookingId, parseBookingCode, parseBookingInput, parsePaymentInput } from '../utils/bookingValidation.js';
import { parseShowtimeId } from '../utils/catalogValidation.js';
import { createBookingService } from '../services/bookingService.js';

function clientIp(req) {
  return (req.ip ?? '127.0.0.1').replace(/^::ffff:/, '');
}

export function createBookingController(repository, { now = Date.now, payment } = {}) {
  const service = createBookingService(repository, { now, payment });
  return {
    async list(req, res) {
      const bookings = await service.listBookings(req.session.userId);
      res.status(200).json({ bookings });
    },
    async detailByCode(req, res) {
      const bookingCode = parseBookingCode(req.params.bookingCode);
      const booking = await service.getBookingByCode(req.session.userId, bookingCode);
      if (!booking) throw new HttpError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
      res.status(200).json({ booking });
    },
    async showtimeFnb(req, res) {
      const showtimeId = parseShowtimeId(req.params.showtimeId);
      const catalog = await service.getShowtimeFnb(showtimeId);
      res.status(200).json(catalog);
    },
    async create(req, res) {
      const input = parseBookingInput(req.body);
      const booking = await service.createBooking(input, req.session);
      res.status(201).location(`/bookings/${booking.id}`).json({ booking });
    },
    async pay(req, res) {
      const bookingId = parseBookingId(req.params.bookingId);
      const { paymentMethod, bankCode } = parsePaymentInput(req.body);
      const result = await service.payBooking(req.session.userId, bookingId, {
        paymentMethod,
        bankCode,
        ipAddr: clientIp(req),
      });
      if (result.booking) {
        res.status(200).json({ booking: result.booking });
        return;
      }
      res.status(201).location(result.paymentUrl).json({ payment: result.payment, attempt: result.attempt, paymentUrl: result.paymentUrl });
    },
    async detail(req, res) {
      const booking = await service.getBooking(req.session.userId, parseBookingId(req.params.bookingId));
      if (!booking) throw new HttpError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
      res.status(200).json({ booking });
    },
    async scan(req, res) {
      const bookingCode = parseBookingCode(req.params.bookingCode);
      const branchId = req.session.authorization?.branchAssignments?.[0]?.branchId;
      if (!branchId) throw new HttpError(403, 'BRANCH_MISMATCH', 'Staff not assigned to any branch.');
      const deviceCode = req.headers['x-device-code'];
      const scanned = await service.scanBooking({ userId: req.session.userId, branchId, bookingCode, deviceCode });
      res.status(200).json({ booking: scanned });
    },
  };
}
