import { HttpError } from '../utils/validation.js';
import { parseBookingId } from '../utils/bookingValidation.js';
import { parseAdminBookingQuery, parseAdminCancellation } from '../utils/adminBookingValidation.js';
import { createAdminBookingService } from '../services/adminBookingService.js';

export function createAdminBookingController(repository, options) {
  const service = createAdminBookingService(repository, options);
  return {
    async options(req, res) {
      res.json(await service.options(req.session.userId));
    },
    async list(req, res) {
      const query = parseAdminBookingQuery(req.query);
      const rows = await service.list(req.session.userId, query);
      const bookings = rows.slice(0, query.limit);
      res.json({ bookings, nextAfter: rows.length > query.limit ? bookings.at(-1).id : null });
    },
    async detail(req, res) {
      const booking = await service.detail(req.session.userId, parseBookingId(req.params.bookingId));
      if (!booking) throw new HttpError(404, 'BOOKING_NOT_FOUND', 'Booking not found.');
      res.json({ booking });
    },
    async cancel(req, res) {
      const booking = await service.cancel(req.session.userId, parseBookingId(req.params.bookingId), parseAdminCancellation(req.body));
      res.json({ booking });
    },
  };
}
