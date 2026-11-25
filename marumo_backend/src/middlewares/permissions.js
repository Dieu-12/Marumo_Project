import { HttpError } from '../utils/validation.js';

export function hasPermission(authorization, permissionCode) {
  return authorization?.permissions?.includes(permissionCode) ?? false;
}

export function hasBranchScope(authorization, branchId) {
  return authorization?.branchAssignments?.some((assignment) => assignment.branchId === String(branchId)) ?? false;
}

export function requirePermission(permissionCode) {
  return (req, _res, next) => {
    if (hasPermission(req.session?.authorization, permissionCode)) return next();
    next(new HttpError(403, 'PERMISSION_DENIED', 'You do not have permission for this action.'));
  };
}
