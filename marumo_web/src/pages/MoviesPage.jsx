import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CINEMAS, formatLabels, MOVIES } from '../data/cinemaData.js';
import { useApp } from '../context/AppContext.jsx';
import { filterMovies } from '../utils/bookingLogic.js';
import MovieCard from '../components/MovieCard.jsx';
import './MoviesPage.css';

const STATUS_TABS = [
  { id: 'all', label: 'Tất cả phim' },
  { id: 'now-showing', label: 'Đang chiếu' },
  { id: 'coming-soon', label: 'Sắp chiếu' },
];

const FORMATS = ['All', 'IMAX Laser', 'Dolby Atmos', '4DX', '2D Sub', '2D Dub'];

export default function MoviesPage() {
  const [searchParams] = useSearchParams();
  const { setPreferredCinemaId } = useApp();
  const initialTab = searchParams.get('tab') || 'all';
  const selectedCinemaId = searchParams.get('cinema');

  const bindCinema = useCallback((node) => {
    if (!node) return;
    if (CINEMAS.some((cinema) => cinema.id === selectedCinemaId)) {
      setPreferredCinemaId(selectedCinemaId);
    }
  }, [selectedCinemaId, setPreferredCinemaId]);

  const [status, setStatus] = useState(
    STATUS_TABS.some((t) => t.id === initialTab) ? initialTab : 'all'
  );
  const [format, setFormat] = useState('All');
  const [query, setQuery] = useState('');

  const results = filterMovies(MOVIES, { status, format, query });

  return (
    <main ref={bindCinema}>
      <section className="page-banner">
        <div className="container">
          <h1 className="page-banner-title">Phim và lịch chiếu</h1>
          <p className="page-banner-sub">
            Khám phá phim đang chiếu và sắp ra mắt tại hệ thống rạp MARUMO.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="movies-toolbar">
            <div className="movies-status-tabs" role="tablist" aria-label="Trạng thái phát hành phim">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={status === tab.id}
                  className={`movies-status-tab ${status === tab.id ? 'is-active' : ''}`}
                  onClick={() => setStatus(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="movies-controls">
              <label htmlFor="movies-search" className="sr-only">
                Tìm phim
              </label>
              <input
                id="movies-search"
                type="search"
                className="movies-search-input"
                placeholder="Tìm tên phim, diễn viên, đạo diễn..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />

              <label htmlFor="movies-format" className="sr-only">
                Lọc theo định dạng
              </label>
              <select
                id="movies-format"
                className="movies-filter-select"
                value={format}
                onChange={(e) => setFormat(e.target.value)}
              >
                {FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {f === 'All' ? 'Tất cả định dạng' : formatLabels[f] || f}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {results.length === 0 ? (
            <div className="movies-empty-state">
              <p>Không tìm thấy phim phù hợp với bộ lọc.</p>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{ marginTop: '14px' }}
                onClick={() => {
                  setStatus('all');
                  setFormat('All');
                  setQuery('');
                }}
              >
                Đặt lại bộ lọc
              </button>
            </div>
          ) : (
            <div className="movies-grid">
              {results.map((movie) => (
                <MovieCard key={movie.id} movie={movie} />
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
