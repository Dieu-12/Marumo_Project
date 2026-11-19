import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { MOVIES } from '../data/cinemaData.js';
import { filterMovies } from '../utils/bookingLogic.js';
import HeroCarousel from '../components/HeroCarousel.jsx';
import QuickTicketBar from '../components/QuickTicketBar.jsx';
import MovieCard from '../components/MovieCard.jsx';
import CinemaLocationsSection from '../components/CinemaLocationsSection.jsx';
import PromotionsSection from '../components/PromotionsSection.jsx';
import './HomePage.css';

const GENRE_FILTERS = [
  { value: 'All', label: 'Tất cả' },
  { value: 'Sci-Fi', label: 'Khoa học viễn tưởng' },
  { value: 'Thriller', label: 'Giật gân' },
  { value: 'Animation', label: 'Hoạt hình' },
  { value: 'Action', label: 'Hành động' },
];

export default function HomePage() {
  const [genreFilter, setGenreFilter] = useState('All');

  const heroSlides = MOVIES.filter((m) => m.isFeaturedHero);
  const nowShowingMovies = filterMovies(MOVIES, {
    status: 'now-showing',
    genre: genreFilter,
  });
  const comingSoonMovies = filterMovies(MOVIES, { status: 'coming-soon' });

  return (
    <main>
      <HeroCarousel slides={heroSlides} />

      <QuickTicketBar />

      <section className="section" aria-labelledby="now-showing-heading">
        <div className="container">
          <div className="section-header">
            <div>
              <div className="section-heading-group">
                <span className="section-accent-bar" aria-hidden="true" />
                <h2 id="now-showing-heading" className="section-title">
                  Phim đang chiếu
                </h2>
              </div>
              <p className="section-subtitle">
                Chọn phim hôm nay, tận hưởng IMAX Laser, Dolby Atmos và 4DX.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div className="genre-filter-row" role="tablist" aria-label="Lọc phim đang chiếu theo thể loại">
                {GENRE_FILTERS.map((genre) => (
                  <button
                    key={genre.value}
                    type="button"
                    role="tab"
                    aria-selected={genreFilter === genre.value}
                    className={`genre-filter-btn ${genreFilter === genre.value ? 'is-active' : ''}`}
                    onClick={() => setGenreFilter(genre.value)}
                  >
                    {genre.label}
                  </button>
                ))}
              </div>
              <Link to="/movies" className="btn btn-outline btn-sm">
                <span>Tất cả phim</span>
                <ChevronRight size={15} aria-hidden="true" />
              </Link>
            </div>
          </div>

          {nowShowingMovies.length === 0 ? (
            <div className="movies-empty-state">
              Chưa có phim đang chiếu thuộc thể loại này.
            </div>
          ) : (
            <div className="movies-grid">
              {nowShowingMovies.map((movie) => (
                <MovieCard key={movie.id} movie={movie} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="section section-light" aria-labelledby="coming-soon-heading">
        <div className="container">
          <div className="section-header">
            <div>
              <div className="section-heading-group">
                <span className="section-accent-bar" aria-hidden="true" />
                <h2 id="coming-soon-heading" className="section-title">
                  Phim sắp chiếu
                </h2>
              </div>
              <p className="section-subtitle">
                Những bộ phim mới sắp ra mắt tại hệ thống rạp MARUMO.
              </p>
            </div>

            <Link to="/movies?tab=coming-soon" className="btn btn-outline btn-sm">
              Xem phim sắp chiếu
            </Link>
          </div>

          <div className="coming-soon-grid">
            {comingSoonMovies.map((movie) => (
              <MovieCard key={movie.id} movie={movie} />
            ))}
          </div>
        </div>
      </section>

      <CinemaLocationsSection />

      <PromotionsSection />
    </main>
  );
}
