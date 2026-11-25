import express from 'express';
import { createSessionMiddleware } from '../middlewares/session.js';
import { createLoyaltyController } from '../controllers/loyaltyController.js';

export function createLoyaltyRouter(repository, { now = Date.now, sessionTokens } = {}) {
  const router = express.Router();
  const requireSession = createSessionMiddleware(repository, sessionTokens, now);
  const controller = createLoyaltyController(repository);

  router.get('/', requireSession, controller.getAccount);
  return router;
}
