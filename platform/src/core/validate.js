import { badRequest } from './errors.js';

/**
 * Tiny schema validator. Declarative, dependency-free, and used on the way in
 * (request bodies) and on the way out of AI agents (model output), because
 * model output is untrusted input too.
 */

/** @typedef {{type?:string, required?:boolean, default?:any, min?:number, max?:number,
 *   maxLength?:number, minLength?:number, enum?:readonly any[], pattern?:RegExp,
 *   items?:Field, of?:Record<string,Field>, trim?:boolean}} Field */

/**
 * @param {Record<string, any>} input
 * @param {Record<string, Field>} schema
 * @param {string} [path]
 */
export function validate(input, schema, path = '') {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw badRequest(`${path || 'body'} must be an object`);
  }
  /** @type {Record<string, any>} */
  const out = {};
  /** @type {string[]} */
  const errors = [];

  for (const [name, field] of Object.entries(schema)) {
    const at = path ? `${path}.${name}` : name;
    let value = input[name];

    if (value === undefined || value === null || value === '') {
      if (field.default !== undefined) { out[name] = structuredClone(field.default); continue; }
      if (field.required) { errors.push(`${at} is required`); continue; }
      if (value === '' && field.type === 'string') { out[name] = ''; }
      continue;
    }

    try {
      out[name] = coerce(value, field, at);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  if (errors.length) throw badRequest('Validation failed', { errors });
  return out;
}

/** @param {any} value @param {Field} field @param {string} at */
function coerce(value, field, at) {
  const type = field.type ?? 'string';

  switch (type) {
    case 'string': {
      if (typeof value !== 'string') throw new Error(`${at} must be a string`);
      const v = field.trim === false ? value : value.trim();
      if (field.minLength && v.length < field.minLength) throw new Error(`${at} must be at least ${field.minLength} characters`);
      if (field.maxLength && v.length > field.maxLength) throw new Error(`${at} must be at most ${field.maxLength} characters`);
      if (field.pattern && !field.pattern.test(v)) throw new Error(`${at} has an invalid format`);
      if (field.enum && !field.enum.includes(v)) throw new Error(`${at} must be one of: ${field.enum.join(', ')}`);
      return v;
    }
    case 'number': {
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(n)) throw new Error(`${at} must be a number`);
      if (field.min !== undefined && n < field.min) throw new Error(`${at} must be >= ${field.min}`);
      if (field.max !== undefined && n > field.max) throw new Error(`${at} must be <= ${field.max}`);
      return n;
    }
    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (value === 'true' || value === 1 || value === '1') return true;
      if (value === 'false' || value === 0 || value === '0') return false;
      throw new Error(`${at} must be a boolean`);
    case 'enum':
      if (!field.enum?.includes(value)) throw new Error(`${at} must be one of: ${field.enum?.join(', ')}`);
      return value;
    case 'array': {
      if (!Array.isArray(value)) throw new Error(`${at} must be an array`);
      if (field.max !== undefined && value.length > field.max) throw new Error(`${at} may hold at most ${field.max} items`);
      return field.items ? value.map((v, i) => coerce(v, field.items, `${at}[${i}]`)) : value;
    }
    case 'object':
      if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${at} must be an object`);
      return field.of ? validate(value, field.of, at) : value;
    case 'iso-date': {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) throw new Error(`${at} must be an ISO-8601 timestamp`);
      return d.toISOString();
    }
    case 'email': {
      const v = String(value).trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(v)) throw new Error(`${at} must be a valid email address`);
      return v;
    }
    case 'url': {
      try { return new URL(String(value)).toString(); }
      catch { throw new Error(`${at} must be a valid URL`); }
    }
    default:
      return value;
  }
}

/** Clamp any numeric score into the 0-100 band the product speaks in. */
export function clampScore(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
