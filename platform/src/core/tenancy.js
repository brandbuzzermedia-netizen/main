import { forbidden, notFound } from './errors.js';

/**
 * Tenant isolation.
 *
 * Two layers protect client data:
 *   1. Every repository query is built through scoped helpers that refuse to
 *      run without an agency_id predicate (src/db/repo.js).
 *   2. Every request that names a client passes through assertClientAccess,
 *      which checks both the agency boundary and the user's client_scope.
 *
 * A user with a non-empty client_scope (e.g. a `client` role viewing their own
 * dashboard) can only ever reach the clients listed in it.
 */

/** @typedef {{ userId:string, agencyId:string, role:string, clientScope:string[] }} Principal */

/** @param {Principal} principal @param {{id:string, agency_id:string}|undefined|null} client */
export function assertClientAccess(principal, client) {
  if (!client) throw notFound('Client not found');
  if (client.agency_id !== principal.agencyId) {
    // Deliberately a 404, not a 403: never confirm that another agency's id exists.
    throw notFound('Client not found');
  }
  if (principal.clientScope.length > 0 && !principal.clientScope.includes(client.id)) {
    throw forbidden('This account is not scoped to that client');
  }
  return client;
}

/** @param {Principal} principal @param {{agency_id:string}|undefined|null} row */
export function assertSameAgency(principal, row) {
  if (!row) throw notFound('Not found');
  if (row.agency_id !== principal.agencyId) throw notFound('Not found');
  return row;
}

/** Client ids this principal may see, or null for "every client in the agency". */
export function visibleClientIds(principal) {
  return principal.clientScope.length > 0 ? principal.clientScope : null;
}
