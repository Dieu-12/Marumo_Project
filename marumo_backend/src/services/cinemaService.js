import { HttpError } from '../utils/validation.js';

export function createCinemaService(repository, { now = Date.now } = {}) {
  function requireBranch(branch) {
    if (!branch) throw new HttpError(404, 'BRANCH_NOT_FOUND', 'Branch not found.');
    return branch;
  }

  return {
    listPublic(query) {
      return repository.listPublicBranches({ ...query, limit: query.limit + 1 });
    },
    async publicBranch(code) {
      return requireBranch(await repository.findPublicBranch(code));
    },
    async publicShowtimes(code, query, at) {
      const branch = requireBranch(await repository.findPublicBranch(code));
      return repository.listBranchShowtimes({ ...query, branchId: branch.id, limit: query.limit + 1 }, at);
    },
    options() {
      return repository.cinemaOptions();
    },
    list(userId, query) {
      return repository.listAdminBranches({ userId, ...query, limit: query.limit + 1 }, now());
    },
    async branch(userId, branchId) {
      return requireBranch(await repository.findAdminBranch({ userId, branchId }, now()));
    },
    async auditoriums(userId, branchId, query) {
      const at = now();
      requireBranch(await repository.findAdminBranch({ userId, branchId }, at));
      return repository.listAdminAuditoriums({ userId, branchId, ...query, limit: query.limit + 1 }, at);
    },
    async auditorium(userId, branchId, auditoriumId) {
      const auditorium = await repository.findAdminAuditorium({ userId, branchId, auditoriumId }, now());
      if (!auditorium) throw new HttpError(404, 'AUDITORIUM_NOT_FOUND', 'Auditorium not found.');
      return auditorium;
    },
    createBranch(userId, input) {
      return repository.createBranch({ userId, input }, now());
    },
    updateBranch(userId, branchId, input) {
      return repository.updateBranch({ userId, branchId, input }, now());
    },
    createAuditorium(userId, branchId, input) {
      return repository.createAuditorium({ userId, branchId, input }, now());
    },
    updateAuditorium(userId, branchId, auditoriumId, input) {
      return repository.updateAuditorium({ userId, branchId, auditoriumId, input }, now());
    },
  };
}
