import { useCallback, useState, useSyncExternalStore } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  MapPin,
  Printer,
  Ticket,
  XCircle,
} from 'lucide-react';
import {
  BOOKING_STATUS_LABELS,
  bookingHoldDeadlineLabel,
  bookingPayTotal,
  bookingShowtimeLabels,
  PAYMENT_METHOD_LABELS,
} from '../utils/bookingApi.js';
import { bookingStore } from '../utils/bookingStore.js';
import { formatCurrency } from '../utils/bookingLogic.js';
import BookingQrSvg from '../components/BookingQrSvg.jsx';
import './TicketsPage.css';

const DEFAULT_POSTER = '/src/assets/images/poster_solar_odyssey_1794993128134.jpg';

const BANNER_VIEW = {
  CONFIRMED: {
    tone: 'confirmed',
    icon: CheckCircle2,
    label: 'Đã xác nhận — Xuất trình mã QR khi vào rạp',
  },
  PENDING_PAYMENT: {
    tone: 'pending',
    icon: Clock,
    label: 'Chờ thanh toán — Ghế đang được giữ',
  },
  EXPIRED: {
    tone: 'cancelled',
    icon: XCircle,
    label: 'Đặt vé đã hết thời gian giữ ghế',
  },
  CANCELLED: {
    tone: 'cancelled',
    icon: XCircle,
    label: 'Vé đã hủy',
  },
};

const CREATED_AT_FORMATTER = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

function seatTypeLabel(seat) {
  if (seat.typeName) return seat.typeName;
  if (seat.typeCode === 'PREMIUM') return 'Ghế VIP';
  if (seat.typeCode === 'COUPLE') return 'Ghế đôi';
  return 'Ghế thường';
}

