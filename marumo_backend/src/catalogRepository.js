import sql from 'mssql';
import { HttpError } from './validation.js';
import { validateMovieWindow } from './catalogValidation.js';

const VERSION_COLUMNS = {
  versionCode: ['version_code', sql.VarChar(50)],
  versionName: ['version_name', sql.NVarChar(150)],
  audioLanguageId: ['audio_language_id', sql.SmallInt],
  subtitleLanguageId: ['subtitle_language_id', sql.SmallInt],
  formatId: ['format_id', sql.Int],
  isOriginalAudio: ['is_original_audio', sql.Bit],
  isActive: ['is_active', sql.Bit],
};

const SHOWTIME_COLUMNS = {
  showtimeCode: ['showtime_code', sql.VarChar(40)],
  branchId: ['branch_id', sql.BigInt],
  auditoriumId: ['auditorium_id', sql.BigInt],
  movieVersionId: ['movie_version_id', sql.BigInt],
  statusId: ['status_id', sql.SmallInt],
  startAt: ['start_at', sql.DateTime2],
  endAt: ['end_at', sql.DateTime2],
  preparationMinutes: ['preparation_minutes', sql.SmallInt],
  cleanupMinutes: ['cleanup_minutes', sql.SmallInt],
  baseTicketPrice: ['base_ticket_price', sql.Decimal(12, 2)],
  salesOpenAt: ['sales_open_at', sql.DateTime2],
  salesCloseAt: ['sales_close_at', sql.DateTime2],
  createdByUserId: ['created_by_user_id', sql.BigInt],
};

const MOVIE_COLUMNS = {
  movieCode: ['movie_code', sql.VarChar(30)],
  title: ['title', sql.NVarChar(250)],
  slug: ['slug', sql.VarChar(280)],
  durationMinutes: ['duration_minutes', sql.SmallInt],
  originalTitle: ['original_title', sql.NVarChar(250)],
  synopsis: ['synopsis', sql.NVarChar(sql.MAX)],
  releaseDate: ['release_date', sql.Date],
  endDate: ['end_date', sql.Date],
  productionYear: ['production_year', sql.SmallInt],
  productionCompany: ['production_company', sql.NVarChar(200)],
  directorDisplay: ['director_display', sql.NVarChar(250)],
  originalLanguageCode: ['original_language_code', sql.VarChar(10)],
  status: ['status', sql.VarChar(20)],
  isFeatured: ['is_featured', sql.Bit],
};

function movieProjection(prefix = '') {
  return [
    `CONVERT(varchar(20), ${prefix}movie_id) AS id`,
    ...Object.entries(MOVIE_COLUMNS).map(([key, [column]]) => `${prefix}${column} AS ${key}`),
    `${prefix}created_at AS createdAt`,
    `${prefix}updated_at AS updatedAt`,
  ].join(', ');
}

