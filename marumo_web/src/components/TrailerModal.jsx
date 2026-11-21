import { useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Film, Ticket, X } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import './Modals.css';

export default function TrailerModal() {
  const { trailerMovie, setTrailerMovie } = useApp();
  const closeRef = useRef(null);

  const bindClose = useCallback((node) => {
    if (!node) return undefined;
    closeRef.current = node;
    if (!trailerMovie) return undefined;
    const previousFocus = document.activeElement;
    closeRef.current?.focus();
    const handleKey = (event) => {
      if (event.key === 'Escape') setTrailerMovie(null);
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      previousFocus?.focus();
    };
  }, [trailerMovie, setTrailerMovie]);

  if (!trailerMovie) return null;

  return (
    <div className="modal-backdrop" onClick={() => setTrailerMovie(null)}>
      <div
        className="modal-panel modal-panel--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="trailer-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="trailer-modal-title" className="modal-title">{trailerMovie.title}</h2>
          <button
            ref={bindClose}
            type="button"
            className="modal-close-btn"
            aria-label="Đóng giới thiệu phim"
            onClick={() => setTrailerMovie(null)}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="modal-body">
          <div className="trailer-stage">
            {trailerMovie.heroImage ? (
              <img
                src={trailerMovie.heroImage}
                alt={`Hình ảnh giới thiệu phim ${trailerMovie.title}`}
                className="trailer-stage-img"
              />
            ) : (
              <div className="trailer-stage-fallback">
                <Film size={36} aria-hidden="true" />
                <span>{trailerMovie.title}</span>
              </div>
            )}
          </div>
          <p className="section-subtitle">{trailerMovie.heroDescription}</p>
          <div className="trailer-footer">
            <p>{trailerMovie.genre} · Đạo diễn: {trailerMovie.director}</p>
            {trailerMovie.status === 'now-showing' && trailerMovie.bookingEnabled !== false && (
              <Link
                to={`/booking/${trailerMovie.id}`}
                className="btn btn-primary btn-sm"
                onClick={() => setTrailerMovie(null)}
              >
                <Ticket size={15} aria-hidden="true" />
                Đặt vé
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
