import { forbidden } from './errors.js';

/**
 * Role-based access control. Permissions are checked server-side on every
 * request; the frontend's own hiding of buttons is a convenience, never a
 * control.
 */
export const ROLES = /** @type {const} */ ([
  'admin', 'social_media_manager', 'content_creator', 'reviewer', 'client',
]);

/** Permission vocabulary: `<resource>:<action>`, `*` = everything. */
const MATRIX = {
  admin: ['*'],
  social_media_manager: [
    'client:read', 'client:write', 'account:read', 'account:write',
    'trend:read', 'inspiration:read', 'inspiration:write',
    'opportunity:read', 'opportunity:write', 'comment:read', 'comment:write',
    'idea:read', 'idea:write', 'content:read', 'content:write',
    'approval:read', 'approval:decide', 'publish:execute',
    'analytics:read', 'competitor:read', 'competitor:write',
    'automation:read', 'automation:write', 'assistant:use', 'audit:read',
    'notification:read',
  ],
  content_creator: [
    'client:read', 'trend:read', 'inspiration:read', 'inspiration:write',
    'idea:read', 'idea:write', 'content:read', 'content:write',
    'comment:read', 'comment:write', 'analytics:read', 'assistant:use',
    'notification:read', 'account:read', 'opportunity:read',
  ],
  reviewer: [
    'client:read', 'trend:read', 'inspiration:read', 'opportunity:read',
    'comment:read', 'idea:read', 'content:read',
    'approval:read', 'approval:decide', 'analytics:read', 'audit:read',
    'notification:read', 'account:read',
  ],
  client: [
    'client:read', 'content:read', 'analytics:read', 'approval:read',
    'approval:decide', 'notification:read',
  ],
};

/** @param {{role:string}} user @param {string} permission */
export function can(user, permission) {
  const grants = MATRIX[user?.role] ?? [];
  if (grants.includes('*')) return true;
  if (grants.includes(permission)) return true;
  const [resource] = permission.split(':');
  return grants.includes(`${resource}:*`);
}

/** @param {{role:string}} user @param {string} permission */
export function require_(user, permission) {
  if (!can(user, permission)) {
    throw forbidden(`Role "${user?.role}" may not perform ${permission}`);
  }
}

export function permissionsFor(role) {
  return MATRIX[role] ?? [];
}
