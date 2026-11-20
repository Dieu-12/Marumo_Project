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

export default function HomePage() {
  const heroSlides = MOVIES.filter((m) => m.isFeaturedHero);
  const nowShowingMovies = filterMovies(MOVIES, { status: 'now-showing' });
  const comingSoonMovies = filterMovies(MOVIES, { status: 'coming-soon' });

  return (
    <main data-testid="home-page">
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

            <Link to="/movies" className="btn btn-outline btn-sm">
              <span>Tất cả phim</span>
              <ChevronRight size={15} aria-hidden="true" />
            </Link>
          </div>

          <div className="movies-grid">
            {nowShowingMovies.map((movie) => (
              <MovieCard key={movie.id} movie={movie} />
            ))}
          </div>
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
