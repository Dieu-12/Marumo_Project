import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Film, Play, Star, Ticket } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import './MovieCard.css';

export default function MovieCard({ movie, cinemaId = '' }) {
  const [imgError, setImgError] = useState(false);
  const { setTrailerMovie } = useApp();
  const navigate = useNavigate();

  const isComingSoon = movie.status === 'coming-soon';
  const canBook = movie.bookingEnabled !== false;
  const showPosterFallback = !movie.posterImage || imgError;

  return (
    <article className="movie-card" data-testid="movie-card">
      <div className="movie-poster-frame">
        <Link
          to={`/movies/${movie.slug}`}
          className="movie-poster-link"
          aria-label={`Xem chi tiết phim ${movie.title}`}
        >
          {showPosterFallback ? (
            <div className="movie-poster-fallback">
              <Film size={28} aria-hidden="true" />
              <span>{movie.title}</span>
            </div>
          ) : (
            <img
              src={movie.posterImage}
              alt={`Áp phích phim ${movie.title}`}
              className="movie-poster-img"
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
            />
          )}
        </Link>

        <div className="movie-poster-top">
          {movie.ageRating && (
            <span className={`age-mark age-mark--${movie.ageRating}`}>
              {movie.ageRating}
            </span>
          )}

          {movie.rating ? (
            <span className="movie-rating-chip tabular-nums">
              <Star size={12} fill="var(--color-highlight)" color="var(--color-highlight)" aria-hidden="true" />
              <span>{movie.rating.toFixed(1)}</span>
            </span>
          ) : movie.releaseLabel ? (
            <span className="movie-release-chip">{movie.releaseLabel}</span>
          ) : null}
        </div>
      </div>

      <div className="movie-card-body">
        <h3 className="movie-card-title">
          <Link to={`/movies/${movie.slug}`}>{movie.title}</Link>
        </h3>

        <div className="movie-card-meta tabular-nums">
          <span>{movie.genre || 'Đang cập nhật'}</span>
          <span aria-hidden="true">·</span>
          <span>{movie.duration ? `${movie.duration} phút` : 'Thời lượng đang cập nhật'}</span>
        </div>

        <div className="movie-card-actions">
          {isComingSoon ? (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setTrailerMovie(movie)}
            >
              <Play size={15} aria-hidden="true" />
              <span>Giới thiệu</span>
            </button>
          ) : canBook ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() =>
                navigate(`/booking/${movie.id}${cinemaId ? `?cinema=${cinemaId}` : ''}`)
              }
            >
              <Ticket size={15} aria-hidden="true" />
              <span>Đặt vé</span>
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled
              title="Đặt vé trực tuyến sắp mở"
            >
              <Ticket size={15} aria-hidden="true" />
              <span>Đặt vé sắp mở</span>
            </button>
          )}

          <Link to={`/movies/${movie.slug}`} className="btn btn-outline">
            Chi tiết
          </Link>
        </div>
      </div>
    </article>
  );
}
