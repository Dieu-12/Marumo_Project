import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Search, X } from 'lucide-react';
import { CINEMAS, MOVIES } from '../data/cinemaData.js';
import { filterMovies } from '../utils/bookingLogic.js';
import { useApp } from '../context/AppContext.jsx';
import './Modals.css';

export default function SearchModal() {
  const { searchModalOpen, setSearchModalOpen, setPreferredCinemaId } = useApp();
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const bindSearch = useCallback((node) => {
    if (!node) return undefined;
    if (!searchModalOpen) return undefined;
    const handleKey = (e) => {
      if (e.key === 'Escape') setSearchModalOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [searchModalOpen, setSearchModalOpen]);

  if (!searchModalOpen) return null;

  const matchedMovies = filterMovies(MOVIES, { query }).slice(0, 5);
  const qLower = query.trim().toLowerCase();
  const matchedCinemas = CINEMAS.filter((c) => {
    if (!qLower) return true;
    return `${c.name} ${c.cityLabel} ${c.city} ${c.district}`.toLowerCase().includes(qLower);
  }).slice(0, 3);

  const goMovie = (slug) => {
    setSearchModalOpen(false);
    setQuery('');
    navigate(`/movies/${slug}`);
  };

  const goCinema = (cinemaId) => {
    setPreferredCinemaId(cinemaId);
    setSearchModalOpen(false);
    setQuery('');
    navigate(`/cinemas?branch=${cinemaId}`);
  };

  return (
    <div
      ref={bindSearch}
      className="modal-backdrop"
      data-testid="search-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="search-modal-title"
      onClick={() => setSearchModalOpen(false)}
    >
      <div className="modal-panel modal-panel--wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id="search-modal-title" className="modal-title">
            Tìm phim và rạp chiếu
          </h2>
          <button
            type="button"
            className="modal-close-btn"
            aria-label="Đóng cửa sổ tìm kiếm"
            onClick={() => setSearchModalOpen(false)}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="modal-body">
          <div className="search-input-wrap">
            <Search size={18} className="search-input-icon" aria-hidden="true" />
            <label htmlFor="global-search-input" className="sr-only">
              Tìm theo tên phim, thể loại, đạo diễn hoặc rạp chiếu
            </label>
            <input
              id="global-search-input"
              data-testid="global-search-input"
              type="search"
              autoFocus
              className="search-modal-input"
              placeholder="Tên phim, thể loại hoặc thành phố..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {matchedMovies.length === 0 && matchedCinemas.length === 0 ? (
            <div className="search-empty">
              Không tìm thấy phim hoặc rạp phù hợp với “{query}”.
            </div>
          ) : (
            <>
              {matchedMovies.length > 0 && (
                <div className="search-results-group">
                  <div className="search-group-label">Phim</div>
                  <div className="search-result-list">
                    {matchedMovies.map((movie) => (
                      <button
                        key={movie.id}
                        type="button"
                        className="search-result-item"
                        onClick={() => goMovie(movie.slug)}
                      >
                        <span className="search-result-left">
                          <img
                            src={movie.posterImage}
                            alt=""
                            className="search-thumb"
                            referrerPolicy="no-referrer"
                          />
                          <span>
                            <div className="search-result-title">{movie.title}</div>
                            <div className="search-result-sub">
                              {movie.genre} · {movie.duration} phút ·{' '}
                              {movie.status === 'now-showing' ? 'Đang chiếu' : `Khởi chiếu ${movie.releaseLabel}`}
                            </div>
                          </span>
                        </span>
                        <span className={`age-mark age-mark--${movie.ageRating}`}>
                          {movie.ageRating}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {matchedCinemas.length > 0 && (
                <div className="search-results-group">
                  <div className="search-group-label">Rạp chiếu</div>
                  <div className="search-result-list">
                    {matchedCinemas.map((cinema) => (
                      <button
                        key={cinema.id}
                        type="button"
                        className="search-result-item"
                        onClick={() => goCinema(cinema.id)}
                      >
                        <span className="search-result-left">
                          <MapPin size={18} color="var(--color-primary)" aria-hidden="true" />
                          <span>
                            <div className="search-result-title">{cinema.name}</div>
                            <div className="search-result-sub">
                              {cinema.district}, {cinema.cityLabel || cinema.city} · {cinema.screens} phòng chiếu
                            </div>
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
