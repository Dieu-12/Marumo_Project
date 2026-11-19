import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Info, Star, Ticket } from 'lucide-react';
import './HeroCarousel.css';

const AUTOPLAY_MS = 6000;

export default function HeroCarousel({ slides }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [failedImages, setFailedImages] = useState({});
  const [isHovered, setIsHovered] = useState(false);
  const [isFocusWithin, setIsFocusWithin] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  const navigate = useNavigate();
  const totalSlides = slides?.length || 0;
  const isPaused = isHovered || isFocusWithin || prefersReducedMotion;

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (event) => setPrefersReducedMotion(event.matches);
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (isPaused || totalSlides < 2) return undefined;
    const timer = window.setTimeout(() => {
      setActiveIndex((prev) => (prev + 1) % totalSlides);
    }, AUTOPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [isPaused, activeIndex, totalSlides]);

  if (totalSlides === 0) return null;

  const goPrev = () => {
    setActiveIndex((prev) => (prev - 1 + slides.length) % slides.length);
  };

  const goNext = () => {
    setActiveIndex((prev) => (prev + 1) % slides.length);
  };

  return (
    <section
      className="hero-section"
      aria-label="Phim nổi bật"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onFocusCapture={() => setIsFocusWithin(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setIsFocusWithin(false);
        }
      }}
    >
      <div className="hero-stage">
        {slides.map((movie, index) => {
          const isActive = index === activeIndex;
          const imgFailed = failedImages[movie.id];

          return (
            <div
              key={movie.id}
              className={`hero-slide ${isActive ? 'is-active' : ''}`}
              aria-hidden={!isActive}
            >
              {imgFailed ? (
                <div className="hero-fallback" />
              ) : (
                <img
                  src={movie.heroImage}
                  alt={`Hình ảnh phim ${movie.title}`}
                  className="hero-image"
                  referrerPolicy="no-referrer"
                  onError={() =>
                    setFailedImages((prev) => ({ ...prev, [movie.id]: true }))
                  }
                />
              )}
              <div className="hero-scrim" />

              <div className="container hero-content-wrap">
                <div className="hero-copy">
                  <div className="hero-eyebrow">
                    <span className={`age-mark age-mark--${movie.ageRating}`}>
                      {movie.ageRating}
                    </span>
                    <span>{movie.heroTagline}</span>
                  </div>

                  <h1 className="hero-title">{movie.title}</h1>

                  <div className="hero-meta tabular-nums">
                    <span>{movie.genre}</span>
                    <span aria-hidden="true">·</span>
                    <span>{movie.duration} phút</span>
                    {movie.rating && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="hero-rating">
                          <Star size={14} fill="var(--color-highlight)" color="var(--color-highlight)" aria-hidden="true" />
                          {movie.rating} / 10
                        </span>
                      </>
                    )}
                  </div>

                  <p className="hero-description">{movie.heroDescription}</p>

                  <div className="hero-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-lg"
                      tabIndex={isActive ? 0 : -1}
                      onClick={() => navigate(`/booking/${movie.id}`)}
                    >
                      <Ticket size={18} aria-hidden="true" />
                      <span>Đặt vé</span>
                    </button>

                    <Link
                      to={`/movies/${movie.slug}`}
                      className="btn btn-outline-light btn-lg"
                      tabIndex={isActive ? 0 : -1}
                    >
                      <Info size={18} aria-hidden="true" />
                      <span>Xem thông tin phim</span>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {slides.length > 1 && (
          <>
            <button
              type="button"
              className="hero-arrow hero-arrow--prev"
              aria-label="Phim nổi bật trước"
              onClick={goPrev}
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </button>

            <button
              type="button"
              className="hero-arrow hero-arrow--next"
              aria-label="Phim nổi bật tiếp theo"
              onClick={goNext}
            >
              <ChevronRight size={20} aria-hidden="true" />
            </button>

            <div className="hero-indicators" role="group" aria-label="Chọn phim nổi bật">
              {slides.map((movie, index) => (
                <button
                  key={movie.id}
                  type="button"
                  aria-pressed={index === activeIndex}
                  aria-label={`Hiển thị phim ${movie.title}`}
                  className={`hero-indicator ${index === activeIndex ? 'is-active' : ''}`}
                  onClick={() => setActiveIndex(index)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
