import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Eye, RefreshCw, XCircle } from 'lucide-react';
import { useAdminStore } from '../../hooks/useAdminStore.jsx';
import { adminApi, apiErrorMessage } from '../../utils/adminApi.js';
import { formatCurrency } from '../../utils/formatters.js';
import { Button } from '../../components/common/Button.jsx';
import { Modal } from '../../components/common/Modal.jsx';
import { PageHeader } from '../../components/common/PageHeader.jsx';
import { StatusBadge } from '../../components/common/StatusBadge.jsx';
import { DataTable } from '../../components/tables/DataTable.jsx';
import './BookingsPage.css';

const EMPTY_OPTIONS = { branches: [], bookingStatuses: [], paymentStatuses: [] };
const PAYMENT_LABELS = { NOT_STARTED: 'Chưa khởi tạo', PENDING: 'Chờ thanh toán', PROCESSING: 'Đang xử lý', SUCCESS: 'Thành công', FAILED: 'Thất bại', EXPIRED: 'Hết hạn', CANCELLED: 'Đã hủy' };

function dateTime(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(parsed);
}

function csvText(value) {
  const text = String(value ?? '');
  return /^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
}

function downloadBookingCsv(headers, rows) {
  const csv = [headers, ...rows].map((row) => row.map((value) => `"${csvText(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'marumo-bookings-export.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function ReceiptRow({ label, value, total = false }) {
  return <div className={`booking-receipt-row${total ? ' booking-receipt-total' : ''}`}><span>{label}</span><span className="tabular-nums">{value}</span></div>;
}

export function BookingsPage() {
  const { session, canReadBookings, expireSession, pushToast } = useAdminStore();
  const [bookings, setBookings] = useState([]);
  const [options, setOptions] = useState(EMPTY_OPTIONS);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [detail, setDetail] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [reason, setReason] = useState('');
  const [cancelError, setCancelError] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const generation = useRef(0);
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const listController = useRef(null);
  const detailController = useRef(null);

  const refresh = useCallback(async () => {
    const epoch = generation.current;
    const requestId = ++listRequest.current;
    listController.current?.abort();
    const controller = new AbortController();
    listController.current = controller;
    setLoading(true);
    setListError('');
    try {
      const [rows, lookup] = await Promise.all([
        adminApi.bookings.listAll({ signal: controller.signal }),
        adminApi.bookings.options({ signal: controller.signal }),
      ]);
      if (epoch !== generation.current || requestId !== listRequest.current) return;
      setBookings(rows);
      setOptions(lookup);
    } catch (error) {
      if (controller.signal.aborted || epoch !== generation.current || requestId !== listRequest.current) return;
      setBookings([]);
      setOptions(EMPTY_OPTIONS);
      setListError(apiErrorMessage(error));
      expireSession(error);
    } finally {
      if (epoch === generation.current && requestId === listRequest.current) setLoading(false);
    }
  }, [expireSession]);

  useEffect(() => {
    generation.current += 1;
    setBookings([]);
    setOptions(EMPTY_OPTIONS);
    setSearch('');
    setStatusFilter('');
    setPaymentFilter('');
    setBranchFilter('');
    setDetail(null);
    setCancelTarget(null);
    setReason('');
    setCancelError('');
    setCancelling(false);
    if (canReadBookings) refresh();
    return () => {
      generation.current += 1;
      listController.current?.abort();
      detailController.current?.abort();
    };
  }, [session, canReadBookings, refresh]);

  async function openDetail(bookingId) {
    const epoch = generation.current;
    const requestId = ++detailRequest.current;
    detailController.current?.abort();
    const controller = new AbortController();
    detailController.current = controller;
    setDetail({ id: bookingId, loading: true, error: '', booking: null });
    try {
      const data = await adminApi.bookings.get(bookingId, { signal: controller.signal });
      if (epoch !== generation.current || requestId !== detailRequest.current) return;
      setDetail({ id: bookingId, loading: false, error: '', booking: data.booking });
      setBookings((previous) => previous.map((booking) => booking.id === bookingId ? data.booking : booking));
    } catch (error) {
      if (controller.signal.aborted || epoch !== generation.current || requestId !== detailRequest.current) return;
      setDetail({ id: bookingId, loading: false, error: apiErrorMessage(error), booking: null });
      expireSession(error);
    }
  }

  function closeDetail() {
    detailRequest.current += 1;
    detailController.current?.abort();
    setDetail(null);
  }

  function openCancel(booking) {
    closeDetail();
    setCancelTarget(booking);
    setReason('');
    setCancelError('');
  }

  async function cancel(event) {
    event.preventDefault();
    if (cancelling) return;
    const trimmedReason = reason.trim();
    if (!trimmedReason || trimmedReason.length > 1000) {
      setCancelError('Vui lòng nhập lý do hủy từ 1 đến 1.000 ký tự.');
      return;
    }
    const epoch = generation.current;
    const bookingId = cancelTarget.id;
    setCancelling(true);
    setCancelError('');
    try {
      const data = await adminApi.bookings.cancel(bookingId, trimmedReason);
      if (epoch !== generation.current) return;
      listRequest.current += 1;
      detailRequest.current += 1;
      listController.current?.abort();
      detailController.current?.abort();
      setLoading(false);
      setBookings((previous) => previous.map((booking) => booking.id === bookingId ? data.booking : booking));
      setDetail((previous) => previous?.id === bookingId ? { id: bookingId, loading: false, error: '', booking: data.booking } : previous);
      setCancelTarget(null);
      setReason('');
      pushToast(`Đã hủy booking ${data.booking.code}.`);
    } catch (error) {
      if (epoch !== generation.current) return;
      setCancelError(apiErrorMessage(error));
      expireSession(error);
    } finally {
      if (epoch === generation.current) setCancelling(false);
    }
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return bookings.filter((booking) => (!statusFilter || booking.status === statusFilter) && (!paymentFilter || booking.paymentStatus === paymentFilter) && (!branchFilter || booking.branchId === branchFilter) && [booking.code, booking.customerName, booking.customerEmail, booking.customerPhone, booking.movie.title].some((value) => String(value ?? '').toLowerCase().includes(query)));
  }, [bookings, search, statusFilter, paymentFilter, branchFilter]);
  const statusName = (status) => options.bookingStatuses.find((item) => item.code === status)?.name || status;
  const money = (booking, amount) => formatCurrency(amount, booking.currencyCode);

  function exportBookings() {
    downloadBookingCsv(['Code', 'Customer', 'Email', 'Phone', 'Branch', 'Auditorium', 'Movie', 'Start At UTC', 'Seats', 'Issued Tickets', 'Ticket Total', 'Food Total', 'Grand Total', 'Currency', 'Booking Status', 'Payment Status', 'Payment Method', 'Points Redeemed', 'Created At UTC'], filtered.map((booking) => [booking.code, booking.customerName, booking.customerEmail, booking.customerPhone, booking.showtime.branchName, booking.showtime.auditoriumName, booking.movie.title, booking.showtime.startAt, booking.seatCount, booking.ticketCount, booking.totalAmount, booking.fnbTotalAmount, booking.grandTotalAmount, booking.currencyCode, booking.status, booking.paymentStatus, booking.paymentMethod, booking.pointsRedeemed, booking.createdAt]));
    pushToast(`Đã xuất ${filtered.length} booking đang hiển thị sau bộ lọc.`);
  }

  const columns = [
    { key: 'code', label: 'Reference', sortable: true, sortKey: 'code', render: (booking) => <div><div className="mono-code" style={{ fontWeight: 600 }}>{booking.code}</div><div className="meta-row">{dateTime(booking.createdAt)}</div></div> },
    { key: 'customerName', label: 'Customer', sortable: true, sortKey: 'customerName', render: (booking) => <div>{booking.customerName || '—'}<div className="meta-row">{booking.customerEmail || '—'}</div></div> },
    { key: 'movieTitle', label: 'Movie & Branch', render: (booking) => <div>{booking.movie.title}<div className="meta-row">{booking.showtime.branchName} · {booking.showtime.auditoriumName}</div><div className="meta-row">{dateTime(booking.showtime.startAt)}</div></div> },
    { key: 'seatCount', label: 'Seats / Tickets', align: 'right', sortable: true, sortKey: 'seatCount', render: (booking) => <div className="tabular-nums">{booking.seatCount} seats<div className="meta-row">{booking.ticketCount} issued tickets</div></div> },
    { key: 'grandTotalAmount', label: 'Total', align: 'right', sortable: true, sortKey: 'grandTotalAmount', render: (booking) => <strong className="tabular-nums">{money(booking, booking.grandTotalAmount)}</strong> },
    { key: 'status', label: 'Booking', sortable: true, sortKey: 'status', render: (booking) => <StatusBadge status={statusName(booking.status)} /> },
    { key: 'paymentStatus', label: 'Payment', sortable: true, sortKey: 'paymentStatus', render: (booking) => <StatusBadge status={PAYMENT_LABELS[booking.paymentStatus] || booking.paymentStatus} /> },
  ];
  const booking = detail?.booking;

  if (!canReadBookings) return <p role="alert">Bạn không có quyền xem booking.</p>;

  return <div>
    <PageHeader title="Booking Management" subtitle="Inspect SQL bookings in your permitted branches. Cancellation is available only for unpaid bookings awaiting payment. Times use Vietnam time (UTC+07:00)." actions={<><Button variant="secondary" onClick={refresh} disabled={loading}><RefreshCw size={15} aria-hidden="true" /> Refresh</Button><Button variant="secondary" onClick={exportBookings} disabled={loading || Boolean(listError) || !filtered.length}><Download size={15} aria-hidden="true" /> Export CSV</Button></>} />
    <DataTable columns={columns} data={filtered} searchQuery={search} onSearchChange={setSearch} searchPlaceholder="Search reference, customer, phone, or movie..." isLoading={loading} errorMessage={listError} onRetry={refresh} filters={<>
      <select className="data-table-filter-select" aria-label="Filter by branch" value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}><option value="">All Permitted Branches</option>{options.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
      <select className="data-table-filter-select" aria-label="Filter by booking status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">All Booking Statuses</option>{options.bookingStatuses.map((status) => <option key={status.code} value={status.code}>{status.name}</option>)}</select>
      <select className="data-table-filter-select" aria-label="Filter by payment status" value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)}><option value="">All Payment Statuses</option>{options.paymentStatuses.map((status) => <option key={status} value={status}>{PAYMENT_LABELS[status] || status}</option>)}</select>
    </>} emptyAction={<Button variant="secondary" size="sm" onClick={() => { setSearch(''); setStatusFilter(''); setPaymentFilter(''); setBranchFilter(''); }}>Reset Filters</Button>} renderActions={(row) => [
      { label: 'Booking Details', icon: Eye, onClick: () => openDetail(row.id) },
      ...(row.canCancel ? [{ label: 'Cancel Booking', icon: XCircle, danger: true, onClick: () => openCancel(row) }] : []),
    ]} />
    <Modal isOpen={Boolean(detail)} onClose={closeDetail} title={booking ? `Booking ${booking.code}` : 'Booking Details'} subtitle={booking ? `Placed ${dateTime(booking.createdAt)} · Vietnam time` : ''} size="lg" footer={<><Button variant="secondary" onClick={closeDetail}>Close</Button>{booking?.canCancel ? <Button variant="danger" onClick={() => openCancel(booking)}>Cancel Booking</Button> : null}</>}>
      {detail?.loading ? <p role="status">Đang tải chi tiết booking...</p> : null}
      {detail?.error ? <div role="alert"><p className="form-error">{detail.error}</p><Button variant="secondary" onClick={() => openDetail(detail.id)}>Retry Details</Button></div> : null}
      {booking ? <>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}><StatusBadge status={statusName(booking.status)} /><StatusBadge status={PAYMENT_LABELS[booking.paymentStatus] || booking.paymentStatus} /></div>
        <div className="detail-kv-grid">
          <div className="detail-kv"><span className="detail-kv-label">Customer</span><span className="detail-kv-value">{booking.customerName || '—'}</span><span className="meta-row">{booking.customerEmail || '—'}</span><span className="meta-row">{booking.customerPhone || '—'}</span></div>
          <div className="detail-kv"><span className="detail-kv-label">Cinema Branch</span><span className="detail-kv-value">{booking.showtime.branchName}</span><span className="meta-row">{booking.showtime.auditoriumName}</span></div>
          <div className="detail-kv"><span className="detail-kv-label">Movie</span><span className="detail-kv-value">{booking.movie.title}</span><span className="meta-row">{booking.showtime.formatName}</span></div>
          <div className="detail-kv"><span className="detail-kv-label">Showtime (Vietnam)</span><span className="detail-kv-value">{dateTime(booking.showtime.startAt)}</span><span className="meta-row">to {dateTime(booking.showtime.endAt)}</span></div>
          <div className="detail-kv"><span className="detail-kv-label">Channel</span><span className="detail-kv-value">{booking.channel}</span></div>
          <div className="detail-kv"><span className="detail-kv-label">Hold Deadline / Confirmed At</span><span className="detail-kv-value">{dateTime(booking.expiresAt)}</span><span className="meta-row">{dateTime(booking.confirmedAt)}</span></div>
        </div>
        <section className="form-section"><h3 className="form-section-title">Seats ({booking.seatCount}) · Issued Tickets ({booking.ticketCount})</h3><DataTable columns={[
          { key: 'code', label: 'Seat' }, { key: 'typeName', label: 'Type' }, { key: 'finalPrice', label: 'Seat Total', render: (seat) => money(booking, seat.finalPrice) }, { key: 'ticketCode', label: 'Ticket', render: (seat) => seat.ticketCode || '—' }, { key: 'ticketStatus', label: 'Ticket Status', render: (seat) => seat.ticketStatus || '—' }, { key: 'releasedAt', label: 'Released At', render: (seat) => dateTime(seat.releasedAt) },
        ]} data={booking.seats} /></section>
        {booking.fnbOrder ? <section className="form-section" style={{ marginTop: 18 }}><h3 className="form-section-title">Food & Beverages · {booking.fnbOrder.code} · {booking.fnbOrder.status}</h3><DataTable rowKey="lineNumber" columns={[
          { key: 'name', label: 'Item' }, { key: 'kind', label: 'Kind' }, { key: 'unitPrice', label: 'Unit Price', render: (item) => money(booking, item.unitPrice) }, { key: 'quantity', label: 'Quantity' }, { key: 'lineTotal', label: 'Total', render: (item) => money(booking, item.lineTotal) },
        ]} data={booking.fnbOrder.items} /></section> : null}
        <div className="booking-receipt-box" style={{ marginTop: 18 }}>
          <ReceiptRow label="Payment Method" value={booking.paymentMethod || 'Chưa khởi tạo'} />
          <ReceiptRow label="Ticket Subtotal" value={money(booking, booking.subtotalAmount)} />
          <ReceiptRow label="Ticket Discount" value={`−${money(booking, booking.discountAmount)}`} />
          <ReceiptRow label="Ticket Total" value={money(booking, booking.totalAmount)} />
          {booking.fnbOrder ? <><ReceiptRow label="Food Subtotal" value={money(booking, booking.fnbOrder.subtotalAmount)} /><ReceiptRow label="Food Discount" value={`−${money(booking, booking.fnbOrder.discountAmount)}`} /></> : null}
          <ReceiptRow label="Food Total" value={money(booking, booking.fnbTotalAmount)} />
          <ReceiptRow label="Order Total" value={money(booking, booking.grandTotalAmount)} total />
          {booking.pointsRedeemed > 0 ? <ReceiptRow label="Points Redeemed" value={new Intl.NumberFormat('vi-VN').format(booking.pointsRedeemed)} /> : null}
          {booking.payment ? <><ReceiptRow label="Payment Transaction" value={booking.payment.code} /><ReceiptRow label="Transaction Method" value={booking.payment.method} /><ReceiptRow label="Transaction Status" value={booking.payment.status} /><ReceiptRow label="Transaction Amount" value={formatCurrency(booking.payment.amount, booking.payment.currencyCode)} /><ReceiptRow label="Paid At (Vietnam)" value={dateTime(booking.payment.paidAt)} /></> : null}
        </div>
        {booking.paymentMethod === 'POINTS' && booking.payment && booking.payment.status !== 'SUCCESS' ? <p className="meta-row" style={{ marginTop: 12 }}>Booking đã thanh toán bằng điểm. Giao dịch cổng thanh toán ở trên giữ trạng thái thực tế riêng và không thay thế kết quả trừ điểm.</p> : null}
        {booking.cancellations.length ? <section className="form-section" style={{ marginTop: 18 }}><h3 className="form-section-title">Cancellation History</h3><DataTable columns={[
          { key: 'code', label: 'Reference' }, { key: 'reason', label: 'Reason' }, { key: 'status', label: 'Status' }, { key: 'processedAt', label: 'Processed At', render: (item) => dateTime(item.processedAt) }, { key: 'processedBy', label: 'Processed By', render: (item) => item.processedBy || '—' },
        ]} data={booking.cancellations} /></section> : null}
      </> : null}
    </Modal>
    <Modal isOpen={Boolean(cancelTarget)} onClose={() => { if (!cancelling) setCancelTarget(null); }} title="Cancel Booking" subtitle={cancelTarget?.code} size="sm" footer={<><Button variant="secondary" onClick={() => setCancelTarget(null)} disabled={cancelling}>Keep Booking</Button><Button variant="danger" type="submit" form="cancel-booking-form" disabled={cancelling}>{cancelling ? 'Cancelling...' : cancelError ? 'Retry Cancel Booking' : 'Cancel Booking'}</Button></>}>
      <form id="cancel-booking-form" onSubmit={cancel}>
        <p>Hủy booking đang chờ thanh toán sẽ trả ghế và giải phóng tài nguyên đang giữ. Hệ thống không xác nhận thanh toán hoặc hoàn tiền tại đây.</p>
        <div className="form-field" style={{ marginTop: 16 }}><label className="form-label" htmlFor="booking-cancel-reason">Cancellation Reason *</label><textarea id="booking-cancel-reason" className="form-textarea" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} disabled={cancelling} required /></div>
        {cancelError ? <p className="form-error" role="alert">{cancelError}</p> : null}
      </form>
    </Modal>
  </div>;
}
