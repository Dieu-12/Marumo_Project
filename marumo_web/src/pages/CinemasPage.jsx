import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Check, Clock, MapPin, Phone } from 'lucide-react';
import { CINEMAS, DATES, formatLabels, MOVIES, SHOWTIMES } from '../data/cinemaData.js';
import { useApp } from '../context/AppContext.jsx';
import './CinemasPage.css';

export default function CinemasPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { preferredCinemaId, setPreferredCinemaId } = useApp();

  const [selectedDateId, setSelectedDateId] = useState(DATES[0].id);

  const activeCinema =
    CINEMAS.find((c) => c.id === searchParams.get('branch')) ||
    CINEMAS.find((c) => c.id === preferredCinemaId) ||
    CINEMAS[0];
  const nowShowing = MOVIES.filter((m) => m.status === 'now-showing');

  const handleBranchChange = (event) => {
    setSearchParams({ branch: event.target.value }, { replace: true });
  };

  return (
    <main>
      <section className="page-banner">
        <div className="container">
          <h1 className="page-banner-title">Hệ thống rạp MARUMO</h1>
          <p className="page-banner-sub">
            Chọn rạp để xem phòng chiếu, thông tin gửi xe và lịch chiếu hằng ngày.
          </p>
        </div>
      </section>

      <section className="section section-light">
        <div className="container">
          <div className="cinema-detail-panel">
            <div className="cinema-branch-toolbar">
              <label htmlFor="cinema-branch-select" className="cinema-branch-toolbar-label">
                Chọn rạp
              </label>
              <select
                id="cinema-branch-select"
                className="form-select cinema-branch-select"
                value={activeCinema.id}
                onChange={handleBranchChange}
              >
                {CINEMAS.map((cinema) => (
                  <option key={cinema.id} value={cinema.id}>
                    {cinema.name} — {cinema.district}, {cinema.cityLabel || cinema.city}
                  </option>
                ))}
              </select>
            </div>

            <div className="cinema-info-card">
              <Link
                to={`/cinemas/${activeCinema.id}`}
                className="cinema-info-media-link"
                aria-label={`Xem chi tiết ${activeCinema.name}`}
              >
                <img
                  src={activeCinema.image}
                  srcSet="/src/assets/images/cinema-auditorium-720.webp 720w, /src/assets/images/cinema-auditorium-1376.webp 1376w"
                  sizes="(max-width: 767px) calc(100vw - 32px), 320px"
                  alt={`Không gian phòng chiếu ${activeCinema.name}`}
                  className="cinema-info-img"
                  referrerPolicy="no-referrer"
                />
              </Link>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
                  <h2 style={{ fontSize: '1.5rem' }}>
                    <Link
                      to={`/cinemas/${activeCinema.id}`}
                      className="cinema-info-title-link"
                    >
                      {activeCinema.name}
                    </Link>
                  </h2>
                  {preferredCinemaId === activeCinema.id ? (
                    <span className="cinema-selected-label">
                      <Check size={15} aria-hidden="true" />
                      <span>Rạp yêu thích</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => setPreferredCinemaId(activeCinema.id)}
                    >
                      Đặt làm rạp yêu thích
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.9375rem', color: 'var(--color-text-secondary)', marginBottom: '14px' }}>
                  <span>
                    <MapPin size={15} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '6px' }} aria-hidden="true" />
                    {activeCinema.address}
                  </span>
                  <span className="tabular-nums">
                    <Phone size={15} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '6px' }} aria-hidden="true" />
                    Gửi xe: {activeCinema.parking}
                  </span>
                  <span className="tabular-nums">
                    <Clock size={15} style={{ display: 'inline', verticalAlign: '-2px', marginRight: '6px' }} aria-hidden="true" />
                    Mở cửa hằng ngày {activeCinema.hours}
                  </span>
                </div>

                <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                  Định dạng: {activeCinema.formats.map((f) => formatLabels[f] || f).join(' · ')}
                </div>

                <Link to={`/cinemas/${activeCinema.id}`} className="cinema-detail-inline-link">
                  Xem chi tiết rạp
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </div>
            </div>

            <div className="date-strip" role="tablist" aria-label="Chọn ngày xem phim">
              {DATES.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  role="tab"
                  aria-selected={selectedDateId === d.id}
                  className={`date-btn ${selectedDateId === d.id ? 'is-active' : ''}`}
                  onClick={() => setSelectedDateId(d.id)}
                >
                  <span className="date-btn-day">{d.dayName}</span>
                  <span className="date-btn-date">{d.dateLabel}</span>
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {nowShowing.map((movie) => {
                const slots = SHOWTIMES.filter(
                  (s) =>
                    s.movieId === movie.id &&
                    s.cinemaId === activeCinema.id &&
                    s.dateId === selectedDateId
                );
                if (slots.length === 0) return null;

                const grouped = slots.reduce((acc, slot) => {
                  if (!acc[slot.format]) acc[slot.format] = [];
                  acc[slot.format].push(slot);
                  return acc;
                }, {});

                return (
                  <div key={movie.id} className="cinema-movie-row">
                    <img
                      src={movie.posterImage}
                      alt={`Áp phích phim ${movie.title}`}
                      className="cinema-movie-poster"
                      referrerPolicy="no-referrer"
                    />

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                        <span className={`age-mark age-mark--${movie.ageRating}`}>
                          {movie.ageRating}
                        </span>
                        <h3 style={{ fontSize: '1.125rem' }}>
                          <Link to={`/movies/${movie.slug}`}>{movie.title}</Link>
                        </h3>
                      </div>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>
                        {movie.genre} · {movie.duration} phút
                      </div>

                      {Object.entries(grouped).map(([formatName, formatSlots]) => (
                        <div key={formatName} className="format-group">
                          <div className="format-group-label">{formatLabels[formatName] || formatName}</div>
                          <div className="time-slots-row">
                            {formatSlots.map((slot) => (
                              <button
                                key={slot.id}
                                type="button"
                                className="time-slot-btn tabular-nums"
                                onClick={() =>
                                  navigate(
                                    `/booking/${movie.id}?cinema=${activeCinema.id}&date=${selectedDateId}&showtime=${slot.id}`
                                  )
                                }
                              >
                                {slot.time}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
