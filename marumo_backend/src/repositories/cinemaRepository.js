import sql from 'mssql';
import { HttpError } from '../utils/validation.js';

const BRANCH_COLUMNS = {
  code: ['branch_code', sql.VarChar(20)],
  name: ['branch_name', sql.NVarChar(150)],
  phone: ['phone', sql.VarChar(20)],
  email: ['email', sql.NVarChar(255)],
  description: ['description', sql.NVarChar(1000)],
  status: ['status', sql.VarChar(20)],
};
const AUDITORIUM_COLUMNS = {
  code: ['auditorium_code', sql.VarChar(30)],
  name: ['auditorium_name', sql.NVarChar(100)],
  roomTypeId: ['room_type_id', sql.Int],
  description: ['description', sql.NVarChar(500)],
  screenWidth: ['screen_width', sql.Decimal(8, 2)],
  screenHeight: ['screen_height', sql.Decimal(8, 2)],
  isActive: ['is_active', sql.Bit],
};
const BRANCH_SELECT = `CONVERT(varchar(20), b.branch_id) AS id, b.branch_code AS code,
  b.branch_name AS name, b.phone, b.email, b.description, address.street_address AS address,
  address.address_detail AS addressDetail, province.unit_name AS city, address.latitude, address.longitude`;
const BRANCH_ADDRESS = `OUTER APPLY (SELECT TOP (1) ba.street_address, ba.address_detail,
    ba.ward_unit_id, ba.latitude, ba.longitude FROM dbo.branch_addresses ba
    WHERE ba.branch_id = b.branch_id ORDER BY ba.is_primary DESC, ba.address_id) address
  LEFT JOIN dbo.administrative_units ward ON ward.unit_id = address.ward_unit_id
  LEFT JOIN dbo.administrative_units province ON province.unit_id = ward.parent_unit_id`;
const AUDITORIUM_SELECT = `CONVERT(varchar(20), a.auditorium_id) AS id,
  CONVERT(varchar(20), a.branch_id) AS branchId, a.auditorium_code AS code, a.auditorium_name AS name,
  a.room_type_id AS roomTypeId, rt.type_name AS roomTypeName, a.description,
  a.screen_width AS screenWidth, a.screen_height AS screenHeight, a.is_active AS isActive,
  a.created_at AS createdAt, a.updated_at AS updatedAt,
  (SELECT af.format_id AS id FROM dbo.auditorium_screening_formats af
    WHERE af.auditorium_id = a.auditorium_id AND af.is_active = 1 ORDER BY af.format_id FOR JSON PATH) AS formats,
  (SELECT COUNT(*) FROM dbo.seats se JOIN dbo.seat_types ty ON ty.seat_type_id = se.seat_type_id AND ty.is_active = 1
    JOIN dbo.seat_layout_versions lv ON lv.auditorium_id = se.auditorium_id AND lv.version_status = 'PUBLISHED'
    JOIN dbo.seat_layout_version_seats ls ON ls.layout_version_id = lv.layout_version_id AND ls.seat_id = se.seat_id AND ls.is_enabled = 1
    WHERE se.auditorium_id = a.auditorium_id AND se.seat_status = 'ACTIVE') AS capacity`;

function scope(permission, branch = null, globalOnly = false) {
  const assignment = globalOnly ? '' : `OR (r.scope_type = 'BRANCH' AND EXISTS (
    SELECT 1 FROM dbo.user_branch_assignments ua WHERE ua.user_id = ur.user_id AND ua.role_id = ur.role_id
      ${branch ? `AND ua.branch_id = ${branch}` : ''}
      AND ua.status = 'ACTIVE' AND ua.starts_at <= @at AND (ua.ends_at IS NULL OR ua.ends_at > @at)))`;
  return `EXISTS (SELECT 1 FROM dbo.user_roles ur JOIN dbo.roles r ON r.role_id = ur.role_id
    JOIN dbo.role_permissions rp ON rp.role_id = ur.role_id JOIN dbo.permissions p ON p.permission_id = rp.permission_id
    WHERE ur.user_id = @actorUserId AND ur.revoked_at IS NULL AND r.is_active = 1
      AND p.permission_code = '${permission}' AND (r.scope_type = 'GLOBAL' ${assignment}))`;
}

function mapBranch(row, admin = false) {
  if (!row) return null;
  const branch = { ...row, latitude: row.latitude === null ? null : Number(row.latitude), longitude: row.longitude === null ? null : Number(row.longitude) };
  if (admin) {
    branch.createdAt = row.createdAt.toISOString();
    branch.updatedAt = row.updatedAt.toISOString();
  }
  return branch;
}

