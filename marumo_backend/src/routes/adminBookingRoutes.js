import express from 'express';
import { HttpError } from '../utils/validation.js';
import { createSessionMiddleware, createWriteProof } from '../middlewares/session.js';
import { createAdminBookingController } from '../controllers/adminBookingController.js';

export function createAdminBookingRouter(repository, { now = Date.now, allowedOrigins = [], sessionTokens } = {}) {
  const router = express.Router();
  router.use(createSessionMiddleware(repository, sessionTokens, now));
  const controller = createAdminBookingController(repository, { now });
  const writeProof = createWriteProof(allowedOrigins);
  function requireBookingPermission(permission) {
    return (req, _res, next) => {
      const authorization = req.session.authorization;
      if (authorization.globalPermissions?.includes(permission) || authorization.branchAssignments?.some((assignment) => assignment.permissions?.includes(permission))) return next();
      next(new HttpError(403, 'PERMISSION_DENIED', 'You do not have permission for this action.'));
    };
  }
  router.use(requireBookingPermission('booking.view'));
  router.get('/options', controller.options);
  router.get('/', controller.list);
  router.get('/:bookingId', controller.detail);
  router.post('/:bookingId/cancel', requireBookingPermission('booking.cancel'), writeProof, controller.cancel);
  return router;
}
