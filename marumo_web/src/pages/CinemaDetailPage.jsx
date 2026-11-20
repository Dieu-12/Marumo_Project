import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Car, Check, Clock, Film, MapPin, Phone, Sparkles } from 'lucide-react';
import { CINEMAS, CINEMA_GALLERIES, formatLabels, MOVIES, SHOWTIMES } from '../data/cinemaData.js';
import MovieCard from '../components/MovieCard.jsx';
import { useApp } from '../context/AppContext.jsx';
import './CinemaDetailPage.css';

export default function CinemaDetailPage() {
  const { cinemaId } = useParams();
  const { preferredCinemaId, setPreferredCinemaId } = useApp();
  const cinema = CINEMAS.find((item) => item.id === cinemaId);

  if (!cinema) return <Navigate to="/cinemas" replace />;

  const isPreferred = preferredCinemaId === cinema.id;
  const formats = cinema.formats.map((format) => formatLabels[format] || format);
  const gallery = CINEMA_GALLERIES[cinema.id];
  const nowShowing = MOVIES.filter(
    (movie) =>
      movie.status === 'now-showing' &&
      SHOWTIMES.some((slot) => slot.movieId === movie.id && slot.cinemaId === cinema.id)
  );

  return (
    <main className="cinema-detail-page">
      <section className="cinema-detail-hero">
        <div className="container cinema-detail-hero-grid">
          <div className="cinema-detail-copy">
            <Link to="/cinemas" className="cinema-back-link">
              <ArrowLeft size={16} aria-hidden="true" />
              Tất cả rạp
            </Link>

            <p className="cinema-detail-eyebrow">
              MARUMO · {cinema.district}, {cinema.cityLabel || cinema.city}
            </p>
            <h1 className="cinema-detail-title">{cinema.name}</h1>
            <p className="cinema-detail-lead">{cinema.description}</p>

            <ul className="cinema-detail-facts">
              <li>
                <Film size={15} aria-hidden="true" />
                {cinema.screens} phòng chiếu
              </li>
              <li>
                <Sparkles size={15} aria-hidden="true" />
                {formats.slice(0, 3).join(' · ')}
              </li>
            </ul>

            <div className="cinema-detail-actions">
              <Link to={`/cinemas?branch=${cinema.id}`} className="btn btn-primary btn-lg">
                Xem lịch chiếu
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
              {isPreferred ? (
                <span className="cinema-detail-preferred">
                  <Check size={16} aria-hidden="true" />
                  Rạp yêu thích của bạn
                </span>
              ) : (
                <button
                  type="button"
                  className="btn btn-outline-light btn-lg"
                  onClick={() => setPreferredCinemaId(cinema.id)}
                >
                  Chọn làm rạp yêu thích
                </button>
              )}
            </div>
          </div>

          <div
            className="cinema-banner-gallery"
            role="group"
            aria-label={`Hình ảnh ${cinema.name}`}
          >
            {gallery.map((image) => (
              <figure key={image.src} className="cinema-banner-item">
                <img
                  src={image.src}
                  alt={`${image.alt} — ${cinema.name}`}
                  referrerPolicy="no-referrer"
                />
                <figcaption>{image.label}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-light">
        <div className="container cinema-detail-body">
          <div className="cinema-detail-info-card">
            <h2 className="cinema-detail-section-title">Thông tin rạp</h2>
            <dl className="cinema-detail-info-grid">
              <div>
                <dt>
                  <MapPin size={15} aria-hidden="true" />
                  Địa chỉ
                </dt>
                <dd>{cinema.address}</dd>
              </div>
              <div>
                <dt>
                  <Phone size={15} aria-hidden="true" />
                  Hotline
                </dt>
                <dd className="tabular-nums">{cinema.phone}</dd>
              </div>
              <div>
                <dt>
                  <Clock size={15} aria-hidden="true" />
                  Giờ mở cửa
                </dt>
                <dd className="tabular-nums">{cinema.hours}</dd>
              </div>
              <div>
                <dt>
                  <Car size={15} aria-hidden="true" />
                  Gửi xe
                </dt>
                <dd>{cinema.parking}</dd>
              </div>
            </dl>
          </div>

          <aside className="cinema-detail-aside">
            <div>
              <h2 className="cinema-detail-section-title">Định dạng tại rạp</h2>
              <p className="cinema-detail-aside-sub">
                {cinema.screens} phòng chiếu · {cinema.district},{' '}
                {cinema.cityLabel || cinema.city}
              </p>
            </div>
            <ul className="cinema-format-list">
              {formats.map((format) => (
                <li key={format} className="cinema-format-chip">
                  {format}
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>

      <section className="section cinema-detail-movies" aria-labelledby="cinema-movies-heading">
        <div className="container">
          <div className="section-header">
            <div>
              <div className="section-heading-group">
                <span className="section-accent-bar" aria-hidden="true" />
                <h2 id="cinema-movies-heading" className="section-title">
                  Phim đang chiếu
                </h2>
              </div>
              <p className="section-subtitle">
                {nowShowing.length} phim đang có suất chiếu tại {cinema.name}.
              </p>
            </div>
            <Link to={`/cinemas?branch=${cinema.id}`} className="btn btn-outline btn-sm">
              Xem lịch chiếu
            </Link>
          </div>

          {nowShowing.length > 0 ? (
            <div className="cinema-movies-grid">
              {nowShowing.map((movie) => (
                <MovieCard key={movie.id} movie={movie} cinemaId={cinema.id} />
              ))}
            </div>
          ) : (
            <p className="cinema-movies-empty">
              Hiện chưa có suất chiếu tại rạp. Vui lòng chọn rạp khác.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
