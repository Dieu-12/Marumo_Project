import { parsePublicMovieQuery, parsePublicShowtimeQuery, parsePublicSlug, parseShowtimeId } from '../utils/catalogValidation.js';
import { createPublicCatalogService } from '../services/publicCatalogService.js';

export function createPublicCatalogController(repository, { now = Date.now } = {}) {
  const service = createPublicCatalogService(repository, { now });
  return {
    async listMovies(req, res) {
      const query = parsePublicMovieQuery(req.query);
      const rows = await service.listMovies(query);
      const movies = rows.slice(0, query.limit);
      const nextAfter = rows.length > query.limit ? movies[movies.length - 1].id : null;
      res.status(200).json({ movies, nextAfter });
    },
    async showtimes(req, res) {
      const slug = parsePublicSlug(req.params.slug);
      const { days } = parsePublicShowtimeQuery(req.query);
      const movie = service.requireMovie(await service.findMovieBySlug(slug));
      const { from, to } = service.showtimeWindow(days);
      const showtimes = await service.listShowtimes({ movieId: movie.id, from, to });
      res.status(200).json({ showtimes });
    },
    async seats(req, res) {
      const showtimeId = parseShowtimeId(req.params.showtimeId);
      await service.releaseExpiredShowtimeBookings(showtimeId);
      res.status(200).json(await service.showtimeSeats(showtimeId));
    },
    async movie(req, res) {
      const movie = service.requireMovie(await service.findMovieBySlug(parsePublicSlug(req.params.slug)));
      res.status(200).json({ movie });
    },
  };
}
