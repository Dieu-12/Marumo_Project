import { useMemo, useState } from 'react';
import { CheckCircle2, Download, Eye, XCircle } from 'lucide-react';
import { useAdminStore } from '../../hooks/useAdminStore.jsx';
import { downloadCsvFile } from '../../services/adminService.js';
import { formatCurrency } from '../../utils/formatters.js';
import { Button } from '../../components/common/Button.jsx';
import { ConfirmDialog } from '../../components/common/ConfirmDialog.jsx';
import { Modal } from '../../components/common/Modal.jsx';
import { PageHeader } from '../../components/common/PageHeader.jsx';
import { StatusBadge } from '../../components/common/StatusBadge.jsx';
import { DataTable } from '../../components/tables/DataTable.jsx';
import './BookingsPage.css';

export function BookingsPage() {
  const { bookings, cinemas, movies, showtimes, updateBookingStatus, pushToast } = useAdminStore();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [paymentFilter, setPaymentFilter] = useState('All');
  const [cinemaFilter, setCinemaFilter] = useState('All');
  const [detailBooking, setDetailBooking] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);

  const cinemaMap = useMemo(
    () => Object.fromEntries(cinemas.map((c) => [c.id, c])),
    [cinemas]
  );
  const movieMap = useMemo(
    () => Object.fromEntries(movies.map((m) => [m.id, m])),
    [movies]
  );
  const showtimeMap = useMemo(
    () => Object.fromEntries(showtimes.map((s) => [s.id, s])),
    [showtimes]
  );

  const enrichedBookings = useMemo(
    () =>
      bookings.map((b) => {
        const showtime = showtimeMap[b.showtimeId];
        return {
          ...b,
          cinemaName: cinemaMap[b.cinemaId]?.name || 'Branch',
          movieTitle: movieMap[b.movieId]?.title || 'Movie',
          showtimeLabel: showtime ? `${showtime.date} · ${showtime.startTime}` : 'Scheduled Slot',
          roomLabel: showtime?.room || 'Auditorium',
        };
      }),
    [bookings, cinemaMap, movieMap, showtimeMap]
  );

  const filteredBookings = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enrichedBookings.filter((b) => {
      if (statusFilter !== 'All' && b.bookingStatus !== statusFilter) return false;
      if (paymentFilter !== 'All' && b.paymentStatus !== paymentFilter) return false;
      if (cinemaFilter !== 'All' && b.cinemaId !== cinemaFilter) return false;
      if (!q) return true;
      return (
        b.reference.toLowerCase().includes(q) ||
        b.customerName.toLowerCase().includes(q) ||
        b.customerEmail.toLowerCase().includes(q) ||
        b.movieTitle.toLowerCase().includes(q)
      );
    });
  }, [enrichedBookings, search, statusFilter, paymentFilter, cinemaFilter]);

  const handleExportBookings = () => {
    downloadCsvFile(
      'marumo-bookings-export.csv',
      ['Reference', 'Customer', 'Email', 'Cinema', 'Movie', 'Showtime', 'Tickets', 'Total', 'Booking Status', 'Payment Status'],
      filteredBookings.map((b) => [
        b.reference,
        b.customerName,
        b.customerEmail,
        b.cinemaName,
        b.movieTitle,
        b.showtimeLabel,
        b.ticketCount,
        b.totalAmount,
        b.bookingStatus,
        b.paymentStatus,
      ])
    );
    pushToast(`Exported ${filteredBookings.length} booking records to CSV`);
  };

  const columns = [
    {
      key: 'reference',
      label: 'Reference',
      sortable: true,
      sortKey: 'reference',
      render: (row) => (
        <div>
          <div className="mono-code" style={{ fontWeight: 600 }}>
            {row.reference}
          </div>
          <div className="meta-row">{row.createdAt}</div>
        </div>
      ),
    },
    {
      key: 'customerName',
      label: 'Customer',
      sortable: true,
      sortKey: 'customerName',
      render: (row) => (
        <div>
          <div style={{ fontWeight: 500 }}>{row.customerName}</div>
          <div className="meta-row">{row.customerEmail}</div>
        </div>
      ),
    },
    {
      key: 'movieTitle',
      label: 'Movie & Branch',
      render: (row) => (
        <div>
          <div style={{ fontWeight: 500 }}>{row.movieTitle}</div>
          <div className="meta-row">
            <span>{row.cinemaName.replace('MARUMO ', '')}</span>
            <span className="meta-sep">·</span>
            <span className="mono-code">{row.showtimeLabel}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'ticketCount',
      label: 'Tickets',
      align: 'right',
      sortable: true,
      sortKey: 'ticketCount',
      render: (row) => <span className="tabular-nums">{row.ticketCount} seats</span>,
    },
    {
      key: 'totalAmount',
      label: 'Total',
      align: 'right',
      sortable: true,
      sortKey: 'totalAmount',
      render: (row) => (
        <span className="tabular-nums" style={{ fontWeight: 600 }}>
          {formatCurrency(row.totalAmount)}
        </span>
      ),
    },
    {
      key: 'bookingStatus',
      label: 'Booking',
      sortable: true,
      sortKey: 'bookingStatus',
      render: (row) => <StatusBadge status={row.bookingStatus} />,
    },
    {
      key: 'paymentStatus',
      label: 'Payment',
      sortable: true,
      sortKey: 'paymentStatus',
      render: (row) => <StatusBadge status={row.paymentStatus} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Booking Management"
        subtitle="Inspect ticket orders, verify payment settlement, and manage cancellations."
        actions={
          <Button variant="secondary" onClick={handleExportBookings}>
            <Download size={15} aria-hidden="true" />
            <span>Export CSV</span>
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={filteredBookings}
        searchQuery={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search reference, customer, or movie..."
        filters={
          <>
            <select
              className="data-table-filter-select"
              aria-label="Filter by branch"
              value={cinemaFilter}
              onChange={(e) => setCinemaFilter(e.target.value)}
            >
              <option value="All">All Branches</option>
              {cinemas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              className="data-table-filter-select"
              aria-label="Filter by booking status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="All">All Booking Statuses</option>
              <option value="Confirmed">Confirmed</option>
              <option value="Completed">Completed</option>
              <option value="Pending">Pending</option>
              <option value="Cancelled">Cancelled</option>
            </select>
            <select
              className="data-table-filter-select"
              aria-label="Filter by payment status"
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
            >
              <option value="All">All Payment Statuses</option>
              <option value="Paid">Paid</option>
              <option value="Pending">Pending</option>
            </select>
          </>
        }
        emptyAction={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setSearch('');
              setStatusFilter('All');
              setPaymentFilter('All');
              setCinemaFilter('All');
            }}
          >
            Reset Filters
          </Button>
        }
        renderActions={(row) => [
          {
            label: 'Booking Details',
            icon: Eye,
            onClick: () => setDetailBooking(row),
          },
          row.bookingStatus === 'Pending'
            ? {
                label: 'Confirm Booking',
                icon: CheckCircle2,
                onClick: () => updateBookingStatus(row.id, 'Confirmed', 'Paid'),
              }
            : null,
          row.bookingStatus !== 'Cancelled'
            ? {
                label: 'Cancel Booking',
                icon: XCircle,
                danger: true,
                onClick: () => setCancelTarget(row),
              }
            : null,
        ].filter(Boolean)}
      />

      <Modal
        isOpen={Boolean(detailBooking)}
        onClose={() => setDetailBooking(null)}
        title={`Booking ${detailBooking?.reference || ''}`}
        subtitle={detailBooking ? `Placed ${detailBooking.createdAt}` : ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDetailBooking(null)}>
              Close
            </Button>
            {detailBooking && detailBooking.bookingStatus === 'Pending' ? (
              <Button
                variant="primary"
                onClick={() => {
                  updateBookingStatus(detailBooking.id, 'Confirmed', 'Paid');
                  setDetailBooking(null);
                }}
              >
                Confirm &amp; Mark Paid
              </Button>
            ) : null}
          </>
        }
      >
        {detailBooking ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <StatusBadge status={detailBooking.bookingStatus} />
              <StatusBadge status={detailBooking.paymentStatus} />
            </div>

            <div className="detail-kv-grid">
              <div className="detail-kv">
                <span className="detail-kv-label">Customer</span>
                <span className="detail-kv-value">{detailBooking.customerName}</span>
                <span className="meta-row">{detailBooking.customerEmail}</span>
              </div>
              <div className="detail-kv">
                <span className="detail-kv-label">Cinema Branch</span>
                <span className="detail-kv-value">{detailBooking.cinemaName}</span>
                <span className="meta-row">{detailBooking.roomLabel}</span>
              </div>
              <div className="detail-kv">
                <span className="detail-kv-label">Movie</span>
                <span className="detail-kv-value">{detailBooking.movieTitle}</span>
              </div>
              <div className="detail-kv">
                <span className="detail-kv-label">Showtime Slot</span>
                <span className="detail-kv-value mono-code">{detailBooking.showtimeLabel}</span>
              </div>
            </div>

            <div className="form-field">
              <span className="detail-kv-label">Assigned Seats ({detailBooking.ticketCount})</span>
              <div className="seat-chip-list">
                {(detailBooking.seats || []).map((seat) => (
                  <span key={seat} className="seat-code">
                    {seat}
                  </span>
                ))}
              </div>
            </div>

            <div className="booking-receipt-box">
              <div className="booking-receipt-row">
                <span>Payment Method</span>
                <span>{detailBooking.paymentMethod}</span>
              </div>
              <div className="booking-receipt-row">
                <span>Ticket Subtotal</span>
                <span className="tabular-nums">{formatCurrency(detailBooking.subtotal)}</span>
              </div>
              <div className="booking-receipt-row">
                <span>Promotion Discount</span>
                <span className="tabular-nums">-{formatCurrency(detailBooking.discount)}</span>
              </div>
              <div className="booking-receipt-row booking-receipt-total">
                <span>Total Payment</span>
                <span className="tabular-nums">{formatCurrency(detailBooking.totalAmount)}</span>
              </div>
            </div>
          </>
        ) : null}
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => {
          if (cancelTarget) {
            updateBookingStatus(cancelTarget.id, 'Cancelled');
          }
        }}
        title="Cancel Booking"
        message={
          cancelTarget
            ? `Cancel order ${cancelTarget.reference} for ${cancelTarget.customerName}? Payment will not be reversed.`
            : ''
        }
        confirmLabel="Cancel Booking"
      />
    </div>
  );
}
