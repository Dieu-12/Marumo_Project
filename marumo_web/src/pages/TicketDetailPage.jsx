import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Copy,
  MapPin,
  Printer,
  Ticket,
  XCircle,
} from 'lucide-react';
import { CINEMAS, formatLabels, MOVIES } from '../data/cinemaData.js';
import { useApp } from '../context/AppContext.jsx';
import { canCancelBooking, formatCurrency } from '../utils/bookingLogic.js';
import './TicketsPage.css';

const PAYMENT_LABELS = {
  'Credit / Debit Card': 'Thẻ tín dụng / ghi nợ',
  'Digital Wallet': 'Ví điện tử',
  'MARUMO Pay': 'MARUMO Pay',
};

export default function TicketDetailPage() {
  const { bookingId } = useParams();
  const { bookings, cancelBooking } = useApp();
  const [copied, setCopied] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const booking = bookings.find((b) => b.id === bookingId);

  if (!booking) {
    return (
      <main className="section section-light">
        <div className="container" style={{ textAlign: 'center', padding: '56px 16px' }}>
          <Ticket size={34} style={{ margin: '0 auto 12px', color: 'var(--color-primary)' }} aria-hidden="true" />
          <h1 style={{ marginBottom: '10px' }}>Không tìm thấy vé</h1>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '20px' }}>
            Không tìm thấy mã vé {bookingId} trong danh sách vé của bạn.
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

  const matchedMovie =
    MOVIES.find((m) => m.id === booking.movieId || m.title === booking.movieTitle) || null;
  const matchedCinema =
    CINEMAS.find((c) => c.id === booking.cinemaId || c.name === booking.cinemaName) || null;

  const isCancelled = booking.status === 'cancelled';
  const ticketSubtotal =
    typeof booking.ticketSubtotal === 'number'
      ? booking.ticketSubtotal
      : booking.seatDetails
        ? booking.seatDetails.reduce((sum, s) => sum + Number(s.price || 0), 0)
        : booking.grandTotal;
  const comboSubtotal =
    typeof booking.comboSubtotal === 'number' ? booking.comboSubtotal : 0;
  const discount = typeof booking.discount === 'number' ? booking.discount : 0;

  const handleCopyRef = () => {
    setCopied(true);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(booking.id).catch(() => {});
    }
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main>
      <section className="page-banner">
        <div className="container">
          <h1 className="page-banner-title">Chi tiết vé</h1>
          <p className="page-banner-sub tabular-nums">
            Mã vé {booking.id} · Ngày đặt {booking.createdAt || '18/11/2026'}
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
              <div
                className={`ticket-pass-banner ${
                  isCancelled ? 'ticket-pass-banner--cancelled' : 'ticket-pass-banner--confirmed'
                }`}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 700 }}>
                  {isCancelled ? (
                    <>
                      <XCircle size={20} aria-hidden="true" />
                      <span>Vé đã hủy</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={20} aria-hidden="true" />
                      <span>Đã xác nhận — Xuất trình mã QR khi vào rạp</span>
                    </>
                  )}
                </div>

                <span className="ticket-ref-code">{booking.id}</span>
              </div>

              <div className="ticket-pass-body">
                <div className="ticket-pass-hero">
                  <img
                    src={
                      booking.moviePoster ||
                      matchedMovie?.posterImage ||
                      '/src/assets/images/poster_solar_odyssey_1794993128134.jpg'
                    }
                    alt={`Áp phích phim ${booking.movieTitle}`}
                    className="ticket-pass-poster"
                    referrerPolicy="no-referrer"
                  />

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span className={`age-mark age-mark--${booking.ageRating || matchedMovie?.ageRating || 'T13'}`}>
                        {booking.ageRating || matchedMovie?.ageRating || 'T13'}
                      </span>
                      <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                        {formatLabels[booking.format] || booking.format}
                      </span>
                    </div>

                    <h2 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>
                      {matchedMovie ? (
                        <Link to={`/movies/${matchedMovie.slug}`}>{booking.movieTitle}</Link>
                      ) : (
                        booking.movieTitle
                      )}
                    </h2>

                    <p style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '4px' }}>
                      {booking.cinemaName}
                    </p>
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                      <MapPin size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '4px' }} aria-hidden="true" />
                      {booking.cinemaAddress || matchedCinema?.address || 'Rạp chiếu phim MARUMO'}
                    </p>
                  </div>

                  <div className="ticket-pass-qr-box">
                    <svg
                      width="108"
                      height="108"
                      viewBox="0 0 104 104"
                      className="ticket-qr-svg"
                      role="img"
                      aria-label={`Mã QR vé ${booking.id}`}
                    >
                      <rect x="6" y="6" width="26" height="26" fill="var(--color-text-primary)" />
                      <rect x="12" y="12" width="14" height="14" fill="var(--color-white)" />
                      <rect x="16" y="16" width="6" height="6" fill="var(--color-primary)" />
                      <rect x="72" y="6" width="26" height="26" fill="var(--color-text-primary)" />
                      <rect x="78" y="12" width="14" height="14" fill="var(--color-white)" />
                      <rect x="82" y="16" width="6" height="6" fill="var(--color-text-primary)" />
                      <rect x="6" y="72" width="26" height="26" fill="var(--color-text-primary)" />
                      <rect x="12" y="78" width="14" height="14" fill="var(--color-white)" />
                      <rect x="16" y="82" width="6" height="6" fill="var(--color-text-primary)" />
                      <rect x="42" y="10" width="8" height="8" fill="var(--color-text-primary)" />
                      <rect x="54" y="18" width="8" height="12" fill="var(--color-text-primary)" />
                      <rect x="40" y="38" width="24" height="24" fill={isCancelled ? 'var(--color-text-muted)' : 'var(--color-primary)'} />
                      <rect x="46" y="44" width="12" height="12" fill="var(--color-white)" />
                      <rect x="10" y="44" width="18" height="8" fill="var(--color-text-primary)" />
                      <rect x="74" y="42" width="20" height="10" fill="var(--color-text-primary)" />
                      <rect x="44" y="74" width="12" height="20" fill="var(--color-text-primary)" />
                      <rect x="66" y="70" width="26" height="10" fill="var(--color-text-primary)" />
                      <rect x="74" y="86" width="18" height="10" fill="var(--color-text-primary)" />
                    </svg>
                    <button
                      type="button"
                      className="promo-copy-btn"
                      onClick={handleCopyRef}
                      aria-label={`Sao chép mã đặt vé ${booking.id}`}
                    >
                      {copied ? (
                        <>
                          <Check size={13} aria-hidden="true" />
                          <span>Đã sao chép</span>
                        </>
                      ) : (
                        <>
                          <Copy size={13} aria-hidden="true" />
                          <span>{booking.id}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="ticket-facts-grid tabular-nums">
                  <div>
                    <div className="ticket-fact-label">Ngày và giờ chiếu</div>
                    <div className="ticket-fact-value">
                      {booking.dateLabel} · {booking.time}
                    </div>
                  </div>
                  <div>
                    <div className="ticket-fact-label">Phòng chiếu</div>
                    <div className="ticket-fact-value">
                      {booking.hall} ({formatLabels[booking.format] || booking.format})
                    </div>
                  </div>
                  <div>
                    <div className="ticket-fact-label">Người nhận vé</div>
                    <div className="ticket-fact-value">{booking.customerName}</div>
                  </div>
                  <div>
                    <div className="ticket-fact-label">Email nhận vé</div>
                    <div className="ticket-fact-value">{booking.customerEmail}</div>
                  </div>
                </div>

                <div className="ticket-section-divider">
                  <h3 style={{ fontSize: '1rem', marginBottom: '12px' }}>
                    Ghế đã đặt ({booking.seats.length})
                  </h3>
                  <div className="ticket-seat-list">
                    {booking.seatDetails && booking.seatDetails.length > 0 ? (
                      booking.seatDetails.map((seat) => (
                        <div key={seat.id} className="ticket-seat-row tabular-nums">
                          <span>
                            <strong>Ghế {seat.id}</strong> ·{' '}
                            {seat.type === 'vip'
                              ? 'VIP trung tâm'
                              : seat.type === 'couple'
                                ? 'Ghế đôi'
                                : 'Ghế thường'}
                          </span>
                          <strong>{formatCurrency(seat.price)}</strong>
                        </div>
                      ))
                    ) : (
                      <div className="ticket-seat-row tabular-nums">
                        <span>
                          <strong>Ghế {booking.seats.join(', ')}</strong>
                        </span>
                        <strong>{formatCurrency(ticketSubtotal)}</strong>
                      </div>
                    )}
                  </div>
                </div>

                {booking.combos && booking.combos.length > 0 && (
                  <div className="ticket-section-divider">
                    <h3 style={{ fontSize: '1rem', marginBottom: '12px' }}>
                      Bắp, nước và đồ ăn nhẹ
                    </h3>
                    <div className="ticket-seat-list">
                      {booking.combos.map((combo) => (
                        <div key={combo.name} className="ticket-seat-row tabular-nums">
                          <span>
                            <strong>{combo.qty}x</strong> {combo.name}
                          </span>
                          <span>
                            {combo.price
                              ? formatCurrency(combo.price * combo.qty)
                              : 'Đã bao gồm'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </article>

            <aside className="ticket-sidebar-card" aria-label="Thông tin thanh toán và thao tác với vé">
              <h2 style={{ fontSize: '1.125rem' }}>Biên nhận thanh toán</h2>

              <div>
                <div className="summary-line summary-line--muted">
                  <span>Tiền vé</span>
                  <span className="tabular-nums">{formatCurrency(ticketSubtotal)}</span>
                </div>
                <div className="summary-line summary-line--muted">
                  <span>Bắp và nước</span>
                  <span className="tabular-nums">{formatCurrency(comboSubtotal)}</span>
                </div>
                {discount > 0 && (
                  <div className="summary-line" style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                    <span>Giảm giá {booking.promoCode ? `(${booking.promoCode})` : ''}</span>
                    <span className="tabular-nums">-{formatCurrency(discount)}</span>
                  </div>
                )}
                <div className="summary-line summary-line--muted">
                  <span>Phương thức thanh toán</span>
                  <span>{PAYMENT_LABELS[booking.paymentMethod] || booking.paymentMethod}</span>
                </div>
                <div className="summary-total-row" style={{ marginBottom: 0 }}>
                  <span>Tổng đã thanh toán</span>
                  <span className="summary-total-amount tabular-nums">
                    {formatCurrency(booking.grandTotal)}
                  </span>
                </div>
              </div>

              <div className="ticket-actions-stack">
                <button
                  type="button"
                  className="btn btn-dark"
                  onClick={() => window.print()}
                >
                  <Printer size={16} aria-hidden="true" />
                  <span>In vé điện tử</span>
                </button>

                {matchedCinema && (
                  <Link
                    to={`/cinemas?branch=${matchedCinema.id}`}
                    className="btn btn-outline"
                  >
                    <MapPin size={16} aria-hidden="true" />
                    <span>Xem thông tin rạp</span>
                  </Link>
                )}

                {canCancelBooking(booking) && !confirmingCancel && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ color: 'var(--color-primary)', borderColor: 'var(--color-primary-border)' }}
                    onClick={() => setConfirmingCancel(true)}
                  >
                    Hủy vé
                  </button>
                )}

                {confirmingCancel && canCancelBooking(booking) && (
                  <div className="cancel-confirm-box" role="alert">
                    <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                      Hủy vé {booking.id}? Thao tác này không thể hoàn tác.
                    </div>
                    <div className="cancel-confirm-actions">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                          cancelBooking(booking.id);
                          setConfirmingCancel(false);
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
