import sql from 'mssql';
import { HttpError } from '../utils/validation.js';
import { PUBLIC_MOVIE_STATUSES, PUBLIC_SHOWTIME_STATUSES } from '../constants/catalog.js';
import { validateMovieWindow } from '../utils/catalogValidation.js';

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

function publicMovie(row) {
  return {
    id: row.id,
    title: row.title,
    originalTitle: row.originalTitle,
    slug: row.slug,
    synopsis: row.synopsis,
    durationMinutes: row.durationMinutes,
    releaseDate: row.releaseDate,
    endDate: row.endDate,
    productionYear: row.productionYear,
    productionCompany: row.productionCompany,
    directorDisplay: row.directorDisplay,
    originalLanguageCode: row.originalLanguageCode,
    status: row.status,
    isFeatured: row.isFeatured,
    ratingCode: null,
    genres: [],
    formats: [],
  };
}

export function memoryStamp(value) {
  return new Date(/[Zz]$/.test(value) ? value : `${value}Z`).toISOString();
}

export function publicShowtime(row, movieId) {
  return {
    id: row.id,
    showtimeCode: row.showtimeCode,
    movieId,
    movieVersionId: row.movieVersionId,
    branchId: row.branchId,
    branchName: null,
    branchAddress: null,
    branchCity: null,
    auditoriumId: row.auditoriumId,
    auditoriumName: null,
    formatCode: null,
    formatName: '2D',
    startAt: memoryStamp(row.startAt),
    endAt: memoryStamp(row.endAt),
    baseTicketPrice: row.baseTicketPrice,
    status: row.status,
  };
}

function publicMovieJson(value) {
  return value === null || value === undefined || value === '' ? [] : JSON.parse(value);
}

function mapPublicMovie(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    originalTitle: row.originalTitle,
    slug: row.slug,
    synopsis: row.synopsis,
    durationMinutes: row.durationMinutes,
    releaseDate: row.releaseDate?.toISOString().slice(0, 10) ?? null,
    endDate: row.endDate?.toISOString().slice(0, 10) ?? null,
    productionYear: row.productionYear,
    productionCompany: row.productionCompany,
    directorDisplay: row.directorDisplay,
    originalLanguageCode: row.originalLanguageCode,
    status: row.status,
    isFeatured: Boolean(row.isFeatured),
    ratingCode: row.ratingCode ?? null,
    genres: publicMovieJson(row.genres),
    formats: publicMovieJson(row.formats),
  };
}

function sqlList(values) {
  return values.map((value) => `'${value}'`).join(', ');
}

const PUBLIC_SHOWTIME_SELECT = `SELECT
    CONVERT(varchar(20), s.showtime_id) AS id,
    s.showtime_code AS showtimeCode,
    CONVERT(varchar(20), mv.movie_id) AS movieId,
    CONVERT(varchar(20), s.movie_version_id) AS movieVersionId,
    CONVERT(varchar(20), s.branch_id) AS branchId,
    b.branch_name AS branchName,
    ba.street_address AS branchAddress,
    province.unit_name AS branchCity,
    CONVERT(varchar(20), s.auditorium_id) AS auditoriumId,
    a.auditorium_name AS auditoriumName,
    f.format_code AS formatCode,
    f.format_name AS formatName,
    s.start_at AS startAt,
    s.end_at AS endAt,
    s.base_ticket_price AS baseTicketPrice,
    st.status_code AS status
  FROM dbo.showtimes s
  JOIN dbo.showtime_statuses st ON st.status_id = s.status_id
  JOIN dbo.movie_versions mv ON mv.movie_version_id = s.movie_version_id
  JOIN dbo.screening_formats f ON f.format_id = mv.format_id
  JOIN dbo.branches b ON b.branch_id = s.branch_id
  JOIN dbo.auditoriums a ON a.auditorium_id = s.auditorium_id
  OUTER APPLY (
    SELECT TOP (1) addr.street_address, addr.ward_unit_id
    FROM dbo.branch_addresses addr
    WHERE addr.branch_id = s.branch_id
    ORDER BY addr.is_primary DESC, addr.address_id
  ) ba
  LEFT JOIN dbo.administrative_units ward ON ward.unit_id = ba.ward_unit_id
  LEFT JOIN dbo.administrative_units province ON province.unit_id = ward.parent_unit_id`;

