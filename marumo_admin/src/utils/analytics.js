/**
 * Pure analytics, filtering, sorting, and pagination helpers.
 */

export function sortRecords(records, sortKey, sortDirection = 'asc') {
  if (!sortKey || !Array.isArray(records)) return records || [];
  const dir = sortDirection === 'desc' ? -1 : 1;
  return [...records].sort((a, b) => {
    const valA = a?.[sortKey];
    const valB = b?.[sortKey];
    if (valA == null && valB == null) return 0;
    if (valA == null) return 1;
    if (valB == null) return -1;
    if (typeof valA === 'number' && typeof valB === 'number') {
      return (valA - valB) * dir;
    }
    return String(valA).localeCompare(String(valB), undefined, { numeric: true }) * dir;
  });
}

export function paginateRecords(records, page = 1, pageSize = 8) {
  const list = Array.isArray(records) ? records : [];
  const totalItems = list.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: list.slice(start, start + pageSize),
    page: safePage,
    pageSize,
    totalItems,
    totalPages,
    startIndex: totalItems === 0 ? 0 : start + 1,
    endIndex: Math.min(start + pageSize, totalItems),
  };
}

export function computeDashboardKpis({ bookings, cinemas, users }) {
  const validBookings = (bookings || []).filter((b) => b.bookingStatus !== 'Cancelled');
  const totalRevenue = validBookings.reduce((sum, b) => sum + Number(b.totalAmount || 0), 0);
  const totalBookings = (bookings || []).length;
  const totalTicketsSold = validBookings.reduce((sum, b) => sum + Number(b.ticketCount || 0), 0);
  const activeCinemas = (cinemas || []).filter((c) => c.status === 'Active').length;
  const registeredCustomers = (users || []).length;

  return {
    totalRevenue,
    totalBookings,
    totalTicketsSold,
    activeCinemas,
    registeredCustomers,
  };
}

export function computeBookingStatusDistribution(bookings) {
  const counts = {
    Confirmed: 0,
    Pending: 0,
    Completed: 0,
    Cancelled: 0,
  };
  for (const b of bookings || []) {
    if (Object.prototype.hasOwnProperty.call(counts, b.bookingStatus)) {
      counts[b.bookingStatus] += 1;
    }
  }
  return [
    { name: 'Confirmed', value: counts.Confirmed, color: '#2563EB' },
    { name: 'Completed', value: counts.Completed, color: '#16A34A' },
    { name: 'Pending', value: counts.Pending, color: '#F59E0B' },
    { name: 'Cancelled', value: counts.Cancelled, color: '#DC2626' },
  ].filter((item) => item.value > 0);
}

export function computeCinemaPerformance(cinemas, bookings) {
  return (cinemas || [])
    .map((cinema) => {
      const branchBookings = (bookings || []).filter(
        (b) => b.cinemaId === cinema.id && b.bookingStatus !== 'Cancelled'
      );
      const revenue = branchBookings.reduce((sum, b) => sum + Number(b.totalAmount || 0), 0);
      const tickets = branchBookings.reduce((sum, b) => sum + Number(b.ticketCount || 0), 0);
      return {
        id: cinema.id,
        name: cinema.name.replace('MARUMO ', ''),
        fullName: cinema.name,
        city: cinema.city,
        revenue: cinema.monthlyRevenue + revenue,
        bookings: cinema.monthlyBookings + branchBookings.length,
        tickets,
        occupancyRate: cinema.occupancyRate,
        status: cinema.status,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}
