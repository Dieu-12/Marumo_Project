import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Minus, Plus, Ticket, X } from 'lucide-react';
import {
  BOOKABLE_DATES,
  CINEMAS,
  CONCESSIONS,
  DATES,
  formatLabels,
  MOVIES,
  SHOWTIMES,
} from '../data/cinemaData.js';
import {
  calculateBookingTotals,
  formatCurrency,
  generateSeatMap,
  validateBookingForm,
  validateSeatSelection,
} from '../utils/bookingLogic.js';
import { useApp } from '../context/AppContext.jsx';
import SeatMap from '../components/SeatMap.jsx';
import './BookingPage.css';

const PAYMENT_OPTIONS = ['Credit / Debit Card', 'Digital Wallet', 'MARUMO Pay'];
const PAYMENT_LABELS = {
  'Credit / Debit Card': 'Thẻ tín dụng / ghi nợ',
  'Digital Wallet': 'Ví điện tử',
  'MARUMO Pay': 'MARUMO Pay',
};

const BOOKING_STEPS = [
  'Chọn phim / Rạp / Suất',
  'Chọn ghế',
  'Chọn thức ăn',
  'Thanh toán',
];
const HOLD_SECONDS = 7 * 60;
const MAX_SEATS = 8;

const isBookableDate = (dateId) => BOOKABLE_DATES.some((date) => date.id === dateId);

