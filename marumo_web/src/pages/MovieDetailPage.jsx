import { useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Play,
  Star,
  Ticket,
} from 'lucide-react';
import { BOOKABLE_DATES, CINEMAS, DATES, formatLabels, MOVIES, SHOWTIMES } from '../data/cinemaData.js';
import { useApp } from '../context/AppContext.jsx';
import './MovieDetailPage.css';

const ALL_CITIES = 'All Cities';
const ALL_CINEMAS = 'All Cinemas';

function initialsOf(name) {
  const cleaned = name.replace(/\(.*?\)/g, '').trim();
  return cleaned
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

export default function MovieDetailPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { setTrailerMovie } = useApp();

  const movie = MOVIES.find((m) => m.slug === slug || m.id === slug);
  const [selectedDateId, setSelectedDateId] = useState(DATES[0].id);
  const [cityFilter, setCityFilter] = useState(ALL_CITIES);
  const [cinemaFilter, setCinemaFilter] = useState(ALL_CINEMAS);
  const dateStripRef = useRef(null);

  if (!movie) {
    return (
      <main className="section">
        <div className="container" style={{ textAlign: 'center', padding: '48px 0' }}>
          <h1 style={{ marginBottom: '12px' }}>Không tìm thấy phim</h1>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '20px' }}>
            Phim bạn tìm hiện chưa có trong lịch chiếu.
          </p>
          <Link to="/movies" className="btn btn-primary">
            Xem tất cả phim
          </Link>
        </div>
      </main>
    );
  }

  const isComingSoon = movie.status === 'coming-soon';
  const currentDateIndex = BOOKABLE_DATES.findIndex((date) => date.id === selectedDateId);
  const selectedDate = DATES.find((d) => d.id === selectedDateId);

  const shiftDate = (offset) => {
    const nextIndex = currentDateIndex + offset;
    const nextDate = BOOKABLE_DATES[nextIndex];
    if (!nextDate) return;
    setSelectedDateId(nextDate.id);
    dateStripRef.current?.children[nextIndex]?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  };
  const nowShowing = MOVIES.filter(
    (m) => m.status === 'now-showing' && m.id !== movie.id
  ).slice(0, 5);

  const cityCinemas =
    cityFilter === ALL_CITIES ? CINEMAS : CINEMAS.filter((c) => c.city === cityFilter);

  const scheduleRows = cityCinemas
    .filter((cinema) => cinemaFilter === ALL_CINEMAS || cinema.id === cinemaFilter)
    .map((cinema) => {
      const slots = SHOWTIMES.filter(
        (s) =>
          s.movieId === movie.id &&
          s.cinemaId === cinema.id &&
          s.dateId === selectedDateId
      );
      const groupedByFormat = slots.reduce((acc, slot) => {
        if (!acc[slot.format]) acc[slot.format] = [];
        acc[slot.format].push(slot);
        return acc;
      }, {});
      return { cinema, groupedByFormat };
    })
    .filter((row) => Object.keys(row.groupedByFormat).length > 0);

  const handleCityChange = (event) => {
    const value = event.target.value;
    setCityFilter(value);
    if (value !== ALL_CITIES) {
      const selectedCinema = CINEMAS.find((cinema) => cinema.id === cinemaFilter);
      if (!selectedCinema || selectedCinema.city !== value) {
        setCinemaFilter(ALL_CINEMAS);
      }
    }
  };

  return (
    <main className="movie-detail">
      <section className="detail-hero" aria-labelledby="movie-title">
        <div className="detail-hero-media">
          <img
            src={movie.heroImage}
            alt=""
            className="detail-hero-art"
            referrerPolicy="no-referrer"
          />
          <span className="detail-hero-scrim" aria-hidden="true" />
          <button
            type="button"
            className="detail-play-btn"
            onClick={() => setTrailerMovie(movie)}
          >
            <Play size={26} fill="currentColor" aria-hidden="true" />
            <span className="sr-only">Xem đoạn giới thiệu phim {movie.title}</span>
          </button>
        </div>

        <div className="container">
          <div className="detail-card">
            <div className="detail-poster-wrap">
              <img
                src={movie.posterImage}
                alt={`Áp phích phim ${movie.title}`}
                className="detail-poster"
                referrerPolicy="no-referrer"
              />
            </div>

            <div className="detail-info">
              <nav className="detail-breadcrumb" aria-label="Đường dẫn trang">
                <Link to="/">Trang chủ</Link>
                <span aria-hidden="true">/</span>
                <Link to="/movies">
                  {isComingSoon ? 'Phim sắp chiếu' : 'Phim đang chiếu'}
                </Link>
                <span aria-hidden="true">/</span>
                <span aria-current="page">{movie.title}</span>
              </nav>

              <div className="detail-title-row">
                <h1 id="movie-title" className="detail-title">
                  {movie.title}
                </h1>
                <span className={`age-mark age-mark--${movie.ageRating}`}>
                  {movie.ageRating}
                </span>
              </div>

              <div className="detail-meta-line tabular-nums">
                <span className="detail-meta-item">
                  <Clock size={16} aria-hidden="true" />
                  <span>{movie.duration} phút</span>
                </span>
                <span className="detail-meta-item">
                  <Calendar size={16} aria-hidden="true" />
                  <span>
                    {isComingSoon ? `Khởi chiếu ${movie.releaseLabel}` : movie.releaseLabel}
                  </span>
                </span>
                {movie.rating && (
                  <span className="detail-meta-item detail-meta-rating">
                    <Star size={16} fill="currentColor" aria-hidden="true" />
                    <span>{movie.rating.toFixed(1)} / 10</span>
                  </span>
                )}
              </div>
            </div>

            <dl className="detail-facts">
              <div className="detail-fact">
                <dt>Thể loại</dt>
                <dd className="detail-genre-chips">
                  {movie.genre.split(' / ').map((genre) => (
                    <span key={genre} className="genre-chip">
                      {genre}
                    </span>
                  ))}
                </dd>
              </div>
              <div className="detail-fact">
                <dt>Đạo diễn</dt>
                <dd>{movie.director}</dd>
              </div>
              <div className="detail-fact">
                <dt>Diễn viên</dt>
                <dd>{movie.cast.join(', ')}</dd>
              </div>
              <div className="detail-fact">
                <dt>Ngôn ngữ</dt>
                <dd>{movie.language}</dd>
              </div>
              <div className="detail-fact">
                <dt>Định dạng</dt>
                <dd>{movie.formats.map((f) => formatLabels[f] || f).join(', ')}</dd>
              </div>
            </dl>

            <div className="detail-actions">
              {!isComingSoon && (
                <button
                  type="button"
                  className="btn btn-primary btn-lg"
                  onClick={() => navigate(`/booking/${movie.id}`)}
                >
                  <Ticket size={18} aria-hidden="true" />
                  <span>Đặt vé</span>
                </button>
              )}
              <button
                type="button"
                className="btn btn-outline btn-lg"
                onClick={() => setTrailerMovie(movie)}
              >
                <Play size={18} aria-hidden="true" />
                <span>Xem đoạn giới thiệu</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="container detail-layout">
        <div className="detail-main">
          <section className="detail-section" aria-labelledby="showtimes-heading">
            <h2 id="showtimes-heading" className="detail-section-title">
              <span className="section-accent-bar" aria-hidden="true" />
              Lịch chiếu
            </h2>

            {isComingSoon ? (
              <div className="detail-empty">
                <Calendar size={28} aria-hidden="true" />
                <h3>Sắp mở lịch chiếu ({movie.releaseLabel})</h3>
                <p>
                  Vé đặt trước cho {movie.title} sẽ mở bán 5 ngày trước ngày khởi
                  chiếu.
                </p>
              </div>
            ) : (
              <>
                <div className="showtime-toolbar">
                  <div className="date-nav">
                    <button
                      type="button"
                      className="date-arrow"
                      aria-label="Chọn ngày xem trước"
                      disabled={currentDateIndex <= 0}
                      onClick={() => shiftDate(-1)}
                    >
                      <ChevronLeft size={20} aria-hidden="true" />
                    </button>

                    <div
                      className="date-strip"
                      role="group"
                      aria-label="Chọn ngày xem phim"
                      ref={dateStripRef}
                    >
                      {BOOKABLE_DATES.map((date) => (
                        <button
                          key={date.id}
                          type="button"
                          className={`date-btn ${selectedDateId === date.id ? 'is-active' : ''}`}
                          aria-pressed={selectedDateId === date.id}
                          onClick={() => setSelectedDateId(date.id)}
                        >
                          <span className="date-btn-day">{date.dayName}</span>
                          <span className="date-btn-date">{date.dateLabel}</span>
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      className="date-arrow"
                      aria-label="Chọn ngày xem sau"
                      disabled={currentDateIndex >= BOOKABLE_DATES.length - 1}
                      onClick={() => shiftDate(1)}
                    >
                      <ChevronRight size={20} aria-hidden="true" />
                    </button>
                  </div>

                  <div className="showtime-filters">
                    <div>
                      <label htmlFor="detail-city-filter" className="sr-only">
                        Lọc rạp theo thành phố
                      </label>
                      <select
                        id="detail-city-filter"
                        className="detail-filter-select"
                        value={cityFilter}
                        onChange={handleCityChange}
                      >
                        <option value={ALL_CITIES}>Tất cả thành phố</option>
                        <option value="Ho Chi Minh City">TP. Hồ Chí Minh</option>
                        <option value="Hanoi">Hà Nội</option>
                        <option value="Da Nang">Đà Nẵng</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="detail-cinema-filter" className="sr-only">
                        Lọc theo cụm rạp
                      </label>
                      <select
                        id="detail-cinema-filter"
                        className="detail-filter-select"
                        value={cinemaFilter}
                        onChange={(event) => setCinemaFilter(event.target.value)}
                      >
                        <option value={ALL_CINEMAS}>Tất cả rạp</option>
                        {cityCinemas.map((cinema) => (
                          <option key={cinema.id} value={cinema.id}>
                            {cinema.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {scheduleRows.length === 0 ? (
                  <div className="detail-empty">
                    <Calendar size={28} aria-hidden="true" />
                    <h3>Chưa có suất chiếu</h3>
                    <p>
                      {selectedDate?.fullLabel} chưa có suất chiếu phù hợp. Vui lòng
                      chọn ngày khác hoặc bỏ bộ lọc.
                    </p>
                  </div>
                ) : (
                  <div className="cinema-list">
                    {scheduleRows.map(({ cinema, groupedByFormat }) => (
                      <article key={cinema.id} className="cinema-row">
                        <div className="cinema-row-head">
                          <h3 className="cinema-row-name">{cinema.name}</h3>
                          <span className="cinema-row-address">
                            {cinema.address} · {cinema.cityLabel || cinema.city}
                          </span>
                        </div>

                        {Object.entries(groupedByFormat).map(([format, slots]) => (
                          <div key={format} className="showtime-group">
                            <span className="showtime-format">
                              {formatLabels[format] || format}
                            </span>
                            <div className="time-slots-row">
                              {slots.map((slot) => (
                                <button
                                  key={slot.id}
                                  type="button"
                                  className="time-slot-btn tabular-nums"
                                  aria-label={`Suất ${slot.time} tại ${cinema.name}, ${formatLabels[format] || format}`}
                                  onClick={() =>
                                    navigate(
                                      `/booking/${movie.id}?cinema=${cinema.id}&date=${selectedDateId}&showtime=${slot.id}`
                                    )
                                  }
                                >
                                  {slot.time}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          <section className="detail-section" aria-labelledby="synopsis-heading">
            <h2 id="synopsis-heading" className="detail-section-title">
              <span className="section-accent-bar" aria-hidden="true" />
              Nội dung phim
            </h2>
            <div className="detail-synopsis">
              <p>{movie.heroDescription}</p>
              <p>{movie.synopsis}</p>
            </div>
          </section>

          <section className="detail-section" aria-labelledby="cast-heading">
            <h2 id="cast-heading" className="detail-section-title">
              <span className="section-accent-bar" aria-hidden="true" />
              Diễn viên
            </h2>
            <ul className="cast-list">
              {movie.cast.map((name) => (
                <li key={name} className="cast-item">
                  <span className="cast-monogram" aria-hidden="true">
                    {initialsOf(name)}
                  </span>
                  <span className="cast-name">{name}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="detail-aside" aria-labelledby="now-showing-heading">
          <div className="aside-panel">
            <h2 id="now-showing-heading" className="aside-title">
              <span className="section-accent-bar" aria-hidden="true" />
              Phim đang chiếu
            </h2>

            <ul className="aside-movie-list">
              {nowShowing.map((item) => (
                <li key={item.id}>
                  <Link to={`/movies/${item.slug}`} className="aside-movie">
                    <span className="aside-movie-poster">
                      <img
                        src={item.heroImage}
                        alt=""
                        referrerPolicy="no-referrer"
                      />
                      <span className="aside-movie-badges">
                        {item.rating && (
                          <span className="aside-movie-rating tabular-nums">
                            <Star size={11} fill="currentColor" aria-hidden="true" />
                            {item.rating.toFixed(1)}
                          </span>
                        )}
                        <span className={`age-mark age-mark--${item.ageRating}`}>
                          {item.ageRating}
                        </span>
                      </span>
                    </span>
                    <span className="aside-movie-title">{item.title}</span>
                  </Link>
                </li>
              ))}
            </ul>

            <Link to="/movies" className="btn btn-outline aside-more">
              Xem tất cả phim
            </Link>
          </div>
        </aside>
      </div>
    </main>
  );
}
