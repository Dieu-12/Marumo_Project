import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Ticket } from 'lucide-react';
import { catalogStore } from '../utils/catalogStore.js';
import { buildDateStrip, listCinemas } from '../utils/catalogModel.js';
import './QuickTicketBar.css';

const BOOKABLE_STATUS = 'OPEN_FOR_BOOKING';

export default function QuickTicketBar() {
  const navigate = useNavigate();
  const [bookingOpen, setBookingOpen] = useState(false);
  const [movieChoice, setMovieChoice] = useState('');
  const [cinemaChoice, setCinemaChoice] = useState('');
  const [dateChoice, setDateChoice] = useState('');
  const [showtimeChoice, setShowtimeChoice] = useState('');

  const catalog = useSyncExternalStore(
    catalogStore.subscribe,
    catalogStore.getSnapshot,
    catalogStore.getSnapshot
  );
  const movies = useMemo(
    () => catalog.movies.filter((movie) => movie.status === 'now-showing'),
    [catalog.movies]
  );
  const movie = movies.find((item) => item.id === movieChoice) ?? movies[0] ?? null;
  const detail = movie ? catalog.details[movie.slug] : null;
  const showtimes = useMemo(
    () =>
      (detail?.showtimes ?? []).filter(
        (showtime) => showtime.status === BOOKABLE_STATUS
      ),
    [detail]
  );
  const cinemaOptions = useMemo(() => listCinemas(showtimes), [showtimes]);
  const activeCinemaId = cinemaOptions.some(
    (cinema) => cinema.cinemaId === cinemaChoice
  )
    ? cinemaChoice
    : cinemaOptions[0]?.cinemaId ?? '';
  const cinemaShowtimes = useMemo(
    () => showtimes.filter((showtime) => showtime.cinemaId === activeCinemaId),
    [showtimes, activeCinemaId]
  );
  const dateOptions = useMemo(
    () => buildDateStrip(cinemaShowtimes),
    [cinemaShowtimes]
  );
  const activeDateId = dateOptions.some((date) => date.id === dateChoice)
    ? dateChoice
    : dateOptions[0]?.id ?? '';
  const dayShowtimes = useMemo(
    () => cinemaShowtimes.filter((showtime) => showtime.dateId === activeDateId),
    [cinemaShowtimes, activeDateId]
  );
  const activeShowtime =
    dayShowtimes.find((showtime) => showtime.id === showtimeChoice) ??
    dayShowtimes[0] ??
    null;

  const bindQuickTicket = useCallback(
    (node) => {
      if (node && movie) catalogStore.loadDetail(movie.slug);
    },
    [movie?.slug]
  );

  const handleMovieChange = (value) => {
    setMovieChoice(value);
    setCinemaChoice('');
    setDateChoice('');
    setShowtimeChoice('');
  };

  const handleCinemaChange = (value) => {
    setCinemaChoice(value);
    setDateChoice('');
    setShowtimeChoice('');
  };

  const handleDateChange = (value) => {
    setDateChoice(value);
    setShowtimeChoice('');
  };

  const handleQuickBuy = (event) => {
    event.preventDefault();
    if (!movie || !activeShowtime) return;
    const params = new URLSearchParams({
      cinema: activeCinemaId,
      date: activeDateId,
      showtime: activeShowtime.id,
    });
    navigate(`/booking/${movie.id}?${params.toString()}`);
  };

  return (
    <section
      ref={bindQuickTicket}
      className={`container quick-ticket-wrap ${bookingOpen ? 'is-open' : 'is-collapsed'}`}
      aria-label="Đặt vé nhanh"
    >
      <form className="quick-ticket-bar" data-testid="quick-ticket-form" onSubmit={handleQuickBuy} aria-label="Đặt vé nhanh">
        <button
          type="button"
          className="quick-ticket-toggle"
          aria-expanded={bookingOpen}
          aria-controls="quick-ticket-fields"
          onClick={() => setBookingOpen((open) => !open)}
        >
          <span className="quick-ticket-toggle-copy">
            <strong>Đặt vé nhanh</strong>
            <span>Chọn phim, rạp, ngày và suất chiếu</span>
          </span>
          <ChevronDown size={20} aria-hidden="true" />
        </button>

        <div id="quick-ticket-fields" className="quick-ticket-fields">
          <div className="quick-ticket-field">
            <label htmlFor="quick-movie" className="quick-ticket-label">
              <span className="quick-ticket-step">1</span>
              <span>Chọn phim</span>
            </label>
            <select
              id="quick-movie"
              data-testid="quick-ticket-movie"
              className="quick-ticket-select"
              value={movie?.id ?? ''}
              onChange={(event) => handleMovieChange(event.target.value)}
            >
              {movies.length === 0 ? (
                <option value="">Đang tải phim…</option>
              ) : (
                movies.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="quick-ticket-field">
            <label htmlFor="quick-cinema" className="quick-ticket-label">
              <span className="quick-ticket-step">2</span>
              <span>Chọn rạp</span>
            </label>
            <select
              id="quick-cinema"
              data-testid="quick-ticket-cinema"
              className="quick-ticket-select"
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

          <div className="quick-ticket-field">
            <label htmlFor="quick-date" className="quick-ticket-label">
              <span className="quick-ticket-step">3</span>
              <span>Chọn ngày</span>
            </label>
            <select
              id="quick-date"
              data-testid="quick-ticket-date"
              className="quick-ticket-select"
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

          <div className="quick-ticket-field">
            <label htmlFor="quick-showtime" className="quick-ticket-label">
              <span className="quick-ticket-step">4</span>
              <span>Chọn suất chiếu</span>
            </label>
            <select
              id="quick-showtime"
              data-testid="quick-ticket-showtime"
              className="quick-ticket-select tabular-nums"
              value={activeShowtime?.id ?? ''}
              onChange={(event) => setShowtimeChoice(event.target.value)}
              disabled={dayShowtimes.length === 0}
            >
              {dayShowtimes.length === 0 ? (
                <option value="">Chưa có suất chiếu</option>
              ) : (
                dayShowtimes.map((showtime) => (
                  <option key={showtime.id} value={showtime.id}>
                    {showtime.time} — {showtime.formatLabel || showtime.format}
                  </option>
                ))
              )}
            </select>
          </div>

          <button
            type="submit"
            className="btn btn-primary quick-ticket-btn"
            data-testid="quick-ticket-submit"
            disabled={!activeShowtime}
          >
            <Ticket size={17} aria-hidden="true" />
            <span>Xem chỗ ngồi</span>
          </button>
        </div>
      </form>
    </section>
  );
}