function formatHoldTime(totalSeconds) {
  const seconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function scrollToTop() {
  window.scrollTo({
    top: 0,
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  });
}

export default function BookingPage() {
  const { movieId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { preferredCinemaId, user, addBooking } = useApp();

  const movie =
    MOVIES.find((m) => m.id === movieId && m.status === 'now-showing') ||
    MOVIES.find((m) => m.status === 'now-showing');

  const initialShowtimeParam = searchParams.get('showtime');
  const initialShowtimeObj = SHOWTIMES.find((s) => s.id === initialShowtimeParam);
  const initialDateId =
    initialShowtimeObj?.dateId || searchParams.get('date') || DATES[0].id;

  const [step, setStep] = useState(0);
  const [cinemaId, setCinemaId] = useState(
    initialShowtimeObj?.cinemaId || searchParams.get('cinema') || preferredCinemaId || CINEMAS[0].id
  );
  const [dateId, setDateId] = useState(
    isBookableDate(initialDateId) ? initialDateId : BOOKABLE_DATES[0].id
  );
  const [selectedShowtimeId, setSelectedShowtimeId] = useState(
    initialShowtimeObj?.id || ''
  );

  const [selectedSeats, setSelectedSeats] = useState([]);
  const [selectedCombos, setSelectedCombos] = useState({});
  const [seatError, setSeatError] = useState('');

  const [holdStarted, setHoldStarted] = useState(false);
  const [holdSeconds, setHoldSeconds] = useState(HOLD_SECONDS);
  const [holdNotice, setHoldNotice] = useState('');

  const [promoInput, setPromoInput] = useState('');
  const [appliedPromoCode, setAppliedPromoCode] = useState('');
  const [customerName, setCustomerName] = useState(user?.name || '');
  const [customerEmail, setCustomerEmail] = useState(user?.email || '');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_OPTIONS[0]);
  const [formErrors, setFormErrors] = useState({});
  const [confirmedBooking, setConfirmedBooking] = useState(null);

  const matchingShowtimes = useMemo(
    () =>
      SHOWTIMES.filter(
        (s) => s.movieId === movie.id && s.cinemaId === cinemaId && s.dateId === dateId
      ),
    [movie.id, cinemaId, dateId]
  );

  const activeShowtime =
    matchingShowtimes.find((s) => s.id === selectedShowtimeId) ||
    matchingShowtimes[0] ||
    null;

  const seatRows = useMemo(
    () =>
      activeShowtime
        ? generateSeatMap(activeShowtime.id, activeShowtime.basePrice)
        : [],
    [activeShowtime]
  );

  const activeCinema = CINEMAS.find((c) => c.id === cinemaId) || CINEMAS[0];
  const activeDate = DATES.find((d) => d.id === dateId) || DATES[0];

  useEffect(() => {
    if (!holdStarted) return undefined;

    const expiry = window.setTimeout(() => {
      setSelectedSeats([]);
      setSelectedCombos({});
      setSeatError('');
      setStep(0);
      setHoldStarted(false);
      setHoldSeconds(HOLD_SECONDS);
      setHoldNotice(
        'Đã hết 7 phút giữ ghế. Vui lòng chọn lại suất chiếu và ghế.'
      );
    }, HOLD_SECONDS * 1000);

    const tick = window.setInterval(() => {
      setHoldSeconds((value) => Math.max(0, value - 1));
    }, 1000);

    return () => {
      window.clearTimeout(expiry);
      window.clearInterval(tick);
    };
  }, [holdStarted]);

  const resetSelection = () => {
    setSelectedSeats([]);
    setSelectedCombos({});
    setSeatError('');
    setHoldStarted(false);
    setHoldSeconds(HOLD_SECONDS);
    setHoldNotice('');
  };

  const handleCinemaChange = (value) => {
    setCinemaId(value);
    setSelectedShowtimeId('');
    resetSelection();
  };

  const handleDateChange = (value) => {
    setDateId(value);
    setSelectedShowtimeId('');
    resetSelection();
  };

  const handleShowtimeSelect = (showtimeId) => {
    setSelectedShowtimeId(showtimeId);
    resetSelection();
  };

  const handleShowtimeContinue = () => {
    if (!activeShowtime) {
      setSeatError('Vui lòng chọn suất chiếu trước khi chọn ghế.');
      return;
    }
    setSeatError('');
    setHoldNotice('');
    setHoldSeconds(HOLD_SECONDS);
    setHoldStarted(false);
    setStep(1);
    scrollToTop();
  };

  const handleSeatContinue = () => {
    const selectionError = validateSeatSelection(seatRows, selectedSeats.map((seat) => seat.id));
    if (selectionError) {
      setSeatError(selectionError);
      return;
    }

    setSeatError('');
    if (!holdStarted) {
      setHoldSeconds(HOLD_SECONDS);
      setHoldStarted(true);
    }
    setStep(2);
    scrollToTop();
  };

  const handleFoodContinue = () => {
    setStep(3);
    scrollToTop();
  };

  const handleBack = () => {
    if (step === 3) {
      setStep(2);
      return;
    }
    if (step === 2) {
      setStep(1);
      return;
    }
    if (step === 1) {
      setSelectedSeats([]);
      setSelectedCombos({});
      setSeatError('');
      setHoldStarted(false);
      setHoldSeconds(HOLD_SECONDS);
      setHoldNotice('Đã quay lại chọn suất chiếu. Ghế vừa chọn đã được giải phóng.');
      setStep(0);
    }
  };

  const handleCancelTransaction = () => {
    setHoldStarted(false);
    navigate(`/movies/${movie.slug}`);
  };

  const handleToggleSeat = (seat) => {
    setSeatError('');
    const exists = selectedSeats.some((s) => s.id === seat.id);

    if (!exists && selectedSeats.length >= MAX_SEATS) {
      setSeatError(`Bạn chỉ có thể chọn tối đa ${MAX_SEATS} ghế cho mỗi lần đặt vé.`);
      return;
    }

    setSelectedSeats((prev) => {
      if (exists) return prev.filter((s) => s.id !== seat.id);
      if (prev.length >= MAX_SEATS) return prev;
      return [...prev, seat];
    });
  };

  const handleComboDelta = (comboId, delta) => {
    setSelectedCombos((prev) => {
      const nextQty = Math.max(0, Math.min(6, (prev[comboId] || 0) + delta));
      return { ...prev, [comboId]: nextQty };
    });
  };

  const totals = useMemo(
    () =>
      calculateBookingTotals({
        selectedSeats,
        selectedCombos,
        concessionsCatalog: CONCESSIONS,
        promoCode: appliedPromoCode,
      }),
    [selectedSeats, selectedCombos, appliedPromoCode]
  );

  const handleApplyPromo = () => {
    setAppliedPromoCode(promoInput.trim().toUpperCase());
  };

  const handleConfirmBooking = (event) => {
    event.preventDefault();

    if (!activeShowtime) {
      setSeatError('Vui lòng chọn suất chiếu hợp lệ.');
      setStep(0);
      return;
    }

    if (selectedSeats.length === 0) {
      setSeatError('Vui lòng chọn ít nhất một ghế trên sơ đồ phòng chiếu.');
      setStep(1);
      return;
    }

    const validation = validateBookingForm({
      name: customerName,
      email: customerEmail,
      phone: customerPhone,
    });

    if (!validation.isValid) {
      setFormErrors(validation.errors);
      return;
    }

    setFormErrors({});

    const bookingCode = `MRM-${Math.floor(100000 + Math.random() * 900000)}`;
    const record = {
      id: bookingCode,
      status: 'confirmed',
      movieId: movie.id,
      movieSlug: movie.slug,
      movieTitle: movie.title,
      moviePoster: movie.posterImage,
      ageRating: movie.ageRating,
      cinemaId: activeCinema.id,
      cinemaName: activeCinema.name,
      cinemaAddress: activeCinema.address,
      dateLabel: activeDate.fullLabel,
      time: activeShowtime.time,
      format: activeShowtime.format,
      hall: activeShowtime.hall,
      seats: selectedSeats.map((s) => s.id),
      seatDetails: selectedSeats.map((s) => ({
        id: s.id,
        type: s.type,
        price: s.price,
      })),
      combos: CONCESSIONS.filter((c) => (selectedCombos[c.id] || 0) > 0).map((c) => ({
        name: c.name,
        qty: selectedCombos[c.id],
        price: c.price,
      })),
      ticketSubtotal: totals.ticketSubtotal,
      comboSubtotal: totals.comboSubtotal,
      discount: totals.discount,
      promoCode: totals.promoResult.valid ? totals.promoResult.code : '',
      grandTotal: totals.grandTotal,
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim(),
      customerPhone: customerPhone.trim(),
      paymentMethod,
      createdAt: new Date().toLocaleDateString('vi-VN'),
    };

    setHoldStarted(false);
    addBooking(record);
    setConfirmedBooking(record);
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  };

  if (confirmedBooking) {
    return (
      <main className="section">
        <div className="container">
          <div className="ticket-confirmation-card">
            <div className="ticket-confirm-banner">
              <CheckCircle2 size={28} aria-hidden="true" />
              <div>
                <h1 style={{ fontSize: '1.375rem', marginBottom: '2px' }}>
                  Đặt vé thành công
                </h1>
                <p style={{ fontSize: '0.875rem' }}>
                  Email nhận vé: {confirmedBooking.customerEmail}
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
                    {confirmedBooking.id}
                  </div>
                  <h2 style={{ fontSize: '1.5rem', marginBottom: '6px' }}>
                    {confirmedBooking.movieTitle}
                  </h2>
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9375rem' }}>
                    {confirmedBooking.cinemaName} · {confirmedBooking.hall}
                  </p>
                  <p className="tabular-nums" style={{ fontWeight: 600, marginTop: '4px' }}>
                    {confirmedBooking.dateLabel} lúc {confirmedBooking.time} (
                    {formatLabels[confirmedBooking.format] || confirmedBooking.format})
                  </p>
                </div>

                <svg
                  width="104"
                  height="104"
                  viewBox="0 0 104 104"
                  role="img"
                  aria-label={`Mã QR vé ${confirmedBooking.id}`}
                  style={{ border: '1px solid var(--color-border)', borderRadius: '8px', padding: '6px', background: 'var(--color-white)' }}
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
                  <rect x="40" y="38" width="24" height="24" fill="var(--color-primary)" />
                  <rect x="46" y="44" width="12" height="12" fill="var(--color-white)" />
                  <rect x="10" y="44" width="18" height="8" fill="var(--color-text-primary)" />
                  <rect x="74" y="42" width="20" height="10" fill="var(--color-text-primary)" />
                  <rect x="44" y="74" width="12" height="20" fill="var(--color-text-primary)" />
                  <rect x="66" y="70" width="26" height="10" fill="var(--color-text-primary)" />
                  <rect x="74" y="86" width="18" height="10" fill="var(--color-text-primary)" />
                </svg>
              </div>

              <div className="summary-line">
                <span>Ghế đã chọn</span>
                <strong className="tabular-nums">{confirmedBooking.seats.join(', ')}</strong>
              </div>
              {confirmedBooking.combos.length > 0 && (
                <div className="summary-line">
                  <span>Bắp và nước</span>
                  <span>
                    {confirmedBooking.combos.map((c) => `${c.qty}x ${c.name}`).join(', ')}
                  </span>
                </div>
              )}
              <div className="summary-line">
                <span>Phương thức thanh toán</span>
                <span>
                  {PAYMENT_LABELS[confirmedBooking.paymentMethod] || confirmedBooking.paymentMethod}
                </span>
              </div>
              <div className="summary-total-row">
                <span>Tổng đã thanh toán</span>
                <span className="summary-total-amount tabular-nums">
                  {formatCurrency(confirmedBooking.grandTotal)}
                </span>
              </div>

              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <Link to={`/tickets/${confirmedBooking.id}`} className="btn btn-primary">
                  Xem chi tiết vé
                </Link>
                <Link to="/tickets" className="btn btn-outline">
                  Tất cả vé của tôi
                </Link>
                <Link to="/movies" className="btn btn-outline">
                  Đặt phim khác
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main>
      <section className="booking-page-header">
        <div className="container booking-header-row">
          <div>
            <h1 className="booking-movie-title">{movie.title}</h1>
            <p className="booking-movie-sub tabular-nums">
              {movie.genre} · {movie.duration} phút · Phân loại {movie.ageRating}
            </p>
          </div>

          <button
            type="button"
            className="booking-cancel-btn"
            onClick={handleCancelTransaction}
          >
            <span>Hủy giao dịch</span>
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <nav className="booking-stepper" aria-label="Các bước đặt vé">
            {BOOKING_STEPS.map((label, index) => (
              <span
                key={label}
                className={`booking-step ${step === index ? 'is-active' : ''} ${step > index ? 'is-done' : ''}`}
                aria-current={step === index ? 'step' : undefined}
              >
                <span className="booking-step-index" aria-hidden="true">
                  {index + 1}
                </span>
                <span>{label}</span>
              </span>
            ))}
          </nav>

          <div className="booking-layout">
            <div className="booking-main-col">
              {holdNotice && (
                <div className="booking-notice" role="status">
                  {holdNotice}
                </div>
              )}

              {step === 0 && (
                <div className="booking-block">
                  <h2 className="booking-block-title">Chọn rạp, ngày và suất chiếu</h2>

                  <div className="booking-selectors-grid">
                    <div className="form-field">
                      <label htmlFor="booking-cinema" className="form-label">
                        Rạp chiếu
                      </label>
                      <select
                        id="booking-cinema"
                        className="form-select"
                        value={cinemaId}
                        onChange={(event) => handleCinemaChange(event.target.value)}
                      >
                        {CINEMAS.map((cinema) => (
                          <option key={cinema.id} value={cinema.id}>
                            {cinema.name} · {cinema.cityLabel || cinema.city}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-field">
                      <label htmlFor="booking-date" className="form-label">
                        Ngày xem phim
                      </label>
                      <select
                        id="booking-date"
                        className="form-select"
                        value={dateId}
                        onChange={(event) => handleDateChange(event.target.value)}
                      >
                        {BOOKABLE_DATES.map((date) => (
                          <option key={date.id} value={date.id}>
                            {date.fullLabel}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div
                    role="radiogroup"
                    aria-label="Các suất chiếu hiện có"
                    style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
                  >
                    {Object.entries(
                      matchingShowtimes.reduce((acc, slot) => {
                        if (!acc[slot.format]) acc[slot.format] = [];
                        acc[slot.format].push(slot);
                        return acc;
                      }, {})
                    ).map(([formatName, slots]) => (
                      <div key={formatName}>
                        <div
                          style={{
                            fontSize: '0.8125rem',
                            fontWeight: 700,
                            color: 'var(--color-text-secondary)',
                            marginBottom: '8px',
                          }}
                        >
                          {formatLabels[formatName] || formatName}
                        </div>
                        <div className="booking-slots-wrap">
                          {slots.map((slot) => {
                            const isActive = activeShowtime?.id === slot.id;
                            return (
                              <button
                                key={slot.id}
                                type="button"
                                role="radio"
                                aria-checked={isActive}
                                className={`booking-slot-btn ${isActive ? 'is-active' : ''}`}
                                onClick={() => handleShowtimeSelect(slot.id)}
                              >
                                <span className="booking-slot-time tabular-nums">
                                  {slot.time}
                                </span>
                                <span className="booking-slot-format">{slot.hall.split(' · ')[0]}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {step === 1 && (
                <div className="booking-seat-step">
                  <div className="booking-seat-head">
                    <div>
                      <h2 className="booking-block-title">
                        Chọn ghế {activeShowtime ? `(${activeShowtime.hall})` : ''}
                      </h2>
                      <p className="booking-step-hint">
                        Chọn tối đa {MAX_SEATS} ghế. Đồng hồ giữ ghế bắt đầu khi
                        bạn nhấn Tiếp tục.
                      </p>
                    </div>
                    <span className="booking-seat-count tabular-nums">
                      {selectedSeats.length}/{MAX_SEATS} ghế
                    </span>
                  </div>

                  {seatError && (
                    <div className="form-error" role="alert" style={{ marginBottom: '10px' }}>
                      {seatError}
                    </div>
                  )}

                  <SeatMap
                    seatRows={seatRows}
                    selectedSeatIds={selectedSeats.map((seat) => seat.id)}
                    onToggleSeat={handleToggleSeat}
                  />
                </div>
              )}

              {step === 2 && (
                <div className="booking-block">
                  <h2 className="booking-block-title">Chọn thức ăn</h2>
                  <p className="booking-step-hint">
                    Không bắt buộc — bỏ trống nếu bạn không cần.
                  </p>

                  <div className="concessions-list">
                    {CONCESSIONS.map((combo) => {
                      const qty = selectedCombos[combo.id] || 0;
                      return (
                        <div key={combo.id} className="concession-item">
                          <div className="concession-top">
                            <img
                              src={combo.image}
                              alt={combo.name}
                              className="concession-img"
                              referrerPolicy="no-referrer"
                            />
                            <div>
                              <h3 className="concession-name">{combo.name}</h3>
                              <p className="concession-desc">{combo.description}</p>
                            </div>
                          </div>

                          <div className="concession-bottom">
                            <span className="concession-price tabular-nums">
                              {formatCurrency(combo.price)}
                            </span>

                            <div className="qty-stepper">
                              <button
                                type="button"
                                className="qty-btn"
                                aria-label={`Giảm số lượng ${combo.name}`}
                                disabled={qty === 0}
                                onClick={() => handleComboDelta(combo.id, -1)}
                              >
                                <Minus size={14} aria-hidden="true" />
                              </button>
                              <span className="qty-val tabular-nums">{qty}</span>
                              <button
                                type="button"
                                className="qty-btn"
                                aria-label={`Tăng số lượng ${combo.name}`}
                                onClick={() => handleComboDelta(combo.id, 1)}
                              >
                                <Plus size={14} aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="booking-block">
                  <h2 className="booking-block-title">Thông tin thanh toán</h2>

                  <form
                    id="booking-payment-form"
                    className="payment-form"
                    onSubmit={handleConfirmBooking}
                    noValidate
                  >
                    <div className="payment-section">
                      <h3 className="booking-subtitle">Khuyến mãi</h3>
                      <label htmlFor="promo-code-input" className="form-label">
                        Mã ưu đãi (không bắt buộc)
                      </label>
                      <div className="promo-input-row">
                        <input
                          id="promo-code-input"
                          type="text"
                          className="form-input"
                          placeholder="Nhập mã ưu đãi"
                          value={promoInput}
                          onChange={(event) => setPromoInput(event.target.value)}
                        />
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={handleApplyPromo}
                        >
                          Áp dụng
                        </button>
                      </div>
                      {totals.promoResult.message && (
                        <div
                          className={`promo-feedback ${totals.promoResult.valid ? 'is-valid' : 'is-error'}`}
                        >
                          {totals.promoResult.message}
                        </div>
                      )}
                    </div>

                    <div className="payment-section">
                      <h3 className="booking-subtitle">Thông tin người nhận vé</h3>

                      <div className="form-field">
                        <label htmlFor="guest-name" className="form-label">
                          Họ và tên
                        </label>
                        <input
                          id="guest-name"
                          autoComplete="name"
                          aria-invalid={Boolean(formErrors.name)}
                          aria-describedby={formErrors.name ? 'guest-name-error' : undefined}
                          type="text"
                          className="form-input"
                          placeholder="Họ tên người nhận vé"
                          value={customerName}
                          onChange={(event) => setCustomerName(event.target.value)}
                        />
                        {formErrors.name && (
                          <span id="guest-name-error" className="form-error" role="alert">
                            {formErrors.name}
                          </span>
                        )}
                      </div>

                      <div className="form-field">
                        <label htmlFor="guest-email" className="form-label">
                          Địa chỉ email
                        </label>
                        <input
                          id="guest-email"
                          autoComplete="email"
                          aria-invalid={Boolean(formErrors.email)}
                          aria-describedby={formErrors.email ? 'guest-email-error' : undefined}
                          type="email"
                          className="form-input"
                          placeholder="ticket@example.com"
                          value={customerEmail}
                          onChange={(event) => setCustomerEmail(event.target.value)}
                        />
                        {formErrors.email && (
                          <span id="guest-email-error" className="form-error" role="alert">
                            {formErrors.email}
                          </span>
                        )}
                      </div>

                      <div className="form-field">
                        <label htmlFor="guest-phone" className="form-label">
                          Số điện thoại
                        </label>
                        <input
                          id="guest-phone"
                          autoComplete="tel"
                          aria-invalid={Boolean(formErrors.phone)}
                          aria-describedby={formErrors.phone ? 'guest-phone-error' : undefined}
                          type="tel"
                          className="form-input"
                          placeholder="+84 909 123 456"
                          value={customerPhone}
                          onChange={(event) => setCustomerPhone(event.target.value)}
                        />
                        {formErrors.phone && (
                          <span id="guest-phone-error" className="form-error" role="alert">
                            {formErrors.phone}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="payment-section">
                      <h3 className="booking-subtitle">Phương thức thanh toán</h3>
                      <div
                        className="payment-methods"
                        role="radiogroup"
                        aria-label="Phương thức thanh toán"
                      >
                        {PAYMENT_OPTIONS.map((method) => (
                          <button
                            key={method}
                            type="button"
                            role="radio"
                            aria-checked={paymentMethod === method}
                            className={`payment-option ${paymentMethod === method ? 'is-active' : ''}`}
                            onClick={() => setPaymentMethod(method)}
                          >
                            {PAYMENT_LABELS[method] || method}
                          </button>
                        ))}
                      </div>
                    </div>
                  </form>
                </div>
              )}
            </div>

            <aside className="booking-summary-card" aria-label="Tóm tắt đặt vé">
              {holdStarted && (
                <div className={`hold-timer ${holdSeconds <= 60 ? 'is-warning' : ''}`}>
                  <span>Thời gian giữ ghế</span>
                  <strong className="tabular-nums" role="timer">
                    {formatHoldTime(holdSeconds)}
                  </strong>
                </div>
              )}

              <div className="summary-movie-row">
                <img
                  src={movie.posterImage}
                  alt=""
                  className="summary-poster"
                  referrerPolicy="no-referrer"
                />
                <div>
                  <strong className="summary-movie-title">{movie.title}</strong>
                  <div className="summary-movie-meta">{activeCinema.name}</div>
                  <div className="summary-movie-time tabular-nums">
                    {activeDate.fullLabel} · {activeShowtime?.time}{' '}
                    {activeShowtime
                      ? `(${formatLabels[activeShowtime.format] || activeShowtime.format})`
                      : ''}
                  </div>
                </div>
              </div>

              <div className="summary-line">
                <span>Ghế ({selectedSeats.length})</span>
                <strong className="tabular-nums">
                  {selectedSeats.length > 0
                    ? selectedSeats.map((seat) => seat.id).join(', ')
                    : 'Chưa chọn'}
                </strong>
              </div>

              <div className="summary-line summary-line--muted">
                <span>Tiền vé</span>
                <span className="tabular-nums">{formatCurrency(totals.ticketSubtotal)}</span>
              </div>

              <div className="summary-line summary-line--muted">
                <span>Bắp và nước</span>
                <span className="tabular-nums">{formatCurrency(totals.comboSubtotal)}</span>
              </div>

              {totals.discount > 0 && (
                <div className="summary-line" style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                  <span>Giảm giá ({totals.promoResult.code})</span>
                  <span className="tabular-nums">-{formatCurrency(totals.discount)}</span>
                </div>
              )}

              <div className="summary-total-row">
                <span>Tổng cộng</span>
                <span className="summary-total-amount tabular-nums">
                  {formatCurrency(totals.grandTotal)}
                </span>
              </div>

              <div className="summary-actions">
                {step > 0 && (
                  <button type="button" className="btn btn-ghost" onClick={handleBack}>
                    Quay lại
                  </button>
                )}

                {step === 0 && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleShowtimeContinue}
                    disabled={!activeShowtime}
                  >
                    Chọn ghế
                  </button>
                )}

                {step === 1 && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleSeatContinue}
                    disabled={selectedSeats.length === 0}
                  >
                    Tiếp tục
                  </button>
                )}

                {step === 2 && (
                  <button type="button" className="btn btn-primary" onClick={handleFoodContinue}>
                    Tiếp tục
                  </button>
                )}

                {step === 3 && (
                  <button
                    type="submit"
                    form="booking-payment-form"
                    className="btn btn-primary"
                  >
                    <Ticket size={18} aria-hidden="true" />
                    <span>Thanh toán</span>
                  </button>
                )}
              </div>

              {step === 1 && selectedSeats.length === 0 && (
                <p className="summary-hint">Chọn ít nhất một ghế để tiếp tục.</p>
              )}
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}
