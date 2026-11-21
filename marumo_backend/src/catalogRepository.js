import sql from 'mssql';
import { HttpError } from './validation.js';
import { validateMovieWindow } from './catalogValidation.js';

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

export function createMemoryMovieRepository() {
  const movies = new Map();
  let nextId = 1n;

  function unique(movie, ownId) {
    if ([...movies.values()].some((row) => row.id !== ownId && (row.movieCode.toLowerCase() === movie.movieCode.toLowerCase() || row.slug.toLowerCase() === movie.slug.toLowerCase()))) {
      throw conflict();
    }
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
  };
}
