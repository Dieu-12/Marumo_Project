import { HttpError } from './validation.js';

export const MOVIE_STATUSES = ['DRAFT', 'PUBLISHED', 'COMING_SOON', 'NOW_SHOWING', 'ENDED', 'ARCHIVED'];
export const PUBLIC_MOVIE_STATUSES = ['NOW_SHOWING', 'COMING_SOON', 'PUBLISHED'];
const MAX_ID = 9223372036854775807n;
const REQUIRED_FIELDS = ['movieCode', 'title', 'slug', 'durationMinutes'];
const NULLABLE_TEXT_FIELDS = {
  originalTitle: 250,
  synopsis: 8000,
  productionCompany: 200,
  directorDisplay: 250,
  originalLanguageCode: 10,
};
const MOVIE_FIELDS = [...REQUIRED_FIELDS, ...Object.keys(NULLABLE_TEXT_FIELDS), 'releaseDate', 'endDate', 'productionYear', 'status', 'isFeatured'];

function invalid(message) {
  return new HttpError(400, 'INVALID_INPUT', message);
}

export function objectFields(value, allowed) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw invalid('A JSON object is required.');
  const keys = Object.keys(value);
  if (keys.some((key) => !allowed.includes(key))) throw invalid('Unexpected request fields.');
  return keys;
}

function text(value, key, max) {
  if (typeof value !== 'string') throw invalid(`${key} must be text.`);
  const parsed = value.trim();
  if (parsed.length === 0 || parsed.length > max) throw invalid(`${key} must contain 1 to ${max} characters.`);
  return parsed;
}

