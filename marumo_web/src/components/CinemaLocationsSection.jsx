import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, MapPin } from 'lucide-react';
import { CINEMAS, formatLabels } from '../data/cinemaData.js';
import { useApp } from '../context/AppContext.jsx';
import './CinemaLocationsSection.css';

const CITIES = [
  { key: 'All Cities', label: 'Tất cả' },
  { key: 'Ho Chi Minh City', label: 'TP. Hồ Chí Minh' },
  { key: 'Hanoi', label: 'Hà Nội' },
  { key: 'Da Nang', label: 'Đà Nẵng' },
];

export default function CinemaLocationsSection() {
  const { preferredCinema, preferredCinemaId, setPreferredCinemaId } = useApp();
  const [cityFilter, setCityFilter] = useState('All Cities');
  const [showAllCinemas, setShowAllCinemas] = useState(false);
  const [failedImage, setFailedImage] = useState(null);
  const imgFailed = failedImage === preferredCinema.image;
  const setImgFailed = (failed) => setFailedImage(failed ? preferredCinema.image : null);



  const filteredCinemas =
    cityFilter === 'All Cities'
      ? CINEMAS
      : CINEMAS.filter((cinema) => cinema.city === cityFilter);
  const visibleCinemas = showAllCinemas ? filteredCinemas : filteredCinemas.slice(0, 2);

  return (
    <section className="section section-light" aria-labelledby="cinema-locations-heading">
      <div className="container">
        <div className="section-header">
          <div>
            <div className="section-heading-group">
              <span className="section-accent-bar" aria-hidden="true" />
              <h2 id="cinema-locations-heading" className="section-title">Rạp chiếu phim</h2>
            </div>
            <p className="section-subtitle">
              Chọn rạp quen thuộc để xem lịch chiếu và đặt chỗ.
            </p>
          </div>

          <Link to="/cinemas" className="btn btn-outline btn-sm">
            Xem tất cả rạp
          </Link>
        </div>

        <div className="cinemas-layout">
          <div className="cinemas-showcase">
            {!imgFailed && (
              <img
                src={preferredCinema.image}
                srcSet="/src/assets/images/cinema-auditorium-720.webp 720w, /src/assets/images/cinema-auditorium-1376.webp 1376w"
                sizes="(max-width: 767px) calc(100vw - 32px), (max-width: 1023px) calc(100vw - 40px), 560px"
                alt={`Không gian bên trong ${preferredCinema.name}`}
                className="cinemas-showcase-img"
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
              />
            )}
            <div className="cinemas-showcase-scrim" />

            <div className="cinemas-showcase-content">
              <div className="cinemas-showcase-kicker">
                Rạp đang chọn · {preferredCinema.cityLabel || preferredCinema.city}
              </div>
              <h3 className="cinemas-showcase-title">{preferredCinema.name}</h3>
              <p className="cinemas-showcase-meta">
                {preferredCinema.address}
                <br />
                <span className="tabular-nums">
                  {preferredCinema.screens} phòng chiếu · {preferredCinema.formats.map((format) => formatLabels?.[format] || format).join(' · ')}
                </span>
              </p>

              <div className="cinemas-showcase-actions">
                <Link
                  to={`/cinemas?branch=${preferredCinema.id}`}
                  className="btn btn-primary btn-sm"
                >
                  Xem lịch chiếu
                </Link>
                <Link
                  to={`/movies?cinema=${preferredCinema.id}`}
                  className="btn btn-outline btn-sm"
                >
                  Chọn phim tại rạp này
                </Link>
              </div>
            </div>
          </div>

          <div className="cinemas-list-panel">
            <div className="city-tabs" role="group" aria-label="Lọc rạp theo thành phố">
              {CITIES.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={cityFilter === key}
                  className={`city-tab ${cityFilter === key ? 'is-active' : ''}`}
                  onClick={() => setCityFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="cinema-branch-list" id="home-cinema-branches">
              {visibleCinemas.map((cinema) => {
                const isSelected = cinema.id === preferredCinemaId;
                return (
                  <article
                    key={cinema.id}
                    className={`cinema-branch-item ${isSelected ? 'is-selected' : ''}`}
                  >
                    <div>
                      <h3 className="cinema-branch-name">{cinema.name}</h3>
                      <p className="cinema-branch-address">
                        <MapPin size={13} aria-hidden="true" />
                        {cinema.district}, {cinema.cityLabel || cinema.city}
                      </p>
                      <div className="cinema-branch-specs tabular-nums">
                        {cinema.screens} phòng chiếu · {cinema.formats.slice(0, 3).map((format) => formatLabels?.[format] || format).join(' · ')}
                      </div>
                    </div>

                    <div className="cinema-branch-footer">
                      {isSelected ? (
                        <span className="cinema-selected-label">
                          <Check size={15} aria-hidden="true" />
                          <span>Rạp của bạn</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => setPreferredCinemaId(cinema.id)}
                        >
                          Chọn rạp
                        </button>
                      )}

                      <Link
                        to={`/cinemas?branch=${cinema.id}`}
                        className="btn btn-ghost btn-sm"
                      >
                        Lịch chiếu
                      </Link>
                    </div>
                  </article>
                );
              })}
              {filteredCinemas.length > 2 && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm cinema-list-toggle"
                  aria-expanded={showAllCinemas}
                  aria-controls="home-cinema-branches"
                  onClick={() => setShowAllCinemas((show) => !show)}
                >
                  {showAllCinemas ? 'Thu gọn danh sách rạp' : `Xem thêm ${filteredCinemas.length - 2} rạp`}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
