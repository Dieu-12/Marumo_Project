import { useCallback, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, Car, Check, ChevronLeft, ChevronRight, Clock, Film, MapPin, Phone, Sparkles } from 'lucide-react';
import { CINEMAS, CINEMA_GALLERIES, formatLabels, MOVIES, SHOWTIMES } from '../data/cinemaData.js';
import MovieCard from '../components/MovieCard.jsx';
import { useApp } from '../context/AppContext.jsx';
import './CinemaDetailPage.css';

const scrollBehavior = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

export default function CinemaDetailPage() {
  const { cinemaId } = useParams();
  const { preferredCinemaId, setPreferredCinemaId } = useApp();
  const cinema = CINEMAS.find((item) => item.id === cinemaId);

  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [moviesScroll, setMoviesScroll] = useState({ canPrev: false, canNext: false });
  const moviesTrackRef = useRef(null);

  const updateMoviesScroll = useCallback(() => {
    const track = moviesTrackRef.current;
    if (!track) {
      setMoviesScroll({ canPrev: false, canNext: false });
      return;
    }
    const maxScrollLeft = track.scrollWidth - track.clientWidth - 1;
    setMoviesScroll({
      canPrev: track.scrollLeft > 1,
      canNext: track.scrollLeft < maxScrollLeft,
    });
  }, []);

  const bindTrack = useCallback((node) => {
    if (!node) return undefined;
    moviesTrackRef.current = node;
    setActiveImageIndex(0);
    updateMoviesScroll();
    window.addEventListener('resize', updateMoviesScroll);
    return () => window.removeEventListener('resize', updateMoviesScroll);
  }, [updateMoviesScroll, cinemaId]);

  if (!cinema) return <Navigate to="/cinemas" replace />;

  const scrollMovies = (direction) => {
    const track = moviesTrackRef.current;
    if (!track) return;
    const card = track.querySelector('.movie-card');
    const step = card ? card.getBoundingClientRect().width + 24 : track.clientWidth;
    track.scrollBy({ left: step * direction, behavior: scrollBehavior() });
  };

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

          <div className="cinema-banner-slider" role="group" aria-label={`Hình ảnh ${cinema.name}`}>
            <div
              className="cinema-banner-track"
              style={{ transform: `translateX(-${activeImageIndex * 100}%)` }}
            >
              {gallery.map((image, index) => (
                <figure
                  key={image.src}
                  className="cinema-banner-slide"
                  aria-hidden={index !== activeImageIndex}
                >
                  <img
                    src={image.src}
                    alt={`${image.alt} — ${cinema.name}`}
                    referrerPolicy="no-referrer"
                  />
                  <figcaption>{image.label}</figcaption>
                </figure>
              ))}
            </div>

            {gallery.length > 1 && (
              <>
                <button
                  type="button"
                  className="cinema-banner-arrow cinema-banner-arrow--prev"
                  aria-label="Ảnh rạp trước"
                  onClick={() =>
                    setActiveImageIndex((activeImageIndex - 1 + gallery.length) % gallery.length)
                  }
                >
                  <ChevronLeft size={20} aria-hidden="true" />
                </button>

                <button
                  type="button"
                  className="cinema-banner-arrow cinema-banner-arrow--next"
                  aria-label="Ảnh rạp tiếp theo"
                  onClick={() => setActiveImageIndex((activeImageIndex + 1) % gallery.length)}
                >
                  <ChevronRight size={20} aria-hidden="true" />
                </button>

                <div className="cinema-banner-dots" role="group" aria-label="Chọn ảnh rạp">
                  {gallery.map((image, index) => (
                    <button
                      key={image.src}
                      type="button"
                      className={`cinema-banner-dot ${index === activeImageIndex ? 'is-active' : ''}`}
                      aria-pressed={index === activeImageIndex}
                      aria-label={`Xem ảnh ${image.label}`}
                      onClick={() => setActiveImageIndex(index)}
                    />
                  ))}
                </div>
              </>
            )}
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
          </div>

          {nowShowing.length > 0 ? (
            <div className="cinema-movies-slider">
              <button
                type="button"
                className="cinema-movies-arrow cinema-movies-arrow--prev"
                aria-label="Trượt danh sách phim sang trái"
                disabled={!moviesScroll.canPrev}
                onClick={() => scrollMovies(-1)}
              >
                <ChevronLeft size={20} aria-hidden="true" />
              </button>

              <div
                className="cinema-movies-track"
                ref={bindTrack}
                onScroll={updateMoviesScroll}
              >
                {nowShowing.map((movie) => (
                  <MovieCard key={movie.id} movie={movie} cinemaId={cinema.id} />
                ))}
              </div>

              <button
                type="button"
                className="cinema-movies-arrow cinema-movies-arrow--next"
                aria-label="Trượt danh sách phim sang phải"
                disabled={!moviesScroll.canNext}
                onClick={() => scrollMovies(1)}
              >
                <ChevronRight size={20} aria-hidden="true" />
              </button>
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
