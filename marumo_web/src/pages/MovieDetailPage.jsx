import { useCallback, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Film,
  Play,
  Ticket,
} from 'lucide-react';
import { buildDateStrip, groupShowtimesByCinema, listCinemas, listCities } from '../utils/catalogModel.js';
import { catalogStore } from '../utils/catalogStore.js';
import { useApp } from '../context/AppContext.jsx';
import './MovieDetailPage.css';

const ALL_CITIES = 'all-cities';
const ALL_CINEMAS = 'all-cinemas';

const IDLE_DETAIL = {
  status: 'idle',
  movie: null,
  showtimes: [],
  error: null,
  notFound: false,
};

export default function MovieDetailPage() {
  const { slug } = useParams();
  const catalog = useSyncExternalStore(
    catalogStore.subscribe,
    catalogStore.getSnapshot,
    catalogStore.getSnapshot
  );
  const { setTrailerMovie } = useApp();
  const [selectedDateId, setSelectedDateId] = useState('');
  const [cityFilter, setCityFilter] = useState(ALL_CITIES);
  const [cinemaFilter, setCinemaFilter] = useState(ALL_CINEMAS);
  const dateStripRef = useRef(null);

  const bindDetail = useCallback((node) => {
    if (!node) return undefined;
    catalogStore.loadDetail(slug);
    return undefined;
  }, [slug]);

  const detail = catalog.details[slug] ?? IDLE_DETAIL;
  const movie = detail.movie;
  const showtimes = detail.showtimes;
  const dates = buildDateStrip(showtimes);
  const activeDateId = dates.some((date) => date.id === selectedDateId)
    ? selectedDateId
    : (dates[0]?.id ?? '');
  const activeDate = dates.find((date) => date.id === activeDateId) ?? null;
  const activeDateIndex = dates.findIndex((date) => date.id === activeDateId);

  const cityOptions = listCities(showtimes);
  const activeCity = cityOptions.includes(cityFilter) ? cityFilter : ALL_CITIES;
  const cinemaOptions = listCinemas(showtimes).filter(
    (cinema) => activeCity === ALL_CITIES || cinema.city === activeCity
  );
  const activeCinemaId = cinemaOptions.some((cinema) => cinema.cinemaId === cinemaFilter)
    ? cinemaFilter
    : ALL_CINEMAS;
  const scheduleRows = groupShowtimesByCinema(
    showtimes.filter(
      (showtime) =>
        showtime.dateId === activeDateId &&
        (activeCity === ALL_CITIES || showtime.city === activeCity) &&
        (activeCinemaId === ALL_CINEMAS || showtime.cinemaId === activeCinemaId)
    )
  );
  const nowShowing = catalog.movies
    .filter((item) => item.status === 'now-showing' && item.id !== movie?.id)
    .slice(0, 5);

  const shiftDate = (offset) => {
    const nextDate = dates[activeDateIndex + offset];
    if (!nextDate) return;
    setSelectedDateId(nextDate.id);
    dateStripRef.current?.children[activeDateIndex + offset]?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  };

  const handleCityChange = (event) => {
    setCityFilter(event.target.value);
    setCinemaFilter(ALL_CINEMAS);
  };

  const openTrailer = () => setTrailerMovie(movie);

  if (detail.status === 'idle' || detail.status === 'loading') {
    return (
      <main className="movie-detail" ref={bindDetail}>
        <section className="section">
          <div className="container">
            <div className="detail-empty" role="status">
              Đang tải thông tin phim...
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (detail.notFound) {
    return (
      <main className="movie-detail" ref={bindDetail}>
        <section className="section">
          <div className="container" style={{ textAlign: 'center', padding: '48px 0' }}>
            <h1 style={{ marginBottom: '12px' }}>Không tìm thấy phim</h1>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: '20px' }}>
              Phim bạn tìm hiện chưa có trong lịch chiếu.
            </p>
            <Link to="/movies" className="btn btn-primary">
              Xem tất cả phim
            </Link>
          </div>
        </section>
      </main>
    );
  }

  if (detail.status === 'error' || !movie) {
    return (
      <main className="movie-detail" ref={bindDetail}>
        <section className="section">
          <div className="container">
            <div className="detail-empty" role="alert">
              <h1 style={{ marginBottom: '8px' }}>Không thể tải phim</h1>
              <p style={{ marginBottom: '18px' }}>
                {detail.error || 'Đã xảy ra lỗi khi tải thông tin phim.'}
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => catalogStore.reloadDetail(slug)}
              >
                Thử lại
              </button>
            </div>
          </div>
        </section>
      </main>
    );
  }

  const isComingSoon = movie.status === 'coming-soon';
  const heroArt = movie.heroImage || movie.posterImage;
  const genreNames = movie.genres.map((genre) => genre.name).filter(Boolean);

  return (
    <main className="movie-detail" ref={bindDetail}>
      <section className="detail-hero" aria-labelledby="movie-title">
        <div className="detail-hero-media">
          {heroArt ? (
            <img
              src={heroArt}
              alt=""
              className="detail-hero-art"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="detail-hero-art detail-hero-art--fallback" aria-hidden="true" />
          )}
          <span className="detail-hero-scrim" aria-hidden="true" />
          <button
            type="button"
            className="detail-play-btn"
            onClick={openTrailer}
          >
            <Play size={26} fill="currentColor" aria-hidden="true" />
            <span className="sr-only">Xem đoạn giới thiệu phim {movie.title}</span>
          </button>
        </div>

        <div className="container">
          <div className="detail-card">
            <div className="detail-poster-wrap">
              {movie.posterImage ? (
                <img
                  src={movie.posterImage}
                  alt={`Áp phích phim ${movie.title}`}
                  className="detail-poster"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="detail-poster detail-poster--fallback" role="img" aria-label={`Chưa có áp phích phim ${movie.title}`}>
                  <Film size={32} aria-hidden="true" />
                  <span>{movie.title}</span>
                </div>
              )}
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
                {movie.ageRating && (
                  <span className={`age-mark age-mark--${movie.ageRating}`}>
                    {movie.ageRating}
                  </span>
                )}
              </div>

              <div className="detail-meta-line tabular-nums">
                <span className="detail-meta-item">
                  <Clock size={16} aria-hidden="true" />
                  <span>{movie.duration ? `${movie.duration} phút` : 'Thời lượng đang cập nhật'}</span>
                </span>
                <span className="detail-meta-item">
                  <Calendar size={16} aria-hidden="true" />
                  <span>
                    {movie.releaseLabel
                      ? (isComingSoon ? `Khởi chiếu ${movie.releaseLabel}` : movie.releaseLabel)
                      : 'Lịch chiếu đang cập nhật'}
                  </span>
                </span>
              </div>
            </div>

            <dl className="detail-facts">
              <div className="detail-fact">
                <dt>Thể loại</dt>
                <dd className="detail-genre-chips">
                  {genreNames.length > 0 ? genreNames.map((genre) => (
                    <span key={genre} className="genre-chip">
                      {genre}
                    </span>
                  )) : (
                    <span className="genre-chip">Đang cập nhật</span>
                  )}
                </dd>
              </div>
              {movie.originalTitle && (
                <div className="detail-fact">
                  <dt>Tên gốc</dt>
                  <dd>{movie.originalTitle}</dd>
                </div>
              )}
              <div className="detail-fact">
                <dt>Đạo diễn</dt>
                <dd>{movie.director || 'Đang cập nhật'}</dd>
              </div>
              <div className="detail-fact">
                <dt>Ngôn ngữ</dt>
                <dd>{movie.language || 'Đang cập nhật'}</dd>
              </div>
              <div className="detail-fact">
                <dt>Định dạng</dt>
                <dd>{movie.formats.length > 0 ? movie.formats.join(', ') : 'Đang cập nhật'}</dd>
              </div>
              {movie.productionYear && (
                <div className="detail-fact">
                  <dt>Năm sản xuất</dt>
                  <dd>{movie.productionYear}</dd>
                </div>
              )}
              {movie.productionCompany && (
                <div className="detail-fact">
                  <dt>Nhà sản xuất</dt>
                  <dd>{movie.productionCompany}</dd>
                </div>
              )}
            </dl>

            <div className="detail-actions">
              {!isComingSoon && (
                <button
                  type="button"
                  className="btn btn-primary btn-lg"
                  disabled
                  title="Đặt vé trực tuyến sắp mở"
                >
                  <Ticket size={18} aria-hidden="true" />
                  <span>Đặt vé sắp mở</span>
                </button>
              )}
              <button
                type="button"
                className="btn btn-outline btn-lg"
                onClick={openTrailer}
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
                <h3>Sắp mở lịch chiếu{movie.releaseLabel ? ` (${movie.releaseLabel})` : ''}</h3>
                <p>
                  Vé đặt trước cho {movie.title} sẽ mở bán trước ngày khởi chiếu.
                </p>
              </div>
            ) : dates.length === 0 ? (
              <div className="detail-empty">
                <Calendar size={28} aria-hidden="true" />
                <h3>Chưa có suất chiếu</h3>
                <p>Lịch chiếu của phim đang được cập nhật. Vui lòng quay lại sau.</p>
              </div>
            ) : (
              <>
                <div className="showtime-toolbar">
                  <div className="date-nav">
                    <button
                      type="button"
                      className="date-arrow"
                      aria-label="Chọn ngày xem trước"
                      disabled={activeDateIndex <= 0}
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
                      {dates.map((date) => (
                        <button
                          key={date.id}
                          type="button"
                          className={`date-btn ${activeDateId === date.id ? 'is-active' : ''}`}
                          aria-pressed={activeDateId === date.id}
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
                      disabled={activeDateIndex >= dates.length - 1}
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
                        value={activeCity}
                        onChange={handleCityChange}
                      >
                        <option value={ALL_CITIES}>Tất cả thành phố</option>
                        {cityOptions.map((city) => (
                          <option key={city} value={city}>
                            {city}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="detail-cinema-filter" className="sr-only">
                        Lọc theo cụm rạp
                      </label>
                      <select
                        id="detail-cinema-filter"
                        className="detail-filter-select"
                        value={activeCinemaId}
                        onChange={(event) => setCinemaFilter(event.target.value)}
                      >
                        <option value={ALL_CINEMAS}>Tất cả rạp</option>
                        {cinemaOptions.map((cinema) => (
                          <option key={cinema.cinemaId} value={cinema.cinemaId}>
                            {cinema.cinemaName}
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
                      {activeDate?.fullLabel} chưa có suất chiếu phù hợp. Vui lòng
                      chọn ngày khác hoặc bỏ bộ lọc.
                    </p>
                  </div>
                ) : (
                  <div className="cinema-list">
                    {scheduleRows.map((row) => (
                      <article key={row.cinemaId} className="cinema-row">
                        <div className="cinema-row-head">
                          <h3 className="cinema-row-name">{row.cinemaName}</h3>
                          {(row.address || row.city) && (
                            <span className="cinema-row-address">
                              {[row.address, row.city].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </div>

                        {row.formats.map((format) => (
                          <div key={format.code} className="showtime-group">
                            <span className="showtime-format">{format.label}</span>
                            <div className="time-slots-row">
                              {format.slots.map((slot) => (
                                <span
                                  key={slot.id}
                                  className="time-slot-btn time-slot-btn--static tabular-nums"
                                  aria-label={`Suất ${slot.time} tại ${row.cinemaName}, ${format.label}`}
                                >
                                  {slot.time}
                                </span>
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
              <p>{movie.synopsis || 'Nội dung phim đang được cập nhật.'}</p>
            </div>
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
                      {item.heroImage || item.posterImage ? (
                        <img
                          src={item.heroImage || item.posterImage}
                          alt=""
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="aside-movie-poster-fallback" aria-hidden="true">
                          <Film size={22} />
                        </span>
                      )}
                      {item.ageRating && (
                        <span className="aside-movie-badges">
                          <span className={`age-mark age-mark--${item.ageRating}`}>
                            {item.ageRating}
                          </span>
                        </span>
                      )}
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