function mapAuditorium(row) {
  if (!row) return null;
  const { formats, ...auditorium } = row;
  return { ...auditorium, isActive: Boolean(row.isActive), formatIds: JSON.parse(formats).map((format) => format.id),
    screenWidth: row.screenWidth === null ? null : Number(row.screenWidth), screenHeight: row.screenHeight === null ? null : Number(row.screenHeight),
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

function notFound(entity) {
  return new HttpError(404, `${entity}_NOT_FOUND`, `${entity === 'BRANCH' ? 'Branch' : 'Auditorium'} not found.`);
}

function bind(request, input, columns) {
  for (const [key, value] of Object.entries(input)) request.input(key, columns[key][1], value);
  return request;
}

export function createSqlCinemaRepository(pool) {
  function request(userId, at, transaction = null) {
    return (transaction ? new sql.Request(transaction) : pool.request())
      .input('actorUserId', sql.BigInt, userId).input('at', sql.DateTime2, new Date(at));
  }

  async function write(entity, operation) {
    const transaction = new sql.Transaction(pool);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const result = await operation(transaction);
      await transaction.commit();
      return result;
    } catch (error) {
      await transaction.rollback().catch(() => {});
      if ([2601, 2627].includes(error.number)) throw new HttpError(409, `${entity}_CONFLICT`, 'The code already exists.');
      if ([1205, 1222].includes(error.number)) throw new HttpError(409, 'CINEMA_BUSY', 'Cinema data is being updated. Reload and try again.');
      throw error;
    }
  }

  async function readBranch({ userId, branchId }, at, transaction = null, writable = false) {
    const row = (await request(userId, at, transaction).input('branchId', sql.BigInt, branchId)
      .query(`SELECT ${BRANCH_SELECT}, b.status, b.created_at AS createdAt, b.updated_at AS updatedAt
        FROM dbo.branches b ${writable ? 'WITH (UPDLOCK, HOLDLOCK)' : ''} ${BRANCH_ADDRESS}
        WHERE b.branch_id = @branchId AND ${scope('branch.view', 'b.branch_id')}
          ${writable ? `AND ${scope('branch.update', 'b.branch_id')}` : ''};`)).recordset[0];
    return mapBranch(row, true);
  }

  async function readAuditorium({ userId, branchId, auditoriumId }, at, transaction = null) {
    const row = (await request(userId, at, transaction).input('branchId', sql.BigInt, branchId).input('auditoriumId', sql.BigInt, auditoriumId)
      .query(`SELECT ${AUDITORIUM_SELECT} FROM dbo.auditoriums a ${transaction ? 'WITH (UPDLOCK, HOLDLOCK)' : ''}
        JOIN dbo.room_types rt ON rt.room_type_id = a.room_type_id
        WHERE a.auditorium_id = @auditoriumId AND a.branch_id = @branchId AND ${scope('branch.view', 'a.branch_id')};`)).recordset[0];
    return mapAuditorium(row);
  }

  async function audit(transaction, userId, branchId, action, entity, oldValue, newValue) {
    await new sql.Request(transaction).input('actorUserId', sql.BigInt, userId).input('branchId', sql.BigInt, branchId)
      .input('action', sql.VarChar(50), action).input('entity', sql.VarChar(100), entity)
      .input('entityId', sql.NVarChar(100), newValue.id).input('oldValue', sql.NVarChar(sql.MAX), oldValue === null ? null : JSON.stringify(oldValue))
      .input('newValue', sql.NVarChar(sql.MAX), JSON.stringify(newValue))
      .query(`INSERT dbo.audit_logs (user_id, branch_id, action_code, entity_type, entity_id, old_values, new_values)
        VALUES (@actorUserId, @branchId, @action, @entity, @entityId, @oldValue, @newValue);`);
  }

  async function futureShowtimes(transaction, branchId, auditoriumId, at) {
    return (await new sql.Request(transaction).input('branchId', sql.BigInt, branchId)
      .input('auditoriumId', sql.BigInt, auditoriumId).input('at', sql.DateTime2, new Date(at))
      .query(`SELECT TOP (1) 1 AS found FROM dbo.showtimes s WITH (UPDLOCK, HOLDLOCK)
        JOIN dbo.showtime_statuses st ON st.status_id = s.status_id
        WHERE s.branch_id = @branchId AND (@auditoriumId IS NULL OR s.auditorium_id = @auditoriumId)
          AND s.end_at > @at AND st.status_code NOT IN ('CANCELLED', 'COMPLETED');`)).recordset.length > 0;
  }

  async function validateRoomReferences(transaction, input) {
    if ('roomTypeId' in input) {
      const found = await new sql.Request(transaction).input('roomTypeId', sql.Int, input.roomTypeId)
        .query('SELECT room_type_id FROM dbo.room_types WHERE room_type_id = @roomTypeId AND is_active = 1;');
      if (!found.recordset.length) throw new HttpError(400, 'INVALID_INPUT', 'roomTypeId must reference an active room type.');
    }
    if ('formatIds' in input) {
      const query = new sql.Request(transaction);
      input.formatIds.forEach((id, index) => query.input(`format${index}`, sql.Int, id));
      const found = await query.query(`SELECT format_id FROM dbo.screening_formats
        WHERE format_id IN (${input.formatIds.map((_, index) => `@format${index}`).join(',')}) AND is_active = 1;`);
      if (found.recordset.length !== input.formatIds.length) throw new HttpError(400, 'INVALID_INPUT', 'formatIds must reference active formats.');
    }
  }

  async function saveFormats(transaction, auditoriumId, formatIds) {
    await new sql.Request(transaction).input('auditoriumId', sql.BigInt, auditoriumId)
      .query('UPDATE dbo.auditorium_screening_formats SET is_active = 0 WHERE auditorium_id = @auditoriumId;');
    for (const formatId of formatIds) {
      await new sql.Request(transaction).input('auditoriumId', sql.BigInt, auditoriumId).input('formatId', sql.Int, formatId)
        .query(`UPDATE dbo.auditorium_screening_formats SET is_active = 1 WHERE auditorium_id = @auditoriumId AND format_id = @formatId;
          IF @@ROWCOUNT = 0 INSERT dbo.auditorium_screening_formats (auditorium_id, format_id) VALUES (@auditoriumId, @formatId);`);
    }
  }

  return {
    async hasCinemaPermission(userId, permission, at) {
      if (!['branch.view', 'branch.update'].includes(permission)) return false;
      return (await request(userId, at).query(`SELECT 1 AS allowed WHERE ${scope(permission)};`)).recordset.length > 0;
    },
    async listPublicBranches({ limit, after }) {
      return (await pool.request().input('limit', sql.Int, limit).input('after', sql.BigInt, after)
        .query(`SELECT TOP (@limit) ${BRANCH_SELECT} FROM dbo.branches b ${BRANCH_ADDRESS}
          WHERE b.status = 'ACTIVE' AND b.branch_id > @after ORDER BY b.branch_id;`)).recordset.map((row) => mapBranch(row));
    },
    async findPublicBranch(code) {
      const row = (await pool.request().input('code', sql.VarChar(20), code)
        .query(`SELECT ${BRANCH_SELECT} FROM dbo.branches b ${BRANCH_ADDRESS}
          WHERE b.branch_code = @code AND b.status = 'ACTIVE';`)).recordset[0];
      return mapBranch(row);
    },
    async listBranchShowtimes({ branchId, limit, after, from, to, movieId = null }, at) {
      const result = await pool.request().input('branchId', sql.BigInt, branchId).input('limit', sql.Int, limit)
        .input('after', sql.BigInt, after).input('from', sql.DateTime2, from).input('to', sql.DateTime2, to)
        .input('movieId', sql.BigInt, movieId).input('at', sql.DateTime2, new Date(at))
        .query(`SELECT TOP (@limit) CONVERT(varchar(20), s.showtime_id) AS id,
          CONVERT(varchar(20), m.movie_id) AS movieId, m.title AS movieTitle, m.slug AS movieSlug,
          CONVERT(varchar(20), mv.movie_version_id) AS movieVersionId, mv.version_name AS versionName,
          CONVERT(varchar(20), b.branch_id) AS branchId, b.branch_code AS branchCode, b.branch_name AS branchName,
          CONVERT(varchar(20), a.auditorium_id) AS auditoriumId, a.auditorium_name AS auditoriumName,
          f.format_code AS formatCode, f.format_name AS formatName, s.start_at AS startAt, s.end_at AS endAt,
          s.base_ticket_price AS baseTicketPrice, st.status_code AS status,
          CONVERT(bit, CASE WHEN st.status_code IN ('SCHEDULED', 'OPEN_FOR_BOOKING')
            AND (s.sales_open_at IS NULL OR s.sales_open_at <= @at) AND (s.sales_close_at IS NULL OR s.sales_close_at > @at)
            AND EXISTS (SELECT 1 FROM dbo.showtime_seats ss WHERE ss.showtime_id = s.showtime_id AND ss.seat_status = 'AVAILABLE')
            THEN 1 ELSE 0 END) AS isBookable
          FROM dbo.showtimes s JOIN dbo.branches b ON b.branch_id = s.branch_id AND b.status = 'ACTIVE'
          JOIN dbo.auditoriums a ON a.auditorium_id = s.auditorium_id AND a.branch_id = s.branch_id AND a.is_active = 1
          JOIN dbo.showtime_statuses st ON st.status_id = s.status_id
          JOIN dbo.movie_versions mv ON mv.movie_version_id = s.movie_version_id AND mv.is_active = 1
          JOIN dbo.movies m ON m.movie_id = mv.movie_id AND m.status IN ('NOW_SHOWING', 'COMING_SOON', 'PUBLISHED')
          JOIN dbo.screening_formats f ON f.format_id = mv.format_id AND f.is_active = 1
          WHERE s.branch_id = @branchId AND s.showtime_id > @after AND s.start_at >= @from AND s.start_at < @to
            AND s.start_at > @at AND st.status_code IN ('SCHEDULED', 'OPEN_FOR_BOOKING', 'SOLD_OUT')
            AND (@movieId IS NULL OR m.movie_id = @movieId) ORDER BY s.showtime_id;`);
      return result.recordset.map((row) => ({ ...row, startAt: row.startAt.toISOString(), endAt: row.endAt.toISOString(),
        baseTicketPrice: Number(row.baseTicketPrice), isBookable: Boolean(row.isBookable) }));
    },
    async cinemaOptions() {
      const result = await pool.request().query(`SELECT room_type_id AS id, type_code AS code, type_name AS name
        FROM dbo.room_types WHERE is_active = 1 ORDER BY room_type_id;
        SELECT format_id AS id, format_code AS code, format_name AS name
        FROM dbo.screening_formats WHERE is_active = 1 ORDER BY format_id;`);
      return { roomTypes: result.recordsets[0], formats: result.recordsets[1] };
    },
    async listAdminBranches({ userId, limit, after, status = null, branchId = null }, at) {
      const result = await request(userId, at).input('limit', sql.Int, limit).input('after', sql.BigInt, after)
        .input('status', sql.VarChar(20), status).input('branchId', sql.BigInt, branchId)
        .query(`SELECT TOP (@limit) ${BRANCH_SELECT}, b.status, b.created_at AS createdAt, b.updated_at AS updatedAt
          FROM dbo.branches b ${BRANCH_ADDRESS} WHERE ${scope('branch.view', 'b.branch_id')}
            AND b.branch_id > @after AND (@status IS NULL OR b.status = @status)
            AND (@branchId IS NULL OR b.branch_id = @branchId) ORDER BY b.branch_id;`);
      return result.recordset.map((row) => mapBranch(row, true));
    },
    findAdminBranch: readBranch,
    async listAdminAuditoriums({ userId, branchId, limit, after, isActive = null }, at) {
      const result = await request(userId, at).input('branchId', sql.BigInt, branchId).input('limit', sql.Int, limit)
        .input('after', sql.BigInt, after).input('isActive', sql.Bit, isActive)
        .query(`SELECT TOP (@limit) ${AUDITORIUM_SELECT} FROM dbo.auditoriums a
          JOIN dbo.room_types rt ON rt.room_type_id = a.room_type_id
          WHERE a.branch_id = @branchId AND ${scope('branch.view', 'a.branch_id')}
            AND a.auditorium_id > @after AND (@isActive IS NULL OR a.is_active = @isActive) ORDER BY a.auditorium_id;`);
      return result.recordset.map(mapAuditorium);
    },
    findAdminAuditorium: readAuditorium,
    createBranch({ userId, input }, at) {
      return write('BRANCH', async (transaction) => {
        const permission = await request(userId, at, transaction)
          .query(`SELECT 1 AS allowed WHERE ${scope('branch.view', null, true)} AND ${scope('branch.update', null, true)};`);
        if (!permission.recordset.length) throw new HttpError(403, 'PERMISSION_DENIED', 'Global branch.view and branch.update are required.');
        const keys = Object.keys(input);
        const inserted = await bind(request(userId, at, transaction), input, BRANCH_COLUMNS)
          .query(`INSERT dbo.branches (${keys.map((key) => BRANCH_COLUMNS[key][0]).join(',')})
            OUTPUT CONVERT(varchar(20), inserted.branch_id) AS id VALUES (${keys.map((key) => `@${key}`).join(',')});`);
        const branchId = inserted.recordset[0].id;
        const branch = await readBranch({ userId, branchId }, at, transaction);
        await audit(transaction, userId, branchId, 'BRANCH_CREATE', 'branches', null, branch);
        return branch;
      });
    },
    updateBranch({ userId, branchId, input }, at) {
      return write('BRANCH', async (transaction) => {
        const previous = await readBranch({ userId, branchId }, at, transaction, true);
        if (!previous) throw notFound('BRANCH');
        if (previous.status === 'ACTIVE' && 'status' in input && input.status !== 'ACTIVE' && await futureShowtimes(transaction, branchId, null, at)) {
          throw new HttpError(409, 'BRANCH_IN_USE', 'The branch has unfinished showtimes.');
        }
        const keys = Object.keys(input);
        await bind(request(userId, at, transaction).input('branchId', sql.BigInt, branchId), input, BRANCH_COLUMNS)
          .query(`UPDATE dbo.branches SET ${keys.map((key) => `${BRANCH_COLUMNS[key][0]} = @${key}`).join(',')},
            updated_at = SYSUTCDATETIME() WHERE branch_id = @branchId;`);
        const branch = await readBranch({ userId, branchId }, at, transaction);
        await audit(transaction, userId, branchId, 'BRANCH_UPDATE', 'branches', previous, branch);
        return branch;
      });
    },
    createAuditorium({ userId, branchId, input }, at) {
      return write('AUDITORIUM', async (transaction) => {
        if (!await readBranch({ userId, branchId }, at, transaction, true)) throw notFound('BRANCH');
        await validateRoomReferences(transaction, input);
        const { formatIds, ...columns } = input;
        const keys = Object.keys(columns);
        const inserted = await bind(request(userId, at, transaction).input('branchId', sql.BigInt, branchId), columns, AUDITORIUM_COLUMNS)
          .query(`INSERT dbo.auditoriums (branch_id, ${keys.map((key) => AUDITORIUM_COLUMNS[key][0]).join(',')})
            OUTPUT CONVERT(varchar(20), inserted.auditorium_id) AS id VALUES (@branchId, ${keys.map((key) => `@${key}`).join(',')});`);
        const auditoriumId = inserted.recordset[0].id;
        await saveFormats(transaction, auditoriumId, formatIds);
        const auditorium = await readAuditorium({ userId, branchId, auditoriumId }, at, transaction);
        await audit(transaction, userId, branchId, 'AUDITORIUM_CREATE', 'auditoriums', null, auditorium);
        return auditorium;
      });
    },
    updateAuditorium({ userId, branchId, auditoriumId, input }, at) {
      return write('AUDITORIUM', async (transaction) => {
        if (!await readBranch({ userId, branchId }, at, transaction, true)) throw notFound('BRANCH');
        const previous = await readAuditorium({ userId, branchId, auditoriumId }, at, transaction);
        if (!previous) throw notFound('AUDITORIUM');
        if (previous.isActive && input.isActive === false && await futureShowtimes(transaction, branchId, auditoriumId, at)) {
          throw new HttpError(409, 'AUDITORIUM_IN_USE', 'The auditorium has unfinished showtimes.');
        }
        const changesConfiguration = ('roomTypeId' in input && input.roomTypeId !== previous.roomTypeId)
          || ('formatIds' in input && JSON.stringify(input.formatIds) !== JSON.stringify(previous.formatIds));
        if (changesConfiguration) {
          const shows = await new sql.Request(transaction).input('auditoriumId', sql.BigInt, auditoriumId)
            .query('SELECT TOP (1) showtime_id FROM dbo.showtimes WITH (UPDLOCK, HOLDLOCK) WHERE auditorium_id = @auditoriumId;');
          if (shows.recordset.length) throw new HttpError(409, 'AUDITORIUM_IN_USE', 'Room type and formats cannot change after showtimes exist.');
        }
        await validateRoomReferences(transaction, input);
        const { formatIds, ...columns } = input;
        const keys = Object.keys(columns);
        await bind(request(userId, at, transaction).input('auditoriumId', sql.BigInt, auditoriumId), columns, AUDITORIUM_COLUMNS)
          .query(`UPDATE dbo.auditoriums SET ${keys.map((key) => `${AUDITORIUM_COLUMNS[key][0]} = @${key},`).join('')}
            updated_at = SYSUTCDATETIME() WHERE auditorium_id = @auditoriumId;`);
        if (formatIds) await saveFormats(transaction, auditoriumId, formatIds);
        const auditorium = await readAuditorium({ userId, branchId, auditoriumId }, at, transaction);
        await audit(transaction, userId, branchId, 'AUDITORIUM_UPDATE', 'auditoriums', previous, auditorium);
        return auditorium;
      });
    },
  };
}
