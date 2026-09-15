process.env.DATABASE_FILE = ':memory:';
process.env.CREDENTIAL_ENCRYPTION_KEY = 'dGVzdC1rZXktMzItYnl0ZXMtZm9yLXVuaXQtdGVzdHMhIQ==';
process.env.AI_PROVIDER = 'offline';
process.env.LOG_LEVEL = 'error';

import { migrate, getDb } from '../src/db/index.js';
import { seedDefaultPrompts } from '../src/ai/prompts.js';
import { insert } from '../src/db/repo.js';
import { hashPassword } from '../src/core/crypto.js';
import { newId, now } from '../src/core/ids.js';

/** Build a fresh in-memory agency with one client. */
export function freshAgency({ name = 'Test Agency', slug } = {}) {
  migrate();
  seedDefaultPrompts();
  const agencyId = newId('ag');
  const ts = now();
  getDb().prepare(`INSERT INTO agencies (id, name, slug, plan, settings, automation_paused, status, created_at, updated_at)
                   VALUES (?, ?, ?, 'agency', '{}', 0, 'active', ?, ?)`)
    .run(agencyId, name, slug ?? `slug-${agencyId.toLowerCase()}`, ts, ts);

  const user = insert('users', {
    agency_id: agencyId, email: `admin-${agencyId}@test.local`, name: 'Admin',
    role: 'admin', password_hash: hashPassword('password-12345678'), client_scope: [],
  });

  const client = insert('clients', {
    agency_id: agencyId, name: `Client ${agencyId.slice(-4)}`,
    industry: 'Diagnostics', location: 'Bengaluru',
    products: ['blood tests'], onboarding_complete: 1,
  });

  const brand = insert('brand_profiles', {
    agency_id: agencyId, client_id: client.id,
    tone: 'Professional', words_to_avoid: ['cheap', 'miracle'], emoji_preference: 'sparing',
  });

  return { agencyId, user, client, brand };
}

export const principalFor = (agencyId, user) => ({
  userId: user.id, agencyId, role: user.role, clientScope: user.client_scope ?? [], user,
});
