import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasPermission, hasBranchScope, requirePermission } from '../src/permissions.js';

test('permission checks allow only listed permissions and reject everything else', () => {
  const authorization = { permissions: ['movie.create'], branchAssignments: [{ branchId: '3' }] };
  assert.equal(hasPermission(authorization, 'movie.create'), true);
  assert.equal(hasPermission(authorization, 'movie.update'), false);
  assert.equal(hasPermission(undefined, 'movie.create'), false);
  assert.equal(hasPermission({}, 'movie.create'), false);
  assert.equal(hasBranchScope(authorization, 3), true);
  assert.equal(hasBranchScope(authorization, '3'), true);
  assert.equal(hasBranchScope(authorization, 4), false);
  assert.equal(hasBranchScope(undefined, 3), false);
});

test('requirePermission passes authorized requests and rejects the rest with 403', async () => {
  const middleware = requirePermission('showtime.create');
  const nextErrors = [];
  const next = (error) => nextErrors.push(error);
  middleware({ session: { authorization: { permissions: ['showtime.create'] } } }, {}, next);
  assert.deepEqual(nextErrors, [undefined]);
  middleware({ session: { authorization: { permissions: ['booking.view'] } } }, {}, next);
  assert.equal(nextErrors.length, 2);
  assert.equal(nextErrors[1].status, 403);
  assert.equal(nextErrors[1].code, 'PERMISSION_DENIED');
  middleware({}, {}, next);
  assert.equal(nextErrors[2].status, 403);
});
