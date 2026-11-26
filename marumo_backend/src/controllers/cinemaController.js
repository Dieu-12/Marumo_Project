import { createCinemaService } from '../services/cinemaService.js';
import { objectFields } from '../utils/catalogValidation.js';
import { parseCinemaId, parseBranchCode, parseBranchQuery, parseAuditoriumQuery, parseBranchShowtimeQuery, parseBranchInput, parseAuditoriumInput } from '../utils/cinemaValidation.js';

function paginated(res, key, rows, limit) {
  const items = rows.slice(0, limit);
  res.json({ [key]: items, nextAfter: rows.length > limit ? items.at(-1).id : null });
}

export function createCinemaController(repository, { now = Date.now } = {}) {
  const service = createCinemaService(repository, { now });
  return {
    async listPublic(req, res) {
      const query = parseBranchQuery(req.query);
      paginated(res, 'branches', await service.listPublic(query), query.limit);
    },
    async publicBranch(req, res) {
      objectFields(req.query, []);
      res.json({ branch: await service.publicBranch(parseBranchCode(req.params.branchCode)) });
    },
    async publicShowtimes(req, res) {
      const at = now();
      const query = parseBranchShowtimeQuery(req.query, at);
      paginated(res, 'showtimes', await service.publicShowtimes(parseBranchCode(req.params.branchCode), query, at), query.limit);
    },
    async options(req, res) {
      objectFields(req.query, []);
      res.json(await service.options());
    },
    async list(req, res) {
      const query = parseBranchQuery(req.query, { admin: true });
      paginated(res, 'branches', await service.list(req.session.userId, query), query.limit);
    },
    async branch(req, res) {
      objectFields(req.query, []);
      res.json({ branch: await service.branch(req.session.userId, parseCinemaId(req.params.branchId)) });
    },
    async auditoriums(req, res) {
      const query = parseAuditoriumQuery(req.query);
      paginated(res, 'auditoriums', await service.auditoriums(req.session.userId, parseCinemaId(req.params.branchId), query), query.limit);
    },
    async auditorium(req, res) {
      objectFields(req.query, []);
      res.json({ auditorium: await service.auditorium(req.session.userId, parseCinemaId(req.params.branchId), parseCinemaId(req.params.auditoriumId)) });
    },
    async createBranch(req, res) {
      objectFields(req.query, []);
      res.status(201).json({ branch: await service.createBranch(req.session.userId, parseBranchInput(req.body)) });
    },
    async updateBranch(req, res) {
      objectFields(req.query, []);
      res.json({ branch: await service.updateBranch(req.session.userId, parseCinemaId(req.params.branchId), parseBranchInput(req.body, { partial: true })) });
    },
    async createAuditorium(req, res) {
      objectFields(req.query, []);
      res.status(201).json({ auditorium: await service.createAuditorium(req.session.userId, parseCinemaId(req.params.branchId), parseAuditoriumInput(req.body)) });
    },
    async updateAuditorium(req, res) {
      objectFields(req.query, []);
      res.json({ auditorium: await service.updateAuditorium(req.session.userId, parseCinemaId(req.params.branchId), parseCinemaId(req.params.auditoriumId), parseAuditoriumInput(req.body, { partial: true })) });
    },
  };
}
