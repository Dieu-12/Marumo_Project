import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Ticket, X } from 'lucide-react';
import { formatLabels } from '../data/cinemaData.js';
import {
  formatCurrency,
  validateBookingForm,
  validateSeatSelection,
} from '../utils/bookingLogic.js';
import { buildDateStrip, listCinemas } from '../utils/catalogModel.js';
import { catalogStore } from '../utils/catalogStore.js';
import { seatEntryFor, seatStore, toSeatRows } from '../utils/seatStore.js';
import {
  bookingErrorMessage,
  bookingPayTotal,
  bookingShowtimeLabels,
  createBooking,
  payBooking,
  PAYMENT_METHOD_LABELS,
} from '../utils/bookingApi.js';
import { bookingStore } from '../utils/bookingStore.js';
import { loyaltyStore } from '../utils/loyaltyStore.js';
import { useApp } from '../context/AppContext.jsx';
import ConcessionsCatalog, { parseFnbCatalog } from '../components/ConcessionsCatalog.jsx';
import BookingQrSvg from '../components/BookingQrSvg.jsx';
import SeatMap from '../components/SeatMap.jsx';
import './BookingPage.css';

const PAYMENT_METHODS = [
  { id: 'VNPAY', label: 'Thanh toán qua VNPAY' },
  { id: 'POINTS', label: 'Marumo Point' },
];

