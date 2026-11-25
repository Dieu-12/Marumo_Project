import { HttpError } from '../utils/validation.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function requireMovie(movie) {
  if (!movie) throw new HttpError(404, 'MOVIE_NOT_FOUND', 'Movie not found.');
  return movie;
}

export function createPublicCatalogService(repository, { now = Date.now } = {}) {
  return {
    requireMovie,
    async listMovies(query) {
      return repository.listPublicMovies({ ...query, limit: query.limit + 1 });
    },
    async findMovieBySlug(slug) {
      return repository.findPublicMovieBySlug(slug);
    },
    async listShowtimes({ movieId, from, to }) {
      return repository.listPublicShowtimes({ movieId, from, to });
    },
    showtimeWindow(days) {
      const from = new Date(now());
      return { from, to: new Date(from.getTime() + days * DAY_MS) };
    },
    async releaseExpiredShowtimeBookings(showtimeId) {
      return repository.releaseExpiredShowtimeBookings({ showtimeId }, now());
    },
    async showtimeSeats(showtimeId) {
      const booking = await repository.getPublicShowtimeSeats({ showtimeId });
      if (!booking) throw new HttpError(404, 'SHOWTIME_NOT_FOUND', 'Showtime not found.');
      return booking;
    },
  };
}
