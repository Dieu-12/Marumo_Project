import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Info, Star, Ticket } from 'lucide-react';
import './HeroCarousel.css';

const AUTOPLAY_MS = 6000;

export default function HeroCarousel({ slides }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [failedImages, setFailedImages] = useState({});
  const [isHovered, setIsHovered] = useState(false);
  const [isFocusWithin, setIsFocusWithin] = useState(false);
  const [transition, setTransition] = useState(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  const navigate = useNavigate();
  const totalSlides = slides?.length || 0;
  const isPaused = isHovered || isFocusWithin || prefersReducedMotion || transition !== null;

  const goTo = useCallback((nextIndex, direction) => {
    if (transition || nextIndex === activeIndex) return;

    setActiveIndex(nextIndex);
    if (!prefersReducedMotion) {
      setTransition({ previousIndex: activeIndex, direction });
    }
  }, [activeIndex, prefersReducedMotion, transition]);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (event) => setPrefersReducedMotion(event.matches);
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (isPaused || totalSlides < 2) return undefined;
    const timer = window.setTimeout(() => {
      goTo((activeIndex + 1) % totalSlides, 'right');
    }, AUTOPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [activeIndex, goTo, isPaused, totalSlides]);

  useEffect(() => {
    if (prefersReducedMotion) setTransition(null);
  }, [prefersReducedMotion]);

  if (totalSlides === 0) return null;

  return (
    <section
      data-testid="hero-carousel"
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
      <div className={`hero-stage ${transition ? 'is-transitioning' : ''}`}>
        {slides.map((movie, index) => {
          const isActive = index === activeIndex;
          const isLeaving = transition?.previousIndex === index;
          const imgFailed = failedImages[movie.id];

          return (
            <div
              key={movie.id}
              className={`hero-slide ${isActive ? 'is-active' : ''} ${
                isLeaving ? `is-leaving-to-${transition.direction === 'right' ? 'right' : 'left'}` : ''
              } ${
                isActive && transition ? `is-entering-from-${transition.direction === 'right' ? 'left' : 'right'}` : ''
              }`}
              aria-hidden={!isActive}
              onAnimationEnd={(event) => {
                if (
                  event.target === event.currentTarget &&
                  isActive &&
                  event.animationName.startsWith('hero-slide-in-')
                ) {
                  setTransition(null);
                }
              }}
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
              disabled={transition !== null}
              onClick={() => goTo((activeIndex - 1 + slides.length) % slides.length, 'left')}
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </button>

            <button
              type="button"
              className="hero-arrow hero-arrow--next"
              aria-label="Phim nổi bật tiếp theo"
              disabled={transition !== null}
              onClick={() => goTo((activeIndex + 1) % slides.length, 'right')}
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
                  disabled={transition !== null}
                  onClick={() => goTo(index, index > activeIndex ? 'right' : 'left')}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
