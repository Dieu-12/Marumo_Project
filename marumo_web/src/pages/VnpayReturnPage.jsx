import { useCallback, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Clock, Home, Ticket, XCircle } from 'lucide-react';
import {
  BOOKING_STATUS_LABELS,
  bookingHoldDeadlineLabel,
  bookingHoldRemainingSeconds,
  bookingPayTotal,
  bookingShowtimeLabels,
  formatHoldRemaining,
} from '../utils/bookingApi.js';
import { vnpayReturnStore } from '../utils/vnpayReturnStore.js';
import BookingQrSvg from '../components/BookingQrSvg.jsx';

function bindHoldCountdown(expiresAt, setRemaining) {
  const initial = bookingHoldRemainingSeconds(expiresAt);
  if (initial === null) return undefined;
  setRemaining(initial);
  const tick = window.setInterval(() => {
    setRemaining(bookingHoldRemainingSeconds(expiresAt) ?? 0);
  }, 1000);
  return () => window.clearInterval(tick);
}

export default function VnpayReturnPage() {
  const snapshot = useSyncExternalStore(
    vnpayReturnStore.subscribe,
    vnpayReturnStore.getSnapshot,
    vnpayReturnStore.getSnapshot
  );
  const [remainingSeconds, setRemainingSeconds] = useState(null);

  const bindPage = useCallback((node) => {
    if (!node) return undefined;
    vnpayReturnStore.load(window.location.search);
    return undefined;
  }, []);

  const outcome = snapshot.outcome;

  const bindCountdown = useCallback(
    (node) => {
      const expiresAt = outcome?.booking?.expiresAt ?? '';
      if (!node || outcome?.kind !== 'pending' || !expiresAt) return undefined;
      return bindHoldCountdown(expiresAt, setRemainingSeconds);
    },
    [outcome]
  );

  if (snapshot.status === 'idle' || snapshot.status === 'loading') {
    return (
      <main ref={bindPage} className="section">
        <div className="container catalog-state">Đang xác nhận kết quả thanh toán từ VNPAY…</div>
      </main>
    );
  }

  if (snapshot.status === 'error') {
    return (
      <main ref={bindPage} className="section">
        <div className="container">
          <div className="ticket-confirmation-card">
            <div
              className="ticket-confirm-banner"
              style={{ backgroundColor: 'var(--color-bg-light)', color: 'var(--color-text-secondary)' }}
            >
              <AlertTriangle size={28} aria-hidden="true" />
              <div>
                <h1 style={{ fontSize: '1.375rem', marginBottom: '2px' }}>
                  Không xác thực được kết quả thanh toán
                </h1>
                <p style={{ fontSize: '0.875rem' }}>
                  Vui lòng kiểm tra lại vé của bạn hoặc thử thanh toán lại từ đầu.
                </p>
              </div>
            </div>
            <div className="ticket-confirm-body" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link to="/tickets" className="btn btn-primary">
                Vé của tôi
              </Link>
              <Link to="/" className="btn btn-outline">
                <Home size={16} aria-hidden="true" />
                <span>Về trang chủ</span>
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const booking = outcome.booking;
  const startLabels = bookingShowtimeLabels(booking.showtime);

  if (outcome.kind === 'confirmed') {
    return (
      <main ref={bindPage} className="section">
        <div className="container">
          <div className="ticket-confirmation-card">
            <div className="ticket-confirm-banner">
              <CheckCircle2 size={28} aria-hidden="true" />
              <div>
                <h1 style={{ fontSize: '1.375rem', marginBottom: '2px' }}>
                  Thanh toán thành công
                </h1>
                <p style={{ fontSize: '0.875rem' }}>
                  Vé đã được xác nhận — xuất trình mã QR khi vào rạp.
                </p>
              </div>
            </div>

            <div className="ticket-confirm-body">
              <div className="ticket-qr-row">
                <div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                    Mã đặt vé
                  </div>
                  <div className="ticket-code-mono" style={{ marginBottom: '10px' }}>
                    {booking.code}
                  </div>
                  <h2 style={{ fontSize: '1.5rem', marginBottom: '6px' }}>
                    {booking.movieTitle || 'Vé xem phim MARUMO'}
                  </h2>
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9375rem' }}>
                    {booking.showtime?.branchName} · {booking.showtime?.auditoriumName}
                  </p>
                  <p className="tabular-nums" style={{ fontWeight: 600, marginTop: '4px' }}>
                    {startLabels.dateLabel} lúc {startLabels.timeLabel} ({booking.showtime?.formatName})
                  </p>
                </div>

                <BookingQrSvg bookingCode={booking.code} label={`Mã QR vé ${booking.code}`} />
              </div>

              <div className="summary-line">
                <span>Ghế đã chọn</span>
                <strong className="tabular-nums">
                  {booking.seats.map((seat) => seat.code).join(', ')}
                </strong>
              </div>
              <div className="summary-total-row">
                <span>Tổng đã thanh toán</span>
                <span className="summary-total-amount tabular-nums">
                  {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: booking.currencyCode }).format(bookingPayTotal(booking))}
                </span>
              </div>

              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <Link to={`/tickets/${booking.code}`} className="btn btn-primary">
                  Xem chi tiết vé
                </Link>
                <Link to="/tickets" className="btn btn-outline">
                  Tất cả vé của tôi
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (outcome.kind === 'pending') {
    return (
      <main ref={bindPage} className="section">
        <div className="container">
          <div className="ticket-confirmation-card" ref={bindCountdown}>
            <div
              className="ticket-confirm-banner"
              style={{ backgroundColor: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}
            >
              <Clock size={28} aria-hidden="true" />
              <div>
                <h1 style={{ fontSize: '1.375rem', marginBottom: '2px' }}>
                  Thanh toán chưa hoàn tất
                </h1>
                <p style={{ fontSize: '0.875rem' }}>
                  {booking.code} · {BOOKING_STATUS_LABELS[booking.status] ?? booking.status}
                </p>
              </div>
            </div>
            <div className="ticket-confirm-body">
              <p style={{ marginBottom: '14px' }}>
                Không nhận được xác nhận thanh toán từ VNPAY cho đặt vé này.
              </p>
              {remainingSeconds !== null && (
                <div className="summary-line">
                  <span>Thời gian giữ ghế còn lại</span>
                  <strong className="tabular-nums">
                    {formatHoldRemaining(remainingSeconds)} (đến {bookingHoldDeadlineLabel(booking.expiresAt)})
                  </strong>
                </div>
              )}
              <p style={{ marginBottom: '16px' }}>
                Bạn có thể thử thanh toán lại trong thời gian giữ ghế, hoặc để ghế tự giải phóng khi
                hết hạn.
              </p>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <Link to="/tickets" className="btn btn-primary">
                  Vé của tôi
                </Link>
                <Link to="/" className="btn btn-outline">
                  <Home size={16} aria-hidden="true" />
                  <span>Về trang chủ</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main ref={bindPage} className="section">
      <div className="container">
        <div className="ticket-confirmation-card">
          <div
            className="ticket-confirm-banner"
            style={{ backgroundColor: 'var(--color-bg-light)', color: 'var(--color-text-secondary)' }}
          >
            <XCircle size={28} aria-hidden="true" />
            <div>
              <h1 style={{ fontSize: '1.375rem', marginBottom: '2px' }}>
                Thanh toán không thành công
              </h1>
              <p style={{ fontSize: '0.875rem' }}>
                {booking.code} · {BOOKING_STATUS_LABELS[booking.status] ?? booking.status}
              </p>
            </div>
          </div>
          <div className="ticket-confirm-body">
            <p style={{ marginBottom: '16px' }}>
              Giao dịch không được xác nhận thành công. Ghế sẽ được giải phóng nếu quá thời gian giữ.
            </p>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link to="/movies" className="btn btn-primary">
                <Ticket size={16} aria-hidden="true" />
                <span>Đặt vé lại</span>
              </Link>
              <Link to="/tickets" className="btn btn-outline">
                Vé của tôi
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