function date(value, key) {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) || value < '0001-01-01') {
    throw invalid(`${key} must be an ISO calendar date.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw invalid(`${key} is not a real calendar date.`);
  return value;
}

export function validateMovieWindow({ releaseDate, endDate }) {
  if (releaseDate && endDate && endDate < releaseDate) throw invalid('endDate must not precede releaseDate.');
}

function status(value) {
  if (!MOVIE_STATUSES.includes(value)) throw invalid('Movie status is invalid.');
  return value;
}

export function parseMovieId(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,18}$/.test(value) || BigInt(value) > MAX_ID) {
    throw invalid('Movie ID must be a positive decimal BIGINT string.');
  }
  return value;
}

export function parseShowtimeId(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,18}$/.test(value) || BigInt(value) > MAX_ID) {
    throw invalid('Showtime ID must be a positive decimal BIGINT string.');
  }
  return value;
}

export function parseMovieInput(body, { partial = false } = {}) {
  const keys = objectFields(body, MOVIE_FIELDS);
  if (keys.length === 0 || (!partial && REQUIRED_FIELDS.some((key) => !keys.includes(key)))) throw invalid('Movie fields are missing.');
  const movie = {};
  if ('movieCode' in body) {
    const movieCode = text(body.movieCode, 'movieCode', 30);
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(movieCode)) throw invalid('movieCode must contain ASCII letters, digits, underscores or hyphens.');
    movie.movieCode = movieCode.toUpperCase();
  }
  if ('title' in body) movie.title = text(body.title, 'title', 250);
  if ('slug' in body) {
    const slug = text(body.slug, 'slug', 280);
    if (!/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(slug)) throw invalid('slug must contain ASCII words separated by hyphens.');
    movie.slug = slug.toLowerCase();
  }
  if ('durationMinutes' in body) {
    if (!Number.isInteger(body.durationMinutes) || body.durationMinutes < 1 || body.durationMinutes > 600) throw invalid('durationMinutes must be an integer from 1 to 600.');
    movie.durationMinutes = body.durationMinutes;
  }
  for (const [key, max] of Object.entries(NULLABLE_TEXT_FIELDS)) {
    if (key in body) movie[key] = body[key] === null ? null : text(body[key], key, max);
    else if (!partial) movie[key] = null;
  }
  if (movie.originalLanguageCode !== null && movie.originalLanguageCode !== undefined && !/^[A-Za-z0-9-]+$/.test(movie.originalLanguageCode)) {
    throw invalid('originalLanguageCode must contain ASCII letters, digits or hyphens.');
  }
  for (const key of ['releaseDate', 'endDate']) {
    if (key in body) movie[key] = date(body[key], key);
    else if (!partial) movie[key] = null;
  }
  if ('productionYear' in body) {
    if (body.productionYear !== null && (!Number.isInteger(body.productionYear) || body.productionYear < 1888 || body.productionYear > 2100)) {
      throw invalid('productionYear must be null or an integer from 1888 to 2100.');
    }
    movie.productionYear = body.productionYear;
  } else if (!partial) movie.productionYear = null;
  if ('status' in body) movie.status = status(body.status);
  else if (!partial) movie.status = 'DRAFT';
  if ('isFeatured' in body) {
    if (typeof body.isFeatured !== 'boolean') throw invalid('isFeatured must be a boolean.');
    movie.isFeatured = body.isFeatured;
  } else if (!partial) movie.isFeatured = false;
  validateMovieWindow(movie);
  return movie;
}

export function parseMovieQuery(query) {
  objectFields(query, ['limit', 'after', 'status']);
  const limit = query.limit ?? '25';
  if (typeof limit !== 'string' || !/^[1-9][0-9]{0,2}$/.test(limit) || Number(limit) > 100) throw invalid('limit must be an integer from 1 to 100.');
  return {
    limit: Number(limit),
    after: query.after === undefined ? '0' : parseMovieId(query.after),
    status: query.status === undefined ? null : status(query.status),
  };
}

export function parsePublicMovieQuery(query) {
  objectFields(query, ['limit', 'after', 'status']);
  const limit = query.limit ?? '25';
  if (typeof limit !== 'string' || !/^[1-9][0-9]{0,2}$/.test(limit) || Number(limit) > 100) throw invalid('limit must be an integer from 1 to 100.');
  if (query.status !== undefined && !PUBLIC_MOVIE_STATUSES.includes(query.status)) throw invalid('Public movie status is invalid.');
  return {
    limit: Number(limit),
    after: query.after === undefined ? '0' : parseMovieId(query.after),
    status: query.status ?? null,
  };
}

export function parsePublicSlug(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 280 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw invalid('slug must be lowercase ASCII words separated by hyphens.');
  }
  return value;
}

export function parsePublicShowtimeQuery(query) {
  objectFields(query, ['days']);
  const days = query.days ?? '3';
  if (typeof days !== 'string' || !/^[1-9][0-9]?$/.test(days) || Number(days) > 14) {
    throw invalid('days must be an integer from 1 to 14.');
  }
  return { days: Number(days) };
}

export const SHOWTIME_STATUSES = ['DRAFT', 'SCHEDULED', 'OPEN_FOR_BOOKING', 'DELAYED'];
export const PUBLIC_SHOWTIME_STATUSES = ['SCHEDULED', 'OPEN_FOR_BOOKING', 'SOLD_OUT'];
const MAX_SMALL_ID = 32767;
const MAX_INT_ID = 2147483647;
const VERSION_FIELDS = ['versionCode', 'versionName', 'audioLanguageId', 'subtitleLanguageId', 'formatId', 'isOriginalAudio', 'isActive'];
const SHOWTIME_FIELDS = ['showtimeCode', 'branchId', 'auditoriumId', 'movieVersionId', 'startAt', 'endAt', 'baseTicketPrice', 'preparationMinutes', 'cleanupMinutes', 'status', 'salesOpenAt', 'salesCloseAt'];

function smallId(value, key) {
  if (!Number.isInteger(value) || value < 1 || value > MAX_SMALL_ID) throw invalid(`${key} must be an integer from 1 to ${MAX_SMALL_ID}.`);
  return value;
}

function intId(value, key) {
  if (!Number.isInteger(value) || value < 1 || value > MAX_INT_ID) throw invalid(`${key} must be an integer from 1 to ${MAX_INT_ID}.`);
  return value;
}

function code(value, key, max) {
  const parsed = text(value, key, max);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(parsed)) throw invalid(`${key} must contain ASCII letters, digits, underscores or hyphens.`);
  return parsed;
}

function stamp(value, key) {
  if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,3})?(Z|[+-][0-9]{2}:[0-9]{2})?$/.test(value)) {
    throw invalid(`${key} must be an ISO datetime string.`);
  }
  const parsed = new Date(/[Zz]|[+-][0-9]{2}:[0-9]{2}$/.test(value) ? value : `${value}Z`);
  if (!Number.isFinite(parsed.getTime())) throw invalid(`${key} is not a real datetime.`);
  return parsed.toISOString().slice(0, 19);
}

export function parseMovieVersionInput(body) {
  const keys = objectFields(body, VERSION_FIELDS);
  if (keys.length === 0 || ['versionCode', 'versionName', 'audioLanguageId', 'formatId'].some((key) => !keys.includes(key))) {
    throw invalid('Movie version fields are missing.');
  }
  const version = { versionCode: code(body.versionCode, 'versionCode', 50), versionName: text(body.versionName, 'versionName', 150) };
  version.audioLanguageId = smallId(body.audioLanguageId, 'audioLanguageId');
  version.formatId = intId(body.formatId, 'formatId');
  if ('subtitleLanguageId' in body) version.subtitleLanguageId = body.subtitleLanguageId === null ? null : smallId(body.subtitleLanguageId, 'subtitleLanguageId');
  else version.subtitleLanguageId = null;
  if ('isOriginalAudio' in body) {
    if (typeof body.isOriginalAudio !== 'boolean') throw invalid('isOriginalAudio must be a boolean.');
    version.isOriginalAudio = body.isOriginalAudio;
  } else version.isOriginalAudio = false;
  if ('isActive' in body) {
    if (typeof body.isActive !== 'boolean') throw invalid('isActive must be a boolean.');
    version.isActive = body.isActive;
  } else version.isActive = true;
  return version;
}

export function parseShowtimeInput(body) {
  const keys = objectFields(body, SHOWTIME_FIELDS);
  if (keys.length === 0 || ['showtimeCode', 'branchId', 'auditoriumId', 'movieVersionId', 'startAt', 'endAt', 'baseTicketPrice'].some((key) => !keys.includes(key))) {
    throw invalid('Showtime fields are missing.');
  }
  const showtime = {
    showtimeCode: code(body.showtimeCode, 'showtimeCode', 40),
    branchId: parseMovieId(body.branchId),
    auditoriumId: parseMovieId(body.auditoriumId),
    movieVersionId: parseMovieId(body.movieVersionId),
    startAt: stamp(body.startAt, 'startAt'),
    endAt: stamp(body.endAt, 'endAt'),
  };
  if (showtime.endAt <= showtime.startAt) throw invalid('endAt must be after startAt.');
  if (typeof body.baseTicketPrice !== 'number' || !Number.isFinite(body.baseTicketPrice) || body.baseTicketPrice < 0 || body.baseTicketPrice > 9999999999.99) {
    throw invalid('baseTicketPrice must be a number from 0 to 9999999999.99.');
  }
  if (Math.round(body.baseTicketPrice * 100) !== body.baseTicketPrice * 100) throw invalid('baseTicketPrice must have at most two decimal places.');
  showtime.baseTicketPrice = body.baseTicketPrice;
  for (const key of ['preparationMinutes', 'cleanupMinutes']) {
    if (key in body) {
      if (!Number.isInteger(body[key]) || body[key] < 0 || body[key] > 180) throw invalid(`${key} must be an integer from 0 to 180.`);
      showtime[key] = body[key];
    } else showtime[key] = 15;
  }
  if ('status' in body) {
    if (!SHOWTIME_STATUSES.includes(body.status)) throw invalid('Showtime status is invalid.');
    showtime.status = body.status;
  } else showtime.status = 'DRAFT';
  for (const key of ['salesOpenAt', 'salesCloseAt']) {
    if (key in body) showtime[key] = body[key] === null ? null : stamp(body[key], key);
    else showtime[key] = null;
  }
  if (showtime.salesOpenAt && showtime.salesCloseAt && showtime.salesCloseAt <= showtime.salesOpenAt) {
    throw invalid('salesCloseAt must be after salesOpenAt.');
  }
  return showtime;
}