export default function TicketDetailPage() {
  const { bookingId } = useParams();
  const [copied, setCopied] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelNotice, setCancelNotice] = useState('');

  const snapshot = useSyncExternalStore(
    bookingStore.subscribe,
    bookingStore.getSnapshot,
    bookingStore.getSnapshot
  );
  const entry = snapshot.byCode[bookingId] ?? { status: 'idle', booking: null, error: null, notFound: false };

  const bindPage = useCallback(
    (node) => {
      if (!node) return undefined;
      bookingStore.loadBookingByCode(bookingId, true);
      return undefined;
    },
    [bookingId]
  );

  const handleCopyRef = () => {
    setCopied(true);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(bookingId).catch(() => {});
    }
    window.setTimeout(() => setCopied(false), 2000);
  };

  if (entry.status === 'idle' || entry.status === 'loading') {
    return (
      <main ref={bindPage} className="section section-light">
        <div className="container catalog-state">Đang tải vé từ hệ thống…</div>
      </main>
    );
  }

  if (entry.status === 'error') {
    return (
      <main ref={bindPage} className="section section-light">
        <div className="container" style={{ textAlign: 'center', padding: '56px 16px' }}>
          <Ticket size={34} style={{ margin: '0 auto 12px', color: 'var(--color-primary)' }} aria-hidden="true" />
          <h1 style={{ marginBottom: '10px' }}>
            {entry.notFound ? 'Không tìm thấy vé' : 'Không thể tải vé'}
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '20px' }}>
            {entry.notFound
              ? `Không tìm thấy mã vé ${bookingId} trong danh sách vé của bạn.`
              : entry.error}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <Link to="/tickets" className="btn btn-primary">
              Xem tất cả vé của tôi
            </Link>
            <Link to="/movies" className="btn btn-outline">
              Khám phá phim
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const booking = entry.booking;
  const bannerView = BANNER_VIEW[booking.status] ?? BANNER_VIEW.CONFIRMED;
  const BannerIcon = bannerView.icon;
  const startLabels = bookingShowtimeLabels(booking.showtime);
  const createdAtLabel = booking.createdAt ? CREATED_AT_FORMATTER.format(new Date(booking.createdAt)) : '';
  const holdDeadline =
    booking.status === 'PENDING_PAYMENT' ? bookingHoldDeadlineLabel(booking.expiresAt) : '';

  return (
    <main>
      <section className="page-banner">
        <div className="container">
          <h1 className="page-banner-title">Chi tiết vé</h1>
          <p className="page-banner-sub tabular-nums">
            Mã vé {booking.code}
            {createdAtLabel ? ` · Ngày đặt ${createdAtLabel}` : ''}
          </p>
        </div>
      </section>

      <section className="section section-light">
        <div className="container">
          <Link to="/tickets" className="ticket-detail-breadcrumb">
            <ArrowLeft size={16} aria-hidden="true" />
            <span>Về vé của tôi</span>
          </Link>

          <div className="ticket-detail-grid">
            <article className="ticket-pass-card">
              <div className={`ticket-pass-banner ticket-pass-banner--${bannerView.tone}`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 700 }}>
                  <BannerIcon size={20} aria-hidden="true" />
                  <span>
                    {bannerView.label}
                    {holdDeadline ? ` — Giữ đến ${holdDeadline}` : ''}
                  </span>
                </div>

                <span className="ticket-ref-code">{booking.code}</span>
              </div>

              <div className="ticket-pass-body">
                <div className="ticket-pass-hero">
                  <img
                    src={booking.moviePoster || DEFAULT_POSTER}
                    alt={`Áp phích phim ${booking.movieTitle || 'MARUMO'}`}
                    className="ticket-pass-poster"
                    referrerPolicy="no-referrer"
                  />

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      {booking.ageRating && <span className={`age-mark age-mark--${booking.ageRating}`}>{booking.ageRating}</span>}
                      <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                        {booking.showtime?.formatName}
                      </span>
                    </div>

                    <h2 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>
                      {booking.movieSlug ? (
                        <Link to={`/movies/${booking.movieSlug}`}>
                          {booking.movieTitle || 'Vé MARUMO'}
                        </Link>
                      ) : (
                        booking.movieTitle || 'Vé MARUMO'
                      )}
                    </h2>

                    <p style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '4px' }}>
                      {booking.showtime?.branchName}
                    </p>
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                      <MapPin size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '4px' }} aria-hidden="true" />
                      Phòng {booking.showtime?.auditoriumName}
                    </p>
                  </div>

                  <div className="ticket-pass-qr-box">
                    <BookingQrSvg
                      bookingCode={booking.code}
                      size={108}
                      label={`Mã QR vé ${booking.code}`}
                    />
                    <button
                      type="button"
                      className="promo-copy-btn"
                      onClick={handleCopyRef}
                      aria-label={`Sao chép mã đặt vé ${booking.code}`}
                    >
                      {copied ? (
                        <>
                          <Check size={13} aria-hidden="true" />
                          <span>Đã sao chép</span>
                        </>
                      ) : (
                        <>
                          <Copy size={13} aria-hidden="true" />
                          <span>{booking.code}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="ticket-facts-grid tabular-nums">
                  <div>
                    <div className="ticket-fact-label">Ngày và giờ chiếu</div>
                    <div className="ticket-fact-value">
                      {startLabels.dateLabel}
                      {startLabels.timeLabel ? ` · ${startLabels.timeLabel}` : ''}
                    </div>
                  </div>
                  <div>
                    <div className="ticket-fact-label">Phòng chiếu</div>
                    <div className="ticket-fact-value">
                      {booking.showtime?.auditoriumName} ({booking.showtime?.formatName})
                    </div>
                  </div>
                  <div>
                    <div className="ticket-fact-label">Người nhận vé</div>
                    <div className="ticket-fact-value">{booking.customerName || '—'}</div>
                  </div>
                  <div>
                    <div className="ticket-fact-label">Email nhận vé</div>
                    <div className="ticket-fact-value">{booking.customerEmail || '—'}</div>
                  </div>
                </div>

                <div className="ticket-section-divider">
                  <h3 style={{ fontSize: '1rem', marginBottom: '12px' }}>
                    Ghế đã đặt ({booking.seats.length})
                  </h3>
                  <div className="ticket-seat-list">
                    {booking.seats.map((seat) => (
                      <div key={seat.code} className="ticket-seat-row tabular-nums">
                        <span>
                          <strong>Ghế {seat.code}</strong> · {seatTypeLabel(seat)}
                        </span>
                        <strong>{formatCurrency(seat.finalPrice)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </article>

            <aside className="ticket-sidebar-card" aria-label="Thông tin thanh toán và thao tác với vé">
              <h2 style={{ fontSize: '1.125rem' }}>Biên nhận thanh toán</h2>

              <div>
                <div className="summary-line summary-line--muted">
                  <span>Tiền vé</span>
                  <span className="tabular-nums">{formatCurrency(booking.subtotalAmount)}</span>
                </div>
                {booking.discountAmount > 0 && (
                  <div className="summary-line" style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                    <span>Giảm giá</span>
                    <span className="tabular-nums">-{formatCurrency(booking.discountAmount)}</span>
                  </div>
                )}
                <div className="summary-line summary-line--muted">
                  <span>Phương thức thanh toán</span>
                  <span>
                    {booking.paymentMethod
                      ? PAYMENT_METHOD_LABELS[booking.paymentMethod] || booking.paymentMethod
                      : booking.status === 'CONFIRMED'
                        ? '—'
                        : 'Chưa thanh toán'}
                  </span>
                </div>
                <div className="summary-total-row" style={{ marginBottom: 0 }}>
                  <span>Tổng đã thanh toán</span>
                  <span className="summary-total-amount tabular-nums">
                    {formatCurrency(bookingPayTotal(booking))}
                  </span>
                </div>
              </div>

              <div className="ticket-actions-stack">
                {booking.status === 'CONFIRMED' && (
                  <button
                    type="button"
                    className="btn btn-dark"
                    onClick={() => window.print()}
                  >
                    <Printer size={16} aria-hidden="true" />
                    <span>In vé điện tử</span>
                  </button>
                )}

                {booking.branchId && (
                  <Link to={`/cinemas/${booking.branchId}`} className="btn btn-outline">
                    <MapPin size={16} aria-hidden="true" />
                    <span>Xem thông tin rạp</span>
                  </Link>
                )}

                {booking.status !== 'CANCELLED' && !confirmingCancel && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ color: 'var(--color-primary)', borderColor: 'var(--color-primary-border)' }}
                    onClick={() => setConfirmingCancel(true)}
                  >
                    Hủy vé
                  </button>
                )}

                {confirmingCancel && booking.status !== 'CANCELLED' && (
                  <div className="cancel-confirm-box" role="alert">
                    <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                      Hủy vé {booking.code}? Thao tác này không thể hoàn tác.
                    </div>
                    <div className="cancel-confirm-actions">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                          setConfirmingCancel(false);
                          setCancelNotice(
                            'Hệ thống chưa hỗ trợ hủy vé trực tuyến. Vui lòng liên hệ rạp để được hỗ trợ.'
                          );
                        }}
                      >
                        Xác nhận hủy
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => setConfirmingCancel(false)}
                      >
                        Giữ lại vé
                      </button>
                    </div>
                    {cancelNotice && (
                      <div style={{ fontSize: '0.8125rem', marginTop: '8px' }}>{cancelNotice}</div>
                    )}
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}
