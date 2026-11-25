import express from 'express';
import { createSessionMiddleware } from '../middlewares/session.js';
import { createPublicCatalogController } from '../controllers/publicCatalogController.js';

export function createPublicCatalogRouter(repository, { now = Date.now, sessionTokens } = {}) {
  const router = express.Router();
  const requireSession = createSessionMiddleware(repository, sessionTokens, now);
  const controller = createPublicCatalogController(repository, { now });

  router.get('/movies', controller.listMovies);
  router.get('/movies/:slug/showtimes', controller.showtimes);
  router.get('/showtimes/:showtimeId/seats', requireSession, controller.seats);
  router.get('/movies/:slug', controller.movie);
  return router;
}
