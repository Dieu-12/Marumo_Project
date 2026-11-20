import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Ticket } from 'lucide-react';
import { CINEMAS, DATES, MOVIES, SHOWTIMES, formatLabels } from '../data/cinemaData.js';
import { useApp } from '../context/AppContext.jsx';
import './QuickTicketBar.css';

export default function QuickTicketBar() {
  const { preferredCinemaId } = useApp();
  const navigate = useNavigate();
  const [bookingOpen, setBookingOpen] = useState(false);

  const nowShowingMovies = useMemo(
    () => MOVIES.filter((movie) => movie.status === 'now-showing'),
    []
  );

  const [movieId, setMovieId] = useState(nowShowingMovies[0]?.id || '');
  const [cinemaId, setCinemaId] = useState(preferredCinemaId || CINEMAS[0].id);
  const [dateId, setDateId] = useState(DATES[0].id);
  const [selectedShowtimeId, setSelectedShowtimeId] = useState('');

  useEffect(() => {
    if (preferredCinemaId) setCinemaId(preferredCinemaId);
  }, [preferredCinemaId]);

  const availableShowtimes = useMemo(
    () =>
      SHOWTIMES.filter(
        (showtime) =>
          showtime.movieId === movieId &&
          showtime.cinemaId === cinemaId &&
          showtime.dateId === dateId
      ),
    [movieId, cinemaId, dateId]
  );

  const effectiveShowtimeId =
    availableShowtimes.find((showtime) => showtime.id === selectedShowtimeId)?.id ||
    availableShowtimes[0]?.id ||
    '';

  const handleQuickBuy = (event) => {
    event.preventDefault();
    if (!movieId || !effectiveShowtimeId) return;
    const params = new URLSearchParams({ cinema: cinemaId, date: dateId, showtime: effectiveShowtimeId });
    navigate(`/booking/${movieId}?${params.toString()}`);
  };

  return (
    <section className={`container quick-ticket-wrap ${bookingOpen ? 'is-open' : 'is-collapsed'}`} aria-label="Đặt vé nhanh">
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
              value={movieId}
              onChange={(event) => {
                setMovieId(event.target.value);
                setSelectedShowtimeId('');
              }}
            >
              {nowShowingMovies.map((movie) => (
                <option key={movie.id} value={movie.id}>{movie.title}</option>
              ))}
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
              value={cinemaId}
              onChange={(event) => {
                setCinemaId(event.target.value);
                setSelectedShowtimeId('');
              }}
            >
              {CINEMAS.map((cinema) => (
                <option key={cinema.id} value={cinema.id}>
                  {cinema.name} · {cinema.cityLabel || cinema.city}
                </option>
              ))}
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
              value={dateId}
              onChange={(event) => {
                setDateId(event.target.value);
                setSelectedShowtimeId('');
              }}
            >
              {DATES.map((date) => (
                <option key={date.id} value={date.id}>{date.fullLabel}</option>
              ))}
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
              value={effectiveShowtimeId}
              onChange={(event) => setSelectedShowtimeId(event.target.value)}
              disabled={availableShowtimes.length === 0}
            >
              {availableShowtimes.length === 0 ? (
                <option value="">Chưa có suất chiếu</option>
              ) : (
                availableShowtimes.map((showtime) => (
                  <option key={showtime.id} value={showtime.id}>
                    {showtime.time} — {formatLabels?.[showtime.format] || showtime.format}
                  </option>
                ))
              )}
            </select>
          </div>

          <button
            type="submit"
            className="btn btn-primary quick-ticket-btn"
            data-testid="quick-ticket-submit"
            disabled={!effectiveShowtimeId}
          >
            <Ticket size={17} aria-hidden="true" />
            <span>Xem chỗ ngồi</span>
          </button>
        </div>
      </form>
    </section>
  );
}
