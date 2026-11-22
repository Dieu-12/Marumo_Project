import express from 'express';
import { createSessionMiddleware } from './session.js';

export function createLoyaltyRouter(repository, { now = Date.now, sessionTokens } = {}) {
  const router = express.Router();
  const requireSession = createSessionMiddleware(repository, sessionTokens, now);

  router.get('/', requireSession, async (req, res) => {
    const loyalty = await repository.getLoyaltyAccount({ userId: req.session.userId });
    res.status(200).json(loyalty);
  });

  return router;
}
