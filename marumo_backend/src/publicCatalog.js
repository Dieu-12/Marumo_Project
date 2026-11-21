import express from 'express';
import { parsePublicMovieQuery, parsePublicShowtimeQuery, parsePublicSlug } from './catalogValidation.js';
import { HttpError } from './validation.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export function createPublicCatalogRouter(repository, { now = Date.now } = {}) {
  const router = express.Router();

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
  router.get('/movies/:slug', async (req, res) => {
    const movie = requireMovie(await repository.findPublicMovieBySlug(parsePublicSlug(req.params.slug)));
    res.status(200).json({ movie });
  });
  return router;
}
