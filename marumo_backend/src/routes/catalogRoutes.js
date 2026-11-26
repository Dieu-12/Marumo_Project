import express from 'express';
import { HttpError } from '../utils/validation.js';
import { createSessionMiddleware, createWriteProof } from '../middlewares/session.js';
import { createCatalogController } from '../controllers/catalogController.js';

export function createCatalogRouter(repository, { now = Date.now, allowedOrigins = [], sessionTokens } = {}) {
  const router = express.Router();
  const requireWriteProof = createWriteProof(allowedOrigins);
  router.use(createSessionMiddleware(repository, sessionTokens, now));
  const controller = createCatalogController(repository, { now });

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

  router.get('/catalog/options', requireGlobalPermission('movie.create', 'movie.update', 'showtime.create'), controller.catalogOptions);
  router.get('/movies', requireGlobalPermission('movie.create', 'movie.update', 'showtime.create'), controller.listMovies);
  router.get('/movies/:movieId', requireGlobalPermission('movie.create', 'movie.update', 'showtime.create'), controller.getMovie);
  router.post('/movies', requireGlobalPermission('movie.create'), requireWriteProof, controller.createMovie);
  router.patch('/movies/:movieId', requireGlobalPermission('movie.update'), requireWriteProof, controller.updateMovie);
  router.post('/movies/:movieId/versions', requireGlobalPermission('movie.create'), requireWriteProof, controller.createMovieVersion);
  router.get('/movies/:movieId/versions', requireGlobalPermission('movie.create', 'movie.update', 'showtime.create'), controller.listMovieVersions);
  router.post('/showtimes', requireGlobalPermission('showtime.create'), requireWriteProof, controller.createShowtime);
  router.get('/showtimes', requireGlobalPermission('showtime.create'), controller.listShowtimes);
  return router;
}
