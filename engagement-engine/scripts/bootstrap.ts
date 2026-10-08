/**
 * First-time production setup: creates the organisation (if none) and a super admin.
 *
 *   ADMIN_EMAIL=you@getbeeseen.com ADMIN_NAME="Your Name" npm run bootstrap
 *
 * Prints a generated password once unless ADMIN_PASSWORD is set. Safe to re-run: it refuses
 * to create a second account with the same email.
 */
import { randomBytes } from "node:crypto";
import { getPool, withSystem } from "../src/lib/db";
import { hashPassword } from "../src/lib/security/crypto";

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const name = process.env.ADMIN_NAME?.trim() || "GBS Admin";
  const orgName = process.env.ORG_NAME?.trim() || "Get Bee Seen";
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("Set ADMIN_EMAIL to a valid email address.");
  const password = process.env.ADMIN_PASSWORD || randomBytes(12).toString("base64url");
  if (password.length < 10) throw new Error("ADMIN_PASSWORD must be at least 10 characters.");
  const hash = await hashPassword(password);

  const created = await withSystem(async (db) => {
    let org = await db.one<{ id: string }>("select id from organizations order by created_at limit 1");
    if (!org) {
      org = await db.one<{ id: string }>(
        `insert into organizations (name, slug, branding, ai_settings) values ($1, $2, $3, $4) returning id`,
        [orgName, orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "org", JSON.stringify({ brand_name: orgName, primary_color: "#196144" }), JSON.stringify({ model: "claude-opus-5-5", effort: "medium" })],
      );
      console.log(`Created organisation "${orgName}".`);
    }
    const existing = await db.one("select id from users where lower(email) = $1", [email]);
    if (existing) return false;
    await db.query(`insert into users (organization_id, email, full_name, password_hash, platform_role) values ($1, $2, $3, $4, 'super_admin')`, [
      org!.id,
      email,
      name,
      hash,
    ]);
    return true;
  });

  if (!created) console.log(`${email} already exists; nothing changed.`);
  else console.log(`Super admin ${email} created.${process.env.ADMIN_PASSWORD ? "" : `\nPassword (shown once, change it after signing in): ${password}`}`);
  await getPool().end();
}

main().catch(async (e) => {
  console.error(e.message);
  await getPool().end().catch(() => {});
  process.exit(1);
});
