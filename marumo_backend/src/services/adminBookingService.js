export function createAdminBookingService(repository, { now = Date.now } = {}) {
  return {
    options(userId) {
      return repository.adminBookingOptions({ userId }, now());
    },
    list(userId, query) {
      return repository.listAdminBookings({ userId, ...query, limit: query.limit + 1 }, now());
    },
    detail(userId, bookingId) {
      return repository.getAdminBooking({ userId, bookingId }, now());
    },
    cancel(userId, bookingId, input) {
      return repository.cancelAdminBooking({ userId, bookingId, ...input }, now());
    },
  };
}
