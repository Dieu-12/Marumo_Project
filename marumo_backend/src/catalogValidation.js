import { HttpError } from './validation.js';

export const MOVIE_STATUSES = ['DRAFT', 'PUBLISHED', 'COMING_SOON', 'NOW_SHOWING', 'ENDED', 'ARCHIVED'];
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

function objectFields(value, allowed) {
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