const BOOKING_STEPS = [
  'Chọn phim / Rạp / Suất',
  'Chọn ghế',
  'Bắp và nước',
  'Thanh toán',
];
const HOLD_SECONDS = 7 * 60;
const MAX_SEATS = 8;
const BOOKABLE_STATUS = 'OPEN_FOR_BOOKING';
const EMPTY_SEAT_ENTRY = { status: 'idle', showtime: null, seats: [], error: null };
const FNB_LOAD_ERROR = 'Không thể tải thực đơn bắp và nước.';

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
  const { pathname, search } = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, authStatus } = useApp();

  const catalog = useSyncExternalStore(
    catalogStore.subscribe,
    catalogStore.getSnapshot,
    catalogStore.getSnapshot
  );
  const loyalty = useSyncExternalStore(
    loyaltyStore.subscribe,
    loyaltyStore.getSnapshot,
    loyaltyStore.getSnapshot
  );
  const seatSnapshot = useSyncExternalStore(
    seatStore.subscribe,
    seatStore.getSnapshot,
    seatStore.getSnapshot
  );

  const [step, setStep] = useState(0);
  const [cinemaChoice, setCinemaChoice] = useState(searchParams.get('cinema') ?? '');
  const [dateChoice, setDateChoice] = useState(searchParams.get('date') ?? '');
  const [selectedShowtimeId, setSelectedShowtimeId] = useState(
    searchParams.get('showtime') ?? ''
  );

  const [selectedSeats, setSelectedSeats] = useState([]);
  const [seatError, setSeatError] = useState('');
  const [fnbCatalog, setFnbCatalog] = useState({ status: 'idle' });
  const [fnbSelection, setFnbaSelection] = useState({});
  const fnbControllerRef = useRef(null);
  const fnbFetchedForRef = useRef('');

  const [holdStarted, setHoldStarted] = useState(false);
  const [holdSeconds, setHoldSeconds] = useState(HOLD_SECONDS);
  const [holdNotice, setHoldNotice] = useState('');

  const [promoInput, setPromoInput] = useState('');
  const [appliedPromoCode, setAppliedPromoCode] = useState('');
  const [customerName, setCustomerName] = useState(user?.name || '');
  const [customerEmail, setCustomerEmail] = useState(user?.email || '');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('VNPAY');
  const [paymentState, setPaymentState] = useState('idle');
  const [paymentError, setPaymentError] = useState('');
  const [formErrors, setFormErrors] = useState({});
  const [confirmedBooking, setConfirmedBooking] = useState(null);

  const movie =
    catalog.movies.find((item) => item.id === movieId || item.slug === movieId) ?? null;
  const detail = movie ? catalog.details[movie.slug] : null;
  const availableShowtimes = useMemo(
    () =>
      (detail?.showtimes ?? []).filter(
        (showtime) => showtime.status === BOOKABLE_STATUS
      ),
    [detail]
  );
  const cinemaOptions = useMemo(
    () => listCinemas(availableShowtimes),
    [availableShowtimes]
  );
  const paramShowtime = availableShowtimes.find(
    (showtime) => showtime.id === selectedShowtimeId
  );
  const activeCinemaId = cinemaOptions.some(
    (cinema) => cinema.cinemaId === cinemaChoice
  )
    ? cinemaChoice
    : paramShowtime?.cinemaId ?? cinemaOptions[0]?.cinemaId ?? '';
  const cinemaShowtimes = useMemo(
    () =>
      availableShowtimes.filter((showtime) => showtime.cinemaId === activeCinemaId),
    [availableShowtimes, activeCinemaId]
  );
  const dateOptions = useMemo(
    () => buildDateStrip(cinemaShowtimes),
    [cinemaShowtimes]
  );
  const activeDateId = dateOptions.some((date) => date.id === dateChoice)
    ? dateChoice
    : dateOptions.some((date) => date.id === paramShowtime?.dateId)
      ? paramShowtime.dateId
      : dateOptions[0]?.id ?? '';
  const matchingShowtimes = useMemo(
    () => cinemaShowtimes.filter((showtime) => showtime.dateId === activeDateId),
    [cinemaShowtimes, activeDateId]
  );
  const activeShowtime =
    matchingShowtimes.find((showtime) => showtime.id === selectedShowtimeId) ??
    matchingShowtimes[0] ??
    null;
  const activeCinema =
    cinemaOptions.find((cinema) => cinema.cinemaId === activeCinemaId) ?? null;
  const activeDate =
    dateOptions.find((date) => date.id === activeDateId) ?? null;
  const seatEntry = activeShowtime
    ? seatEntryFor(seatSnapshot, activeShowtime.id)
    : EMPTY_SEAT_ENTRY;
  const seatRows = useMemo(() => toSeatRows(seatEntry.seats), [seatEntry.seats]);

  const bindHoldClock = useCallback((node) => {
    if (!node) return undefined;
    if (!holdStarted) return undefined;

    const expiry = window.setTimeout(() => {
      setSelectedSeats([]);
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

  const movieSlug = movie?.slug ?? '';
  const activeShowtimeId = activeShowtime?.id ?? '';
  const fetchFnbCatalog = useCallback((showtimeId) => {
    fnbControllerRef.current?.abort();
    const controller = new AbortController();
    fnbControllerRef.current = controller;
    setFnbCatalog({ status: 'loading' });
    fetch(`/bookings/showtimes/${encodeURIComponent(showtimeId)}/fnb`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(response.status === 401
            ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
            : FNB_LOAD_ERROR);
        }
        return parseFnbCatalog(await response.json());
      })
      .then((catalog) => {
        if (!controller.signal.aborted) setFnbCatalog({ status: 'ready', catalog });
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setFnbCatalog({ status: 'error', message: error instanceof TypeError ? FNB_LOAD_ERROR : error.message });
        }
      });
  }, []);

  const bindPage = useCallback(
    (node) => {
      const cleanup = bindHoldClock(node);
      if (!node) return cleanup;
      if (movieSlug) catalogStore.loadDetail(movieSlug);
      if (activeShowtimeId) seatStore.loadSeats(activeShowtimeId);
      loyaltyStore.ensure();
      if (activeShowtimeId && fnbFetchedForRef.current !== activeShowtimeId) {
        fnbFetchedForRef.current = activeShowtimeId;
        fetchFnbCatalog(activeShowtimeId);
      }
      return cleanup;
    },
    [bindHoldClock, movieSlug, activeShowtimeId, fetchFnbCatalog]
  );

  const resetSelection = () => {
    setSelectedSeats([]);
    setSeatError('');
    setFnbaSelection({});
    setHoldStarted(false);
    setHoldSeconds(HOLD_SECONDS);
    setHoldNotice('');
  };

  const handleCinemaChange = (value) => {
    setCinemaChoice(value);
    setDateChoice('');
    setSelectedShowtimeId('');
    resetSelection();
  };

  const handleDateChange = (value) => {
    setDateChoice(value);
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
    if (seatEntry.status !== 'ready') {
      setSeatError(seatEntry.error || 'Đang tải sơ đồ ghế từ hệ thống. Vui lòng chờ.');
      return;
    }
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

  const fnbLines = useMemo(() => {
    const catalog = fnbCatalog?.status === 'ready' ? fnbCatalog.catalog : null;
    if (!catalog) return [];
    const lines = [];
    for (const item of catalog.items) {
      const quantity = Number(fnbSelection[`p:${item.id}`] ?? 0);
      if (quantity > 0) lines.push({ branchProductId: item.id, quantity, price: item.price, name: item.name });
    }
    for (const combo of catalog.combos) {
      const quantity = Number(fnbSelection[`c:${combo.id}`] ?? 0);
      if (quantity > 0) lines.push({ comboId: combo.id, quantity, price: combo.price, name: combo.name });
    }
    return lines;
  }, [fnbCatalog, fnbSelection]);
  const fnbSubtotal = fnbLines.reduce((sum, line) => sum + line.price * line.quantity, 0);

  const handleQuantityChange = (key, quantity) => {
    setFnbaSelection((prev) => {
      const next = { ...prev };
      const clamped = Math.max(0, Math.min(50, Math.round(quantity)));
      if (clamped === 0) delete next[key];
      else next[key] = clamped;
      return next;
    });
  };

  const totals = useMemo(
    () => ({
      ticketSubtotal: selectedSeats.reduce((sum, seat) => sum + Number(seat.price || 0), 0),
      fnbSubtotal,
      grandTotal: selectedSeats.reduce((sum, seat) => sum + Number(seat.price || 0), 0) + fnbSubtotal,
    }),
    [selectedSeats, fnbSubtotal]
  );

  const pointsLoaded = loyalty.status === 'ready';
  const pointsBalance = loyalty.balancePoints;
  const canPayWithPoints =
    pointsLoaded && totals.grandTotal > 0 && pointsBalance >= totals.grandTotal;

  const handleApplyPromo = () => {
    setAppliedPromoCode(promoInput.trim().toUpperCase());
  };

  const handleConfirmBooking = async (event) => {
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

    if (paymentMethod === 'POINTS' && !canPayWithPoints) {
      setPaymentError('Số dư Marumo Point không đủ cho đơn này. Vui lòng chọn Thanh toán qua VNPAY.');
      return;
    }

    setFormErrors({});
    setPaymentError('');
    setPaymentState('sending');
    setHoldStarted(false);

    const seatIds = selectedSeats.map((seat) => String(seat.showtimeSeatId));

    try {
      const booking = await createBooking({
        showtimeId: activeShowtime.id,
        seatIds,
        items: fnbLines.map(({ branchProductId, comboId, quantity }) => branchProductId
          ? { branchProductId, quantity }
          : { comboId, quantity }),
        promoCode: appliedPromoCode || undefined,
      });

      if (paymentMethod === 'VNPAY') {
        const paid = await payBooking(booking.id, 'VNPAY');
        window.location.assign(paid.paymentUrl);
        return;
      }

      const paid = await payBooking(booking.id, 'POINTS');
      setConfirmedBooking(paid.booking);
      setPaymentState('idle');
      loyaltyStore.reload();
      bookingStore.loadList(true);
      scrollToTop();
    } catch (error) {
      setPaymentState('idle');
      setPaymentError(bookingErrorMessage(error));
    }
  };

  if (authStatus === 'loading') {
    return (
      <main className="section">
        <div className="container catalog-state">Đang kiểm tra phiên đăng nhập…</div>
      </main>
    );
  }

  if (!user) {
    return <Navigate to="/dang-nhap" replace state={{ from: `${pathname}${search}` }} />;
  }

  if (catalog.moviesStatus === 'loading' || catalog.moviesStatus === 'idle') {
    return (
      <main className="section">
        <div className="container catalog-state">Đang tải thông tin phim…</div>
      </main>
    );
  }

  if (catalog.moviesStatus === 'error') {
    return (
      <main className="section">
        <div className="container catalog-state">{catalog.moviesError}</div>
      </main>
    );
  }

  if (!movie) {
    return (
      <main className="section">
        <div className="container catalog-state">
          Không tìm thấy phim cho liên kết này. <Link to="/movies">Về danh sách phim</Link>
        </div>
      </main>
    );
  }

  if (!detail || detail.status === 'loading' || detail.status === 'idle') {
    return (
      <main ref={bindPage} className="section">
        <div className="container catalog-state">Đang tải suất chiếu…</div>
      </main>
    );
  }

  if (detail.status === 'error') {
    return (
      <main ref={bindPage} className="section">
        <div className="container catalog-state">{detail.error}</div>
      </main>
    );
  }

  if (confirmedBooking) {
    const startLabels = bookingShowtimeLabels(confirmedBooking.showtime);
    return (
      <main ref={bindPage} className="section">
        <div className="container">
          <div className="ticket-confirmation-card">
            <div className="ticket-confirm-banner">
              <CheckCircle2 size={28} aria-hidden="true" />
              <div>
                <h1 style={{ fontSize: '1.375rem', marginBottom: '2px' }}>
                  Đặt vé thành công
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
                    {confirmedBooking.code}
                  </div>
                  <h2 style={{ fontSize: '1.5rem', marginBottom: '6px' }}>
                    {confirmedBooking.movieTitle || movie.title}
                  </h2>
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.9375rem' }}>
                    {confirmedBooking.showtime?.branchName || activeShowtime?.cinemaName} ·{' '}
                    {confirmedBooking.showtime?.auditoriumName || activeShowtime?.auditoriumName}
                  </p>
                  <p className="tabular-nums" style={{ fontWeight: 600, marginTop: '4px' }}>
                    {startLabels.dateLabel} lúc {startLabels.timeLabel} (
                    {confirmedBooking.showtime?.formatName ||
                      activeShowtime?.formatLabel ||
                      activeShowtime?.format}
                    )
                  </p>
                </div>

                <BookingQrSvg
                  bookingCode={confirmedBooking.code}
                  label={`Mã QR vé ${confirmedBooking.code}`}
                />
              </div>

              <div className="summary-line">
                <span>Ghế đã chọn</span>
                <strong className="tabular-nums">
                  {confirmedBooking.seats.map((seat) => seat.code).join(', ')}
                </strong>
              </div>
              {confirmedBooking.fnbOrder && confirmedBooking.fnbOrder.items.length > 0 && (
                <>
                  {confirmedBooking.fnbOrder.items.map((item, index) => (
                    <div className="summary-line summary-line--muted" key={`${item.code}-${index}`}>
                      <span>{item.name} × {item.quantity}</span>
                      <span className="tabular-nums">{formatCurrency(item.lineTotal)}</span>
                    </div>
                  ))}
                  <div className="summary-line summary-line--muted">
                    <span>Bắp nước</span>
                    <span className="tabular-nums">{formatCurrency(confirmedBooking.fnbOrder.totalAmount)}</span>
                  </div>
                </>
              )}
              <div className="summary-line">
                <span>Phương thức thanh toán</span>
                <span>{PAYMENT_METHOD_LABELS[paymentMethod] || paymentMethod}</span>
              </div>
              <div className="summary-total-row">
                <span>Tổng đã thanh toán</span>
                <span className="summary-total-amount tabular-nums">
                  {formatCurrency(bookingPayTotal(confirmedBooking))}
                </span>
              </div>

              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <Link to={`/tickets/${confirmedBooking.code}`} className="btn btn-primary">
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
    <main ref={bindPage}>
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
                        value={activeCinemaId}
                        onChange={(event) => handleCinemaChange(event.target.value)}
                      >
                        {cinemaOptions.length === 0 ? (
                          <option value="">Chưa có rạp mở bán</option>
                        ) : (
                          cinemaOptions.map((cinema) => (
                            <option key={cinema.cinemaId} value={cinema.cinemaId}>
                              {cinema.cinemaName} · {cinema.city}
                            </option>
                          ))
                        )}
                      </select>
                    </div>

                    <div className="form-field">
                      <label htmlFor="booking-date" className="form-label">
                        Ngày xem phim
                      </label>
                      <select
                        id="booking-date"
                        className="form-select"
                        value={activeDateId}
                        onChange={(event) => handleDateChange(event.target.value)}
                      >
                        {dateOptions.length === 0 ? (
                          <option value="">Chưa có ngày mở bán</option>
                        ) : (
                          dateOptions.map((date) => (
                            <option key={date.id} value={date.id}>
                              {date.fullLabel}
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                  </div>

                  {matchingShowtimes.length === 0 && (
                    <p className="booking-step-hint" style={{ marginBottom: '10px' }}>
                      Chưa có suất chiếu mở bán cho lựa chọn này.
                    </p>
                  )}
                  <div
                    role="radiogroup"
                    aria-label="Các suất chiếu hiện có"
                    style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
                  >
                    {Object.entries(
                      matchingShowtimes.reduce((acc, slot) => {
                        const key = slot.formatLabel || slot.format;
                        if (!acc[key]) acc[key] = [];
                        acc[key].push(slot);
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
                                <span className="booking-slot-format">{slot.auditoriumName || slot.formatLabel}</span>
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
                        Chọn ghế {activeShowtime ? `(${activeShowtime.auditoriumName})` : ''}
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

                  {seatEntry.status === 'ready' && seatEntry.seats.length > 0 ? (
                    <SeatMap
                      seatRows={seatRows}
                      selectedSeatIds={selectedSeats.map((seat) => seat.id)}
                      onToggleSeat={handleToggleSeat}
                    />
                  ) : (
                    <div className="catalog-state">
                      {seatEntry.status === 'error'
                        ? seatEntry.error
                        : seatEntry.status === 'ready'
                          ? 'Suất chiếu này chưa có sơ đồ ghế.'
                          : 'Đang tải sơ đồ ghế từ hệ thống…'}
                    </div>
                  )}
                </div>
              )}

              {step === 2 && activeShowtimeId && (
                <ConcessionsCatalog
                  catalogState={fnbCatalog}
                  selection={fnbSelection}
                  onQuantityChange={handleQuantityChange}
                  onRetry={() => fetchFnbCatalog(activeShowtimeId)}
                />
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
                      <p className="booking-step-hint">
                        {appliedPromoCode
                          ? `Mã ${appliedPromoCode} sẽ được hệ thống kiểm tra khi đặt vé.`
                          : 'Mã ưu đãi được hệ thống kiểm tra khi đặt vé. Giảm giá hiển thị trên thẻ thanh toán thành công.'}
                      </p>
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
                        {PAYMENT_METHODS.map((method) => {
                          const pointsUnavailable = method.id === 'POINTS' && !canPayWithPoints;
                          return (
                            <div
                              key={method.id}
                              style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}
                            >
                              <button
                                type="button"
                                role="radio"
                                aria-checked={paymentMethod === method.id}
                                className={`payment-option ${paymentMethod === method.id ? 'is-active' : ''}`}
                                disabled={pointsUnavailable}
                                onClick={() => setPaymentMethod(method.id)}
                                style={
                                  method.id === 'POINTS'
                                    ? { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', textAlign: 'left' }
                                    : undefined
                                }
                              >
                                <span>{method.label}</span>
                                {method.id === 'POINTS' && (
                                  <span className="tabular-nums" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                                    {pointsLoaded
                                      ? `${pointsBalance.toLocaleString('vi-VN')} điểm`
                                      : 'Đang tải số dư điểm…'}
                                  </span>
                                )}
                              </button>
                              {method.id === 'POINTS' && pointsLoaded && !canPayWithPoints && (
                                <p className="payment-option-note">
                                  Số dư {pointsBalance.toLocaleString('vi-VN')} điểm chưa đủ cho đơn
                                  này (cần tối thiểu {totals.grandTotal.toLocaleString('vi-VN')} điểm).
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {paymentError && (
                        <div className="form-error" role="alert" style={{ marginTop: '10px' }}>
                          {paymentError}
                        </div>
                      )}
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
                {movie.posterImage && (
                  <img
                    src={movie.posterImage}
                    alt=""
                    className="summary-poster"
                    referrerPolicy="no-referrer"
                  />
                )}
                <div>
                  <strong className="summary-movie-title">{movie.title}</strong>
                  <div className="summary-movie-meta">
                    {activeShowtime?.cinemaName || activeCinema?.cinemaName || 'Chưa chọn rạp'}
                  </div>
                  <div className="summary-movie-time tabular-nums">
                    {activeDate?.fullLabel} · {activeShowtime?.time}{' '}
                    {activeShowtime
                      ? `(${activeShowtime.formatLabel || activeShowtime.format})`
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

              {fnbSubtotal > 0 && (
                <div className="summary-line summary-line--muted">
                  <span>
                    Bắp nước (
                    {fnbLines.reduce((sum, line) => sum + line.quantity, 0)} món)
                  </span>
                  <span className="tabular-nums">{formatCurrency(fnbSubtotal)}</span>
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
                    disabled={paymentState !== 'idle'}
                  >
                    <Ticket size={18} aria-hidden="true" />
                    <span>
                      {paymentState === 'idle'
                        ? 'Thanh toán'
                        : paymentMethod === 'VNPAY'
                          ? 'Đang chuyển tới VNPAY…'
                          : 'Đang xử lý thanh toán…'}
                    </span>
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
