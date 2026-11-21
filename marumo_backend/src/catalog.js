import express from 'express';
import { HttpError } from './validation.js';
import { createSessionMiddleware, validateCsrfProof } from './session.js';
import { parseMovieInput, parseMovieId, parseMovieQuery } from './catalogValidation.js';

export function createCatalogRouter(repository, { now = Date.now, allowedOrigins = [] } = {}) {
  const router = express.Router();
  router.use(createSessionMiddleware(repository, now));

  function requireGlobalPermission(...permissions) {
    return async (req, _res, next) => {
      try {
        for (const permission of permissions) {
          if (await repository.hasGlobalPermission(req.session.userId, permission)) return next();
        }
        throw new HttpError(403, 'PERMISSION_DENIED', 'You do not have permission for this action.');
      } catch (error) {
        next(error);
      }
    };
  }

  function requireWriteProof(req, _res, next) {
    try {
      if (req.headers.origin && !allowedOrigins.includes(req.headers.origin)) {
        throw new HttpError(403, 'ORIGIN_INVALID', 'The request origin is not allowed.');
      }
      validateCsrfProof(req);
      next();
    } catch (error) {
      next(error);
    }
  }

  function requireMovie(movie) {
    if (!movie) throw new HttpError(404, 'MOVIE_NOT_FOUND', 'Movie not found.');
    return movie;
  }

  router.get('/movies', requireGlobalPermission('movie.create', 'movie.update'), async (req, res) => {
    const query = parseMovieQuery(req.query);
    const rows = await repository.listMovies({ ...query, limit: query.limit + 1 });
    const movies = rows.slice(0, query.limit);
    const nextAfter = rows.length > query.limit ? movies[movies.length - 1].id : null;
    res.status(200).json({ movies, nextAfter });
  });
  router.get('/movies/:movieId', requireGlobalPermission('movie.create', 'movie.update'), async (req, res) => {
    const movie = requireMovie(await repository.findMovie(parseMovieId(req.params.movieId)));
    res.status(200).json({ movie });
  });
  router.post('/movies', requireGlobalPermission('movie.create'), requireWriteProof, async (req, res) => {
    const movie = await repository.createMovie(parseMovieInput(req.body), now());
    res.status(201).location(`/admin/movies/${movie.id}`).json({ movie });
  });
  router.patch('/movies/:movieId', requireGlobalPermission('movie.update'), requireWriteProof, async (req, res) => {
    const id = parseMovieId(req.params.movieId);
    const movie = requireMovie(await repository.updateMovie(id, parseMovieInput(req.body, { partial: true }), now()));
    res.status(200).json({ movie });
  });
  return router;
}
