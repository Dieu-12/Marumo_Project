import { useCallback, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { filterMovies } from '../utils/bookingLogic.js';
import { catalogStore } from '../utils/catalogStore.js';
import HeroCarousel from '../components/HeroCarousel.jsx';
import QuickTicketBar from '../components/QuickTicketBar.jsx';
import MovieCard from '../components/MovieCard.jsx';
import CinemaLocationsSection from '../components/CinemaLocationsSection.jsx';
import PromotionsSection from '../components/PromotionsSection.jsx';
import './HomePage.css';

export default function HomePage() {
  const catalog = useSyncExternalStore(
    catalogStore.subscribe,
    catalogStore.getSnapshot,
    catalogStore.getSnapshot
  );
  const bindCatalog = useCallback((node) => {
    if (!node) return undefined;
    catalogStore.ensureMovies();
    return undefined;
  }, []);

  const movies = catalog.movies;
  const isReady = catalog.moviesStatus === 'ready';
  const isError = catalog.moviesStatus === 'error';
  const featuredMovies = movies.filter((movie) => movie.isFeaturedHero);
  const heroSlides = featuredMovies.length > 0
    ? featuredMovies
    : movies.filter((movie) => movie.status === 'now-showing').slice(0, 3);
  const nowShowingMovies = filterMovies(movies, { status: 'now-showing' });
  const comingSoonMovies = filterMovies(movies, { status: 'coming-soon' });

  return (
    <main data-testid="home-page" ref={bindCatalog}>
      {isReady && <HeroCarousel slides={heroSlides} />}

      <QuickTicketBar />

      {!isReady && !isError && (
        <section className="section">
          <div className="container">
            <div className="catalog-state" role="status">
              Đang tải danh sách phim...
            </div>
          </div>
        </section>
      )}

      {isError && (
        <section className="section">
          <div className="container">
            <div className="catalog-state catalog-state--error" role="alert">
              <p>{catalog.moviesError || 'Không thể tải danh sách phim.'}</p>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => catalogStore.reloadMovies()}
              >
                Thử lại
              </button>
            </div>
          </div>
        </section>
      )}

      {isReady && (
        <>
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

                <Link to="/movies" className="btn btn-outline btn-sm">
                  <span>Tất cả phim</span>
                  <ChevronRight size={15} aria-hidden="true" />
                </Link>
              </div>

              {nowShowingMovies.length === 0 ? (
                <div className="catalog-state">Chưa có phim đang chiếu.</div>
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

              {comingSoonMovies.length === 0 ? (
                <div className="catalog-state">Chưa có phim sắp chiếu.</div>
              ) : (
                <div className="coming-soon-grid">
                  {comingSoonMovies.map((movie) => (
                    <MovieCard key={movie.id} movie={movie} />
                  ))}
                </div>
              )}
            </div>
          </section>
        </>
      )}

      <CinemaLocationsSection />

      <PromotionsSection />
    </main>
  );
}
