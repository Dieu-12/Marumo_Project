import express from 'express';
import { parsePublicMovieQuery, parsePublicShowtimeQuery, parsePublicSlug, parseShowtimeId } from './catalogValidation.js';
import { HttpError } from './validation.js';
import { createSessionMiddleware } from './session.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export function createPublicCatalogRouter(repository, { now = Date.now, sessionTokens } = {}) {
  const router = express.Router();
  const requireSession = createSessionMiddleware(repository, sessionTokens, now);

  function requireMovie(movie) {
    if (!movie) throw new HttpError(404, 'MOVIE_NOT_FOUND', 'Movie not found.');
    return movie;
  }

  router.get('/movies', async (req, res) => {
    const query = parsePublicMovieQuery(req.query);
    const rows = await repository.listPublicMovies({ ...query, limit: query.limit + 1 });
    const movies = rows.slice(0, query.limit);
    const nextAfter = rows.length > query.limit ? movies[movies.length - 1].id : null;
    res.status(200).json({ movies, nextAfter });
  });
  router.get('/movies/:slug/showtimes', async (req, res) => {
    const slug = parsePublicSlug(req.params.slug);
    const { days } = parsePublicShowtimeQuery(req.query);
    const movie = requireMovie(await repository.findPublicMovieBySlug(slug));
    const from = new Date(now());
    const to = new Date(from.getTime() + days * DAY_MS);
    const showtimes = await repository.listPublicShowtimes({ movieId: movie.id, from, to });
    res.status(200).json({ showtimes });
  });
  router.get('/showtimes/:showtimeId/seats', requireSession, async (req, res) => {
    const showtimeId = parseShowtimeId(req.params.showtimeId);
    const booking = await repository.getPublicShowtimeSeats({ showtimeId });
    if (!booking) throw new HttpError(404, 'SHOWTIME_NOT_FOUND', 'Showtime not found.');
    res.status(200).json(booking);
  });
  router.get('/movies/:slug', async (req, res) => {
    const movie = requireMovie(await repository.findPublicMovieBySlug(parsePublicSlug(req.params.slug)));
    res.status(200).json({ movie });
  });
  return router;
}