function mapMovie(row) {
  if (!row) return null;
  return {
    ...row,
    releaseDate: row.releaseDate?.toISOString().slice(0, 10) ?? null,
    endDate: row.endDate?.toISOString().slice(0, 10) ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function bindMovie(request, movie) {
  for (const [key, value] of Object.entries(movie)) {
    const [, type] = MOVIE_COLUMNS[key];
    const bound = (key === 'releaseDate' || key === 'endDate') && value !== null ? new Date(`${value}T00:00:00.000Z`) : value;
    request.input(key, type, bound);
  }
}

function conflict() {
  return new HttpError(409, 'MOVIE_CONFLICT', 'A movie with this movieCode or slug already exists.');
}

function movieWriteError(error) {
  if (error.number === 2601 || error.number === 2627) return conflict();
  if (error.number === 547 && error.message.includes('CK_movies_release_window')) {
    return new HttpError(400, 'INVALID_INPUT', 'endDate must not precede releaseDate.');
  }
  return error;
}

function versionConflict() {
  return new HttpError(409, 'MOVIE_VERSION_CONFLICT', 'A movie version with this versionCode already exists for this movie.');
}

function showtimeCodeTaken() {
  return new HttpError(409, 'SHOWTIME_CODE_TAKEN', 'A showtime with this showtimeCode already exists.');
}

function showtimeOverlap() {
  return new HttpError(409, 'SHOWTIME_CONFLICT', 'The auditorium already has a showtime overlapping this time window.');
}

function invalidReference(message) {
  return new HttpError(400, 'INVALID_INPUT', message);
}

const DATETIME_COLUMNS = { startAt: 'start_at', endAt: 'end_at', salesOpenAt: 'sales_open_at', salesCloseAt: 'sales_close_at' };

function toStamp(value) {
  return value === null ? null : value.toISOString().slice(0, 19);
}

export function showtimesConflict(a, b) {
  const at = (value) => Date.parse(`${value}Z`);
  const aStart = at(a.startAt) - a.preparationMinutes * 60000;
  const aEnd = at(a.endAt) + a.cleanupMinutes * 60000;
  const bStart = at(b.startAt) - b.preparationMinutes * 60000;
  const bEnd = at(b.endAt) + b.cleanupMinutes * 60000;
  return aStart < bEnd && bStart < aEnd;
}

function versionProjection(prefix = '') {
  return [
    `CONVERT(varchar(20), ${prefix}movie_version_id) AS id`,
    `CONVERT(varchar(20), ${prefix}movie_id) AS movieId`,
    ...Object.entries(VERSION_COLUMNS).map(([key, [column]]) => `${prefix}${column} AS ${key}`),
    `${prefix}created_at AS createdAt`,
  ].join(', ');
}

function mapMovieVersion(row) {
  if (!row) return null;
  return { ...row, createdAt: row.createdAt.toISOString() };
}

function bindVersion(request, version) {
  for (const [key, value] of Object.entries(version)) {
    request.input(key, VERSION_COLUMNS[key][1], value);
  }
}

function versionWriteError(error) {
  if (error.number === 2601 || error.number === 2627) return versionConflict();
  if (error.number === 547 && error.message.includes('FK_movie_versions_audio_language')) return invalidReference('audioLanguageId does not exist.');
  if (error.number === 547 && error.message.includes('FK_movie_versions_subtitle_language')) return invalidReference('subtitleLanguageId does not exist.');
  if (error.number === 547 && error.message.includes('FK_movie_versions_formats')) return invalidReference('formatId does not exist.');
  if (error.number === 547 && error.message.includes('FK_movie_versions_movies')) return invalidReference('movieId does not exist.');
  return error;
}

function showtimeProjection(prefix = '') {
  return [
    `CONVERT(varchar(20), ${prefix}showtime_id) AS id`,
    ...Object.entries(SHOWTIME_COLUMNS)
      .filter(([key]) => key !== 'statusId')
      .map(([key, [column]]) => (key.endsWith('Id') ? `CONVERT(varchar(20), ${prefix}${column}) AS ${key}` : `${prefix}${column} AS ${key}`)),
    `${prefix}status_code AS status`,
    `${prefix}created_at AS createdAt`,
    `${prefix}updated_at AS updatedAt`,
  ].join(', ');
}

function mapShowtime(row) {
  if (!row) return null;
  return {
    ...row,
    startAt: toStamp(row.startAt),
    endAt: toStamp(row.endAt),
    salesOpenAt: toStamp(row.salesOpenAt),
    salesCloseAt: toStamp(row.salesCloseAt),
    baseTicketPrice: Number(row.baseTicketPrice),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function bindShowtime(request, showtime) {
  for (const [key, value] of Object.entries(showtime)) {
    const [, type] = SHOWTIME_COLUMNS[key];
    const bound = key in DATETIME_COLUMNS && value !== null ? new Date(`${value}Z`) : value;
    request.input(key, type, bound);
  }
}

function showtimeWriteError(error) {
  if (error.number === 2601 || error.number === 2627) return showtimeCodeTaken();
  if (error.number === 547 && error.message.includes('CK_showtimes_sales_window')) return invalidReference('salesCloseAt must be after salesOpenAt.');
  if (error.number === 547 && error.message.includes('CK_showtimes_time_window')) return invalidReference('endAt must be after startAt.');
  if (error.number === 547) return invalidReference('A referenced record does not exist.');
  return error;
}

export function createMemoryMovieRepository() {
  const movies = new Map();
  const versions = new Map();
  const showtimes = [];
  let nextId = 1n;
  let nextVersionId = 1n;
  let nextShowtimeId = 1n;

  function unique(movie, ownId) {
    if ([...movies.values()].some((row) => row.id !== ownId && (row.movieCode.toLowerCase() === movie.movieCode.toLowerCase() || row.slug.toLowerCase() === movie.slug.toLowerCase()))) {
      throw conflict();
    }
  }

  function storeShowtime(input, createdByUserId, at) {
    const row = {
      ...input,
      id: String(nextShowtimeId++),
      createdByUserId,
      createdAt: new Date(at).toISOString(),
      updatedAt: new Date(at).toISOString(),
    };
    showtimes.push(row);
    return { ...row };
  }

  return {
    async createMovie(movie, at) {
      unique(movie);
      validateMovieWindow(movie);
      const row = { ...movie, id: String(nextId++), createdAt: new Date(at).toISOString(), updatedAt: new Date(at).toISOString() };
      movies.set(row.id, row);
      return { ...row };
    },
    async findMovie(id) {
      const row = movies.get(id);
      return row ? { ...row } : null;
    },
    async listMovies({ after, limit, status }) {
      return [...movies.values()]
        .filter((row) => BigInt(row.id) > BigInt(after) && (status === null || row.status === status))
        .slice(0, limit)
        .map((row) => ({ ...row }));
    },
    async updateMovie(id, patch, at) {
      const previous = movies.get(id);
      if (!previous) return null;
      const movie = { ...previous, ...patch, updatedAt: new Date(at).toISOString() };
      unique(movie, id);
      validateMovieWindow(movie);
      movies.set(id, movie);
      return { ...movie };
    },
    async createMovieVersion(movieId, version, at) {
      if ([...versions.values()].some((row) => row.movieId === movieId && row.versionCode.toLowerCase() === version.versionCode.toLowerCase())) {
        throw versionConflict();
      }
      const row = { ...version, id: String(nextVersionId++), movieId, createdAt: new Date(at).toISOString() };
      versions.set(row.id, row);
      return { ...row };
    },
    async createShowtime(input, createdByUserId, at) {
      if (!versions.get(input.movieVersionId)) throw invalidReference('movieVersionId does not exist.');
      if (showtimes.some((row) => row.showtimeCode.toLowerCase() === input.showtimeCode.toLowerCase())) throw showtimeCodeTaken();
      const clash = showtimes.find((row) => row.auditoriumId === input.auditoriumId && row.status !== 'CANCELLED' && showtimesConflict(row, input));
      if (clash) throw showtimeOverlap();
      return storeShowtime(input, createdByUserId, at);
    },
  };
}

export function createSqlMovieRepository(pool) {
  return {
    async createMovie(movie, _at) {
      const request = pool.request();
      bindMovie(request, movie);
      const keys = Object.keys(movie);
      try {
        const result = await request.query(
          `INSERT INTO dbo.movies (${keys.map((key) => MOVIE_COLUMNS[key][0]).join(', ')})
           OUTPUT ${movieProjection('inserted.')}
           VALUES (${keys.map((key) => `@${key}`).join(', ')});`,
        );
        return mapMovie(result.recordset[0]);
      } catch (error) {
        throw movieWriteError(error);
      }
    },
    async findMovie(id) {
      const result = await pool.request().input('id', sql.BigInt, id).query(
        `SELECT ${movieProjection()} FROM dbo.movies WHERE movie_id = @id;`,
      );
      return mapMovie(result.recordset[0]);
    },
    async listMovies({ after, limit, status }) {
      const result = await pool.request()
        .input('after', sql.BigInt, after)
        .input('limit', sql.Int, limit)
        .input('status', sql.VarChar(20), status)
        .query(`SELECT TOP (@limit) ${movieProjection()} FROM dbo.movies
          WHERE movie_id > @after AND (@status IS NULL OR status = @status)
          ORDER BY movie_id;`);
      return result.recordset.map(mapMovie);
    },
    async updateMovie(id, patch, _at) {
      const request = pool.request().input('id', sql.BigInt, id);
      bindMovie(request, patch);
      const assignments = Object.keys(patch).map((key) => `${MOVIE_COLUMNS[key][0]} = @${key}`);
      try {
        const result = await request.query(
          `UPDATE dbo.movies SET ${assignments.join(', ')}, updated_at = SYSUTCDATETIME()
           OUTPUT ${movieProjection('inserted.')} WHERE movie_id = @id;`,
        );
        return mapMovie(result.recordset[0]);
      } catch (error) {
        throw movieWriteError(error);
      }
    },
    async createMovieVersion(movieId, version) {
      const request = pool.request().input('movieId', sql.BigInt, movieId);
      bindVersion(request, version);
      const keys = Object.keys(version);
      try {
        const result = await request.query(
          `INSERT INTO dbo.movie_versions (movie_id, ${keys.map((key) => VERSION_COLUMNS[key][0]).join(', ')})
           OUTPUT ${versionProjection('inserted.')}
           VALUES (@movieId, ${keys.map((key) => `@${key}`).join(', ')});`,
        );
        return mapMovieVersion(result.recordset[0]);
      } catch (error) {
        throw versionWriteError(error);
      }
    },
    async createShowtime(input, createdByUserId) {
      const tx = new sql.Transaction(pool);
      try {
        await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        const version = await tx.request().input('movieVersionId', sql.BigInt, input.movieVersionId).query(
          `SELECT format_id FROM dbo.movie_versions WHERE movie_version_id = @movieVersionId AND is_active = 1;`,
        );
        if (!version.recordset[0]) throw invalidReference('movieVersionId does not exist.');
        const formatId = version.recordset[0].format_id;
        const auditorium = await tx.request()
          .input('auditoriumId', sql.BigInt, input.auditoriumId)
          .input('branchId', sql.BigInt, input.branchId)
          .query(`SELECT is_active FROM dbo.auditoriums WHERE auditorium_id = @auditoriumId AND branch_id = @branchId;`);
        if (!auditorium.recordset[0] || !auditorium.recordset[0].is_active) {
          throw invalidReference('auditoriumId must reference an active auditorium of the given branch.');
        }
        const supported = await tx.request()
          .input('auditoriumId', sql.BigInt, input.auditoriumId)
          .input('formatId', sql.Int, formatId)
          .query(`SELECT TOP (1) 1 AS supported FROM dbo.auditorium_screening_formats
            WHERE auditorium_id = @auditoriumId AND format_id = @formatId AND is_active = 1;`);
        if (!supported.recordset[0]) throw invalidReference('The auditorium does not support the screening format of this movie version.');
        const statusRow = await tx.request().input('status', sql.VarChar(30), input.status).query(
          `SELECT status_id FROM dbo.showtime_statuses WHERE status_code = @status AND is_active = 1;`,
        );
        if (!statusRow.recordset[0]) throw invalidReference('Showtime status is invalid.');
        const taken = await tx.request().input('code', sql.VarChar(40), input.showtimeCode)
          .query(`SELECT TOP (1) 1 AS taken FROM dbo.showtimes s WITH (UPDLOCK, HOLDLOCK) WHERE s.showtime_code = @code;`);
        if (taken.recordset[0]) throw showtimeCodeTaken();
        const startMs = Date.parse(`${input.startAt}Z`);
        const endMs = Date.parse(`${input.endAt}Z`);
        const busy = await tx.request()
          .input('auditoriumId', sql.BigInt, input.auditoriumId)
          .input('windowStart', sql.DateTime2, new Date(startMs - input.preparationMinutes * 60000))
          .input('windowEnd', sql.DateTime2, new Date(endMs + input.cleanupMinutes * 60000))
          .query(`SELECT TOP (1) 1 AS busy FROM dbo.showtimes s WITH (UPDLOCK, HOLDLOCK)
            JOIN dbo.showtime_statuses st ON st.status_id = s.status_id
            WHERE s.auditorium_id = @auditoriumId AND st.status_code <> 'CANCELLED'
              AND DATEADD(MINUTE, s.cleanup_minutes, s.end_at) > @windowStart
              AND DATEADD(MINUTE, -s.preparation_minutes, s.start_at) < @windowEnd;`);
        if (busy.recordset[0]) throw showtimeOverlap();
        const insert = { ...input, statusId: statusRow.recordset[0].status_id, createdByUserId };
        delete insert.status;
        const insertRequest = tx.request();
        bindShowtime(insertRequest, insert);
        const keys = Object.keys(insert);
        const inserted = await insertRequest.query(
          `INSERT INTO dbo.showtimes (${keys.map((key) => SHOWTIME_COLUMNS[key][0]).join(', ')})
           OUTPUT CONVERT(varchar(20), inserted.showtime_id) AS id
           VALUES (${keys.map((key) => `@${key}`).join(', ')});`,
        );
        const row = await tx.request().input('id', sql.BigInt, inserted.recordset[0].id).query(
          `SELECT ${showtimeProjection()} FROM dbo.showtimes s
           JOIN dbo.showtime_statuses st ON st.status_id = s.status_id
           WHERE s.showtime_id = @id;`,
        );
        await tx.commit();
        return mapShowtime(row.recordset[0]);
      } catch (error) {
        await tx.rollback().catch(() => {});
        throw showtimeWriteError(error);
      }
    },
  };
}