function mapPublicShowtimeRow(row) {
  return {
    id: row.id,
    showtimeCode: row.showtimeCode,
    movieId: row.movieId,
    movieVersionId: row.movieVersionId,
    branchId: row.branchId,
    branchName: row.branchName,
    branchAddress: row.branchAddress,
    branchCity: row.branchCity,
    auditoriumId: row.auditoriumId,
    auditoriumName: row.auditoriumName,
    formatCode: row.formatCode,
    formatName: row.formatName,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    baseTicketPrice: Number(row.baseTicketPrice),
    status: row.status,
  };
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
    async listPublicMovies({ after, limit, status }) {
      return [...movies.values()]
        .filter((row) => BigInt(row.id) > BigInt(after) && PUBLIC_MOVIE_STATUSES.includes(row.status) && (status === null || row.status === status))
        .sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1))
        .slice(0, limit)
        .map(publicMovie);
    },
    async findPublicMovieBySlug(slug) {
      const row = [...movies.values()].find((candidate) => candidate.slug === slug && PUBLIC_MOVIE_STATUSES.includes(candidate.status));
      return row ? publicMovie(row) : null;
    },
    async findBookableShowtime(showtimeId, at) {
      const row = showtimes.find((candidate) => candidate.id === showtimeId && ['SCHEDULED', 'OPEN_FOR_BOOKING'].includes(candidate.status));
      if (!row) return null;
      const bookable = Date.parse(memoryStamp(row.startAt)) > at
        && (row.salesOpenAt === null || Date.parse(memoryStamp(row.salesOpenAt)) <= at)
        && (row.salesCloseAt === null || Date.parse(memoryStamp(row.salesCloseAt)) > at);
      return { ...row, bookable };
    },
    async listPublicShowtimes({ movieId, from, to }) {
      return showtimes
        .filter((row) => versions.get(row.movieVersionId)?.movieId === movieId && PUBLIC_SHOWTIME_STATUSES.includes(row.status))
        .filter((row) => {
          const startAt = Date.parse(memoryStamp(row.startAt));
          return startAt >= from.getTime() && startAt <= to.getTime();
        })
        .sort((a, b) => Date.parse(memoryStamp(a.startAt)) - Date.parse(memoryStamp(b.startAt)) || (BigInt(a.id) < BigInt(b.id) ? -1 : 1))
        .map((row) => publicShowtime(row, movieId));
    },
    async getPublicShowtimeSeats({ showtimeId }) {
      const row = showtimes.find((candidate) => candidate.id === showtimeId && PUBLIC_SHOWTIME_STATUSES.includes(candidate.status));
      if (!row) return null;
      return { showtime: publicShowtime(row, versions.get(row.movieVersionId)?.movieId), seats: [] };
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
  const publicMovieProjection = [
    'CONVERT(varchar(20), m.movie_id) AS id',
    'm.title AS title',
    'm.original_title AS originalTitle',
    'm.slug AS slug',
    'm.synopsis AS synopsis',
    'm.duration_minutes AS durationMinutes',
    'm.release_date AS releaseDate',
    'm.end_date AS endDate',
    'm.production_year AS productionYear',
    'm.production_company AS productionCompany',
    'm.director_display AS directorDisplay',
    'm.original_language_code AS originalLanguageCode',
    'm.status AS status',
    'm.is_featured AS isFeatured',
    'rating.rating_code AS ratingCode',
    `(SELECT TOP (100) g.genre_code AS code, g.genre_name AS name
      FROM dbo.movie_genres mg
      JOIN dbo.genres g ON g.genre_id = mg.genre_id
      WHERE mg.movie_id = m.movie_id
      ORDER BY g.display_order, g.genre_code
      FOR JSON PATH) AS genres`,
    `(SELECT DISTINCT TOP (100) f.format_code AS code, f.format_name AS name
      FROM dbo.movie_versions mv
      JOIN dbo.screening_formats f ON f.format_id = mv.format_id
      WHERE mv.movie_id = m.movie_id AND mv.is_active = 1
      ORDER BY f.format_code
      FOR JSON PATH) AS formats`,
  ].join(', ');
  const publicMovieRating = `OUTER APPLY (
    SELECT TOP (1) r.rating_code
    FROM dbo.movie_content_ratings r
    WHERE r.movie_id = m.movie_id
    ORDER BY CASE WHEN r.country_code = 'VN' THEN 0 ELSE 1 END, r.movie_content_rating_id
  ) rating`;
  const publicStatusFilter = `m.status IN (${sqlList(PUBLIC_MOVIE_STATUSES)})`;

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
    async listPublicMovies({ after, limit, status }) {
      const result = await pool.request()
        .input('after', sql.BigInt, after)
        .input('limit', sql.Int, limit)
        .input('status', sql.VarChar(20), status)
        .query(`SELECT TOP (@limit) ${publicMovieProjection}
          FROM dbo.movies m
          ${publicMovieRating}
          WHERE m.movie_id > @after AND ${publicStatusFilter}
            AND (@status IS NULL OR m.status = @status)
          ORDER BY m.movie_id;`);
      return result.recordset.map(mapPublicMovie);
    },
    async findPublicMovieBySlug(slug) {
      const result = await pool.request().input('slug', sql.VarChar(280), slug).query(
        `SELECT ${publicMovieProjection}
         FROM dbo.movies m
         ${publicMovieRating}
         WHERE m.slug = @slug AND ${publicStatusFilter};`,
      );
      return mapPublicMovie(result.recordset[0]);
    },
    async listPublicShowtimes({ movieId, from, to }) {
      const result = await pool.request()
        .input('movieId', sql.BigInt, movieId)
        .input('from', sql.DateTime2, from)
        .input('to', sql.DateTime2, to)
        .query(`${PUBLIC_SHOWTIME_SELECT}
          WHERE mv.movie_id = @movieId
            AND st.status_code IN (${sqlList(PUBLIC_SHOWTIME_STATUSES)})
            AND s.start_at >= @from AND s.start_at <= @to
          ORDER BY s.start_at, s.showtime_id;`);
      return result.recordset.map(mapPublicShowtimeRow);
    },
    async getPublicShowtimeSeats({ showtimeId }) {
      const showtimeResult = await pool.request()
        .input('showtimeId', sql.BigInt, showtimeId)
        .query(`${PUBLIC_SHOWTIME_SELECT}
          WHERE s.showtime_id = @showtimeId
            AND st.status_code IN (${sqlList(PUBLIC_SHOWTIME_STATUSES)});`);
      const showtimeRow = showtimeResult.recordset[0];
      if (!showtimeRow) return null;
      const seatResult = await pool.request()
        .input('showtimeId', sql.BigInt, showtimeId)
        .query(`SELECT
            CONVERT(varchar(20), ss.showtime_seat_id) AS id,
            CONVERT(varchar(20), ss.seat_id) AS seatId,
            s.seat_code AS code,
            s.row_label AS rowLabel,
            s.seat_number AS seatNumber,
            seat_type.type_code AS typeCode,
            seat_type.type_name AS typeName,
            seat_type.seat_unit_count AS unitCount,
            ss.final_price AS price,
            ss.seat_status AS status,
            layout_seat.row_position AS rowPosition,
            layout_seat.column_position AS columnPosition
          FROM dbo.showtime_seats ss
          JOIN dbo.seats s ON s.seat_id = ss.seat_id
          JOIN dbo.seat_types seat_type ON seat_type.seat_type_id = s.seat_type_id
          LEFT JOIN dbo.seat_layout_versions layout_version
            ON layout_version.auditorium_id = ss.auditorium_id AND layout_version.version_status = 'PUBLISHED'
          LEFT JOIN dbo.seat_layout_version_seats layout_seat
            ON layout_seat.layout_version_id = layout_version.layout_version_id
            AND layout_seat.seat_id = s.seat_id AND layout_seat.is_enabled = 1
          WHERE ss.showtime_id = @showtimeId
          ORDER BY COALESCE(layout_seat.row_position, 2147483647), s.row_label,
            COALESCE(layout_seat.column_position, s.seat_number), s.seat_number;`);
      return {
        showtime: mapPublicShowtimeRow(showtimeRow),
        seats: seatResult.recordset.map((row) => ({
          id: row.id,
          seatId: row.seatId,
          code: row.code,
          rowLabel: row.rowLabel,
          seatNumber: row.seatNumber,
          typeCode: row.typeCode,
          typeName: row.typeName,
          unitCount: row.unitCount,
          price: Number(row.price),
          status: row.status,
          rowPosition: row.rowPosition,
          columnPosition: row.columnPosition,
        })),
      };
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
