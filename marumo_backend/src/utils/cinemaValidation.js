import { HttpError } from './validation.js';
import { objectFields } from './catalogValidation.js';
import { MAX_BIGINT_ID } from '../constants/ids.js';

const BRANCH_STATUSES = ['ACTIVE', 'INACTIVE', 'CLOSED'];
const BRANCH_FIELDS = ['name', 'phone', 'email', 'description', 'status'];
const AUDITORIUM_FIELDS = ['name', 'roomTypeId', 'formatIds', 'description', 'screenWidth', 'screenHeight', 'isActive'];

function invalid(message) {
  return new HttpError(400, 'INVALID_INPUT', message);
}

function text(value, key, max) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw invalid(`${key} must contain 1 to ${max} characters.`);
  return value.trim();
}

function code(value, max) {
  const parsed = text(value, 'code', max);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(parsed)) throw invalid('code must contain ASCII letters, digits, underscores or hyphens.');
  return parsed.toUpperCase();
}

export function parseCinemaId(value) {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,18}$/.test(value) || BigInt(value) > MAX_BIGINT_ID) throw invalid('ID must be a positive decimal BIGINT string.');
  return value;
}

export function parseBranchCode(value) {
  return code(value, 20);
}

function page(query) {
  const limit = query.limit ?? '25';
  if (typeof limit !== 'string' || !/^[1-9][0-9]{0,2}$/.test(limit) || Number(limit) > 100) throw invalid('limit must be an integer from 1 to 100.');
  return { limit: Number(limit), after: query.after === undefined ? '0' : parseCinemaId(query.after) };
}

export function parseBranchQuery(query, { admin = false } = {}) {
  objectFields(query, admin ? ['limit', 'after', 'status', 'branchId'] : ['limit', 'after']);
  const result = page(query);
  if (admin && query.status !== undefined) {
    if (!BRANCH_STATUSES.includes(query.status)) throw invalid('status is invalid.');
    result.status = query.status;
  }
  if (admin && query.branchId !== undefined) result.branchId = parseCinemaId(query.branchId);
  return result;
}

export function parseAuditoriumQuery(query) {
  objectFields(query, ['limit', 'after', 'isActive']);
  const result = page(query);
  if (query.isActive !== undefined) {
    if (!['true', 'false'].includes(query.isActive)) throw invalid('isActive must be true or false.');
    result.isActive = query.isActive === 'true';
  }
  return result;
}

export function parseBranchShowtimeQuery(query, at) {
  objectFields(query, ['limit', 'after', 'date', 'days', 'movieId']);
  const result = page(query);
  const date = query.date ?? new Date(at + 7 * 3600000).toISOString().slice(0, 10);
  if (typeof date !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date) || date < '0001-01-02') throw invalid('date must be a real YYYY-MM-DD date.');
  const calendar = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== date) throw invalid('date must be a real YYYY-MM-DD date.');
  const days = query.days ?? '3';
  if (typeof days !== 'string' || !/^[1-9][0-9]?$/.test(days) || Number(days) > 14) throw invalid('days must be an integer from 1 to 14.');
  result.from = new Date(calendar.getTime() - 7 * 3600000);
  result.to = new Date(result.from.getTime() + Number(days) * 86400000);
  if (result.to.getUTCFullYear() > 9999) throw invalid('The date window exceeds the supported range.');
  if (query.movieId !== undefined) result.movieId = parseCinemaId(query.movieId);
  return result;
}

export function parseBranchInput(body, { partial = false } = {}) {
  const keys = objectFields(body, partial ? BRANCH_FIELDS : ['code', ...BRANCH_FIELDS]);
  if (!keys.length || (!partial && ['code', 'name'].some((key) => !keys.includes(key)))) throw invalid('Branch fields are missing.');
  const result = {};
  if (!partial) result.code = code(body.code, 20);
  if ('name' in body) result.name = text(body.name, 'name', 150);
  for (const [key, max] of [['phone', 20], ['email', 255], ['description', 1000]]) {
    if (key in body) result[key] = body[key] === null ? null : text(body[key], key, max);
    else if (!partial) result[key] = null;
  }
  if (result.phone !== null && result.phone !== undefined && !/^[+0-9(). -]+$/.test(result.phone)) throw invalid('phone must contain telephone characters.');
  if (result.email !== null && result.email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) throw invalid('email is invalid.');
  if ('status' in body) {
    if (!BRANCH_STATUSES.includes(body.status)) throw invalid('status is invalid.');
    result.status = body.status;
  } else if (!partial) result.status = 'INACTIVE';
  return result;
}

function intId(value, key) {
  if (!Number.isInteger(value) || value < 1 || value > 2147483647) throw invalid(`${key} must be a positive INT.`);
  return value;
}

export function parseAuditoriumInput(body, { partial = false } = {}) {
  const keys = objectFields(body, partial ? AUDITORIUM_FIELDS : ['code', ...AUDITORIUM_FIELDS]);
  if (!keys.length || (!partial && ['code', 'name', 'roomTypeId', 'formatIds'].some((key) => !keys.includes(key)))) throw invalid('Auditorium fields are missing.');
  const result = {};
  if (!partial) result.code = code(body.code, 30);
  if ('name' in body) result.name = text(body.name, 'name', 100);
  if ('roomTypeId' in body) result.roomTypeId = intId(body.roomTypeId, 'roomTypeId');
  if ('formatIds' in body) {
    if (!Array.isArray(body.formatIds) || body.formatIds.length < 1 || body.formatIds.length > 100) throw invalid('formatIds must contain 1 to 100 IDs.');
    result.formatIds = body.formatIds.map((id) => intId(id, 'formatId'));
    if (new Set(result.formatIds).size !== result.formatIds.length) throw invalid('formatIds must not contain duplicates.');
    result.formatIds.sort((a, b) => a - b);
  }
  if ('description' in body) result.description = body.description === null ? null : text(body.description, 'description', 500);
  else if (!partial) result.description = null;
  for (const key of ['screenWidth', 'screenHeight']) {
    if (key in body) {
      const value = body[key];
      if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 999999.99 || Number(value.toFixed(2)) !== value)) throw invalid(`${key} must be null or a positive number up to 999999.99 with at most two decimal places.`);
      result[key] = value;
    } else if (!partial) result[key] = null;
  }
  if ('isActive' in body) {
    if (typeof body.isActive !== 'boolean') throw invalid('isActive must be a boolean.');
    result.isActive = body.isActive;
  } else if (!partial) result.isActive = true;
  return result;
}
