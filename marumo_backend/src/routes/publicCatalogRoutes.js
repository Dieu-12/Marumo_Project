import express from 'express';
import { createSessionMiddleware } from '../middlewares/session.js';
import { createPublicCatalogController } from '../controllers/publicCatalogController.js';
import { createCinemaController } from '../controllers/cinemaController.js';

export function createPublicCatalogRouter(repository, { now = Date.now, sessionTokens } = {}) {
  const router = express.Router();
  const requireSession = createSessionMiddleware(repository, sessionTokens, now);
  const controller = createPublicCatalogController(repository, { now });
  const cinema = createCinemaController(repository, { now });

  router.get('/branches', cinema.listPublic);
  router.get('/branches/:branchCode/showtimes', cinema.publicShowtimes);
  router.get('/branches/:branchCode', cinema.publicBranch);
  router.get('/movies', controller.listMovies);
  router.get('/movies/:slug/showtimes', controller.showtimes);
  router.get('/showtimes/:showtimeId/seats', requireSession, controller.seats);
  router.get('/movies/:slug', controller.movie);
  return router;
}
