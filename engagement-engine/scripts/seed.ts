/**
 * Demo data for local development: the GBS organisation, staff, five clients with brand
 * profiles, audiences, campaigns, demo accounts, and opportunities run through the real
 * scoring, generation (offline provider), quality and approval pipeline.
 *
 * Usage: SEED_DEMO_PASSWORD=… npm run db:seed
 * Refuses to run in production.
 */
import { randomBytes } from "node:crypto";
import { getPool, withSystem, withUser, systemRunner, userRunner, type Db } from "../src/lib/db";
import { hashPassword } from "../src/lib/security/crypto";
import { loadScoringContext, upsertOpportunity } from "../src/lib/engine/discovery";
import { generateForOpportunity } from "../src/lib/engine/generate";
import { OfflineDraftProvider } from "../src/lib/ai/provider";
import { approveComment, enqueuePublishing, Outbox, recordManualPublication, submitForApproval } from "../src/lib/engine/workflow";
import type { ClientAccess, SessionUser } from "../src/lib/auth/types";
import type { Platform } from "../src/lib/platforms/types";

if (process.env.NODE_ENV === "production" && !process.argv.includes("--force")) {
  console.error("Refusing to seed demo data in production.");
  process.exit(1);
}

const password = process.env.SEED_DEMO_PASSWORD || randomBytes(9).toString("base64url");

interface ClientSeed {
  name: string;
  industry: string;
  status: "active" | "onboarding";
  approval: "manual" | "gbs" | "dual";
  platforms: Platform[];
  brand: Record<string, unknown>;
  segments: { name: string; industries: string[]; job_titles: string[]; locations: string[]; keywords: string[]; hashtags: string[] }[];
  campaign: { name: string; platforms: Platform[]; keywords: string[]; hashtags: string[]; locations: string[] };
  posts: { platform: Platform; handle: string; name: string; bio: string; followers: number; content: string; hoursAgo: number; comments: number }[];
}

const CLIENTS: ClientSeed[] = [
  {
    name: "Wudgres",
    industry: "Luxury wooden doors",
    status: "active",
    approval: "dual",
    platforms: ["instagram", "facebook"],
    brand: {
      company_name: "Wudgres",
      website: "https://wudgres.example",
      industry: "Building materials — luxury doors",
      description: "Designs and manufactures solid wood and engineered luxury doors for villas and premium apartments.",
      products: ["Wooden doors", "Main doors", "Pivot doors", "Luxury doors"],
      services: ["Custom door design", "Installation"],
      usp: "Architect-grade proportions and hardware specified for each project.",
      target_market: "Architects, interior designers and developers of premium residences",
      location: "Bangalore",
      business_model: "b2b",
      brand_personality: ["Professional", "Technical", "Insight-driven"],
      tone: ["Professional", "Technical"],
      comment_length: "short",
      cta_style: "none",
      emoji_policy: "none",
      words_to_avoid: ["cheap", "best price"],
      topics_to_avoid: ["politics"],
      competitors: ["DoorKing"],
      claims_requiring_approval: ["termite-proof", "lifetime warranty"],
      keywords: ["wooden door", "luxury door", "entrance"],
      hashtags: ["luxurydoors"],
    },
    segments: [
      {
        name: "Architects Bangalore",
        industries: ["Architecture"],
        job_titles: ["Architect", "Principal Architect", "Interior Designer"],
        locations: ["Bangalore", "Bengaluru"],
        keywords: ["luxury villa", "interior design", "wooden door", "elevation"],
        hashtags: ["architecture", "villadesign"],
      },
      {
        name: "Builders Karnataka",
        industries: ["Real estate", "Construction"],
        job_titles: ["Builder", "Developer", "Contractor"],
        locations: ["Karnataka", "Mysore", "Bangalore"],
        keywords: ["villa project", "handover", "premium apartments"],
        hashtags: ["realestate"],
      },
    ],
    campaign: {
      name: "Architect Engagement Bangalore",
      platforms: ["instagram"],
      keywords: ["luxury villa", "wooden door", "interior design", "entrance"],
      hashtags: ["villadesign", "luxurydoors"],
      locations: ["Bangalore"],
    },
    posts: [
      {
        platform: "instagram",
        handle: "ar.meera.rao",
        name: "Meera Rao",
        bio: "Principal Architect · Bangalore · luxury residences",
        followers: 4200,
        content: "5 things architects should consider when designing luxury villas: entrance proportion, natural light, door scale, material palette and how the elevation reads from the street. What would you add?",
        hoursAgo: 3,
        comments: 18,
      },
      {
        platform: "instagram",
        handle: "studio.kanva",
        name: "Studio Kanva",
        bio: "Interior Designer studio, Bengaluru",
        followers: 12800,
        content: "Teak or engineered wood for a main door in Bangalore's climate? We've been comparing finishes for a villa project in Whitefield.",
        hoursAgo: 8,
        comments: 31,
      },
      {
        platform: "instagram",
        handle: "elevation.daily",
        name: "Elevation Daily",
        bio: "Architecture inspiration",
        followers: 88000,
        content: "Double-height entrance with a pivot door. The proportion of the door to the facade is everything in a luxury villa.",
        hoursAgo: 20,
        comments: 120,
      },
      {
        platform: "instagram",
        handle: "builtbyraj",
        name: "Raj Constructions",
        bio: "Builder & Developer · Mysore",
        followers: 2300,
        content: "Handover day for our villa project in Mysore. Clients loved the wooden door at the entrance.",
        hoursAgo: 30,
        comments: 9,
      },
    ],
  },
  {
    name: "Thrishank",
    industry: "Real estate developer",
    status: "active",
    approval: "manual",
    platforms: ["instagram", "linkedin"],
    brand: {
      company_name: "Thrishank Developers",
      industry: "Real estate",
      description: "Premium residential developer in Bangalore.",
      products: ["Premium apartments", "Villas"],
      services: [],
      business_model: "b2c",
      brand_personality: ["Warm", "Trustworthy"],
      tone: ["Friendly", "Professional"],
      comment_length: "medium",
      cta_style: "none",
      keywords: ["home buying", "gated community"],
    },
    segments: [
      {
        name: "Home buyers Bangalore",
        industries: ["Technology"],
        job_titles: ["Engineer", "Manager", "Founder"],
        locations: ["Bangalore"],
        keywords: ["home buying", "first home", "gated community"],
        hashtags: ["bangalorehomes"],
      },
    ],
    campaign: { name: "First-home buyers", platforms: ["instagram", "linkedin"], keywords: ["first home", "home buying"], hashtags: ["bangalorehomes"], locations: ["Bangalore"] },
    posts: [
      {
        platform: "linkedin",
        handle: "ananya-k",
        name: "Ananya K",
        bio: "Engineering Manager, Bangalore",
        followers: 3100,
        content: "Buying my first home in Bangalore — what questions should I ask a developer about a gated community before booking?",
        hoursAgo: 5,
        comments: 22,
      },
    ],
  },
  {
    name: "Lykes",
    industry: "Furniture",
    status: "active",
    approval: "gbs",
    platforms: ["instagram"],
    brand: {
      company_name: "Lykes Furniture",
      industry: "Furniture",
      products: ["Sofas", "Dining tables"],
      business_model: "b2c",
      brand_personality: ["Friendly", "Casual", "Conversational"],
      tone: ["Friendly", "Casual"],
      comment_length: "short",
      cta_style: "soft",
      emoji_policy: "sparing",
      keywords: ["living room", "sofa"],
    },
    segments: [
      { name: "Home decor enthusiasts", industries: ["Interior design"], job_titles: ["Interior Designer", "Stylist"], locations: ["Bangalore", "Chennai"], keywords: ["living room", "sofa"], hashtags: ["homedecor"] },
    ],
    campaign: { name: "Living room conversations", platforms: ["instagram"], keywords: ["living room", "sofa"], hashtags: ["homedecor"], locations: [] },
    posts: [
      {
        platform: "instagram",
        handle: "nest.and.nook",
        name: "Nest & Nook",
        bio: "Interior stylist · Chennai",
        followers: 15400,
        content: "Small living room, big sofa? Here's how we made a three-seater work in a 10x12 room. Would you try this layout?",
        hoursAgo: 4,
        comments: 40,
      },
    ],
  },
  {
    name: "Bharatwood",
    industry: "Plywood & laminates",
    status: "active",
    approval: "manual",
    platforms: ["instagram", "linkedin"],
    brand: { company_name: "Bharatwood", industry: "Plywood", products: ["Plywood", "Laminates"], business_model: "b2b", tone: ["Professional"], keywords: ["plywood", "modular kitchen"] },
    segments: [{ name: "Carpenters & contractors", industries: ["Construction"], job_titles: ["Contractor", "Carpenter"], locations: ["Karnataka"], keywords: ["plywood", "modular kitchen"], hashtags: [] }],
    campaign: { name: "Kitchen projects", platforms: ["instagram"], keywords: ["modular kitchen", "plywood"], hashtags: ["modularkitchen"], locations: [] },
    posts: [],
  },
  {
    name: "Assetz",
    industry: "Real estate",
    status: "onboarding",
    approval: "manual",
    platforms: [],
    brand: { company_name: "Assetz", industry: "Real estate" },
    segments: [],
    campaign: { name: "Launch", platforms: ["linkedin"], keywords: [], hashtags: [], locations: [] },
    posts: [],
  },
];

async function main() {
  const hash = await hashPassword(password);
  const ids = await withSystem(async (db) => {
    const existing = await db.one("select id from organizations where slug = 'gbs'");
    if (existing) throw new Error("Demo data already present (organization 'gbs'). Use a fresh database.");
    const org = (await db.one<{ id: string }>(
      `insert into organizations (name, slug, branding, ai_settings) values ('Get Bee Seen', 'gbs', $1, $2) returning id`,
      [
        JSON.stringify({ brand_name: "Get Bee Seen", primary_color: "#196144", email_sender: "engage@getbeeseen.com" }),
        JSON.stringify({ model: "claude-opus-5-5", effort: "medium" }),
      ],
    ))!.id;
    const user = async (email: string, name: string, role: string) =>
      (await db.one<{ id: string }>(
        `insert into users (organization_id, email, full_name, password_hash, platform_role) values ($1, $2, $3, $4, $5) returning id`,
        [org, email, name, hash, role],
      ))!.id;
    return {
      org,
      admin: await user("admin@getbeeseen.com", "GBS Admin", "super_admin"),
      mehul: await user("mehul@getbeeseen.com", "Mehul", "account_manager"),
      priya: await user("priya@getbeeseen.com", "Priya", "account_manager"),
      wudgresOwner: await user("owner@wudgres.example", "Arjun (Wudgres)", "client_user"),
      wudgresMember: await user("team@wudgres.example", "Kavya (Wudgres)", "client_user"),
      lykesOwner: await user("owner@lykes.example", "Neha (Lykes)", "client_user"),
      thrishankOwner: await user("owner@thrishank.example", "Rohan (Thrishank)", "client_user"),
    };
  });

  const owners: Record<string, string | undefined> = { Wudgres: ids.wudgresOwner, Lykes: ids.lykesOwner, Thrishank: ids.thrishankOwner };
  const managers: Record<string, string> = { Wudgres: ids.mehul, Thrishank: ids.mehul, Bharatwood: ids.mehul, Lykes: ids.priya, Assetz: ids.priya };

  for (const c of CLIENTS) {
    const { clientId, campaignId } = await withSystem(async (db) => {
      const clientId = (await db.one<{ id: string }>(
        `insert into clients (organization_id, name, slug, industry, status, approval_mode, onboarding_step, onboarding_completed_steps, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
        [
          ids.org,
          c.name,
          c.name.toLowerCase(),
          c.industry,
          c.status,
          c.approval,
          c.status === "active" ? 12 : 3,
          c.status === "active" ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [1, 2],
          ids.admin,
        ],
      ))!.id;
      await db.query(`insert into account_managers (organization_id, client_id, user_id, is_primary) values ($1, $2, $3, true)`, [ids.org, clientId, managers[c.name]]);
      if (owners[c.name]) {
        await db.query(`insert into client_users (organization_id, client_id, user_id, role, can_approve, can_edit) values ($1, $2, $3, 'owner', true, true)`, [
          ids.org,
          clientId,
          owners[c.name],
        ]);
      }
      if (c.name === "Wudgres") {
        await db.query(`insert into client_users (organization_id, client_id, user_id, role) values ($1, $2, $3, 'member')`, [ids.org, clientId, ids.wudgresMember]);
      }
      const cols = Object.keys(c.brand);
      await db.query(
        `insert into brand_profiles (organization_id, client_id, ${cols.join(", ")}) values ($1, $2, ${cols.map((_, i) => `$${i + 3}`).join(", ")})`,
        [ids.org, clientId, ...cols.map((k) => c.brand[k])],
      );
      await db.query(`insert into usage_limits (organization_id, client_id, platform) values ($1, $2, 'all')`, [ids.org, clientId]);
      const segIds: string[] = [];
      for (const s of c.segments) {
        const sid = (await db.one<{ id: string }>(
          `insert into audience_segments (organization_id, client_id, name, industries, job_titles, locations) values ($1, $2, $3, $4, $5, $6) returning id`,
          [ids.org, clientId, s.name, s.industries, s.job_titles, s.locations],
        ))!.id;
        segIds.push(sid);
        for (const k of s.keywords)
          await db.query(`insert into audience_keywords (organization_id, client_id, segment_id, keyword, kind) values ($1, $2, $3, $4, 'keyword')`, [ids.org, clientId, sid, k]);
        for (const h of s.hashtags)
          await db.query(`insert into audience_keywords (organization_id, client_id, segment_id, keyword, kind) values ($1, $2, $3, $4, 'hashtag')`, [ids.org, clientId, sid, h]);
      }
      if (c.name === "Wudgres") {
        await db.query(
          `insert into target_profiles (organization_id, client_id, segment_id, platform, handle, display_name, priority) values ($1, $2, $3, 'instagram', 'studio.kanva', 'Studio Kanva', 1)`,
          [ids.org, clientId, segIds[0]],
        );
        await db.query(
          `insert into brand_documents (organization_id, client_id, kind, title, file_name, mime_type, size_bytes, content_text)
           values ($1, $2, 'brand_guidelines', 'Voice guidelines', 'voice.md', 'text/markdown', 160,
           'Speak like a senior architect: precise, calm, specific. Talk about proportion, material and hardware. Never sell in comments.')`,
          [ids.org, clientId],
        );
      }
      for (const p of c.platforms) {
        await db.query(
          `insert into social_accounts (organization_id, client_id, platform, external_account_id, handle, display_name, account_type, metadata, connected_by)
           values ($1, $2, $3, $4, $5, $6, $7, '{"demo": true}', $8)`,
          [ids.org, clientId, p, `demo-${c.name.toLowerCase()}-${p}`, c.name.toLowerCase(), `${c.name}${p === "linkedin" ? "" : " India"}`, p === "linkedin" ? "organization" : "business", ids.admin],
        );
      }
      const campaignId = (await db.one<{ id: string }>(
        `insert into campaigns (organization_id, client_id, name, platforms, keywords, hashtags, locations, daily_opportunity_limit, daily_publish_limit, status, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, 30, 5, $8, $9) returning id`,
        [ids.org, clientId, c.campaign.name, c.campaign.platforms, c.campaign.keywords, c.campaign.hashtags, c.campaign.locations, c.status === "active" ? "active" : "paused", ids.admin],
      ))!.id;
      for (const sid of segIds) {
        await db.query(`insert into campaign_segments (organization_id, client_id, campaign_id, segment_id) values ($1, $2, $3, $4)`, [ids.org, clientId, campaignId, sid]);
      }
      if (c.name === "Wudgres") {
        await db.query(
          `insert into campaign_target_profiles (organization_id, client_id, campaign_id, target_profile_id) select $1, $2, $3, id from target_profiles where client_id = $2`,
          [ids.org, clientId, campaignId],
        );
      }
      await db.query(
        `insert into audit_logs (organization_id, client_id, actor_id, actor_name, action, entity_type, entity_id) values ($1, $2, $3, 'GBS Admin', 'client.created', 'client', $2)`,
        [ids.org, clientId, ids.admin],
      );
      return { clientId, campaignId };
    });

    // Posts through the real scoring pipeline.
    const oppIds = await withSystem(async (db) => {
      const { campaign, ctx } = await loadScoringContext(db, clientId, campaignId);
      const out: string[] = [];
      for (const [i, p] of c.posts.entries()) {
        const account = await db.one<{ id: string }>("select id from social_accounts where client_id = $1 and platform = $2", [clientId, p.platform]);
        const r = await upsertOpportunity(
          db,
          campaign,
          ctx,
          {
            externalPostId: `seed-${c.name}-${i}`,
            url: `https://www.${p.platform}.com/p/seed${i}`,
            authorHandle: p.handle,
            authorName: p.name,
            authorExternalId: null,
            authorBio: p.bio,
            authorFollowers: p.followers,
            authorIsBusiness: true,
            content: p.content,
            media: [],
            metrics: { likes: p.comments * 7, comments: p.comments },
            postedAt: new Date(Date.now() - p.hoursAgo * 3_600_000),
            opportunityType: "third_party_post",
            publishCapability: "manual",
            discoveredVia: "seed",
          },
          p.platform,
          account?.id ?? null,
          "seed",
          { ignoreMinScore: true },
        );
        if (r.opportunityId) out.push(r.opportunityId);
      }
      return out;
    });

    // Generate, submit and approve with the real workflow (offline drafts, no API key needed).
    const am = managers[c.name];
    const owner = owners[c.name];
    for (const [i, oppId] of oppIds.entries()) {
      const gen = await generateForOpportunity(userRunner(am), {
        clientId,
        opportunityId: oppId,
        actor: { id: am, name: "Seed" },
        provider: new OfflineDraftProvider(),
      });
      if (i === oppIds.length - 1) continue; // leave one opportunity with fresh drafts
      const outbox = new Outbox();
      const amUser = sessionUser(am, ids.org, "account_manager");
      await withUser(am, async (db) => submitForApproval(db, amUser, await accessFor(db, clientId), gen.selectedId, outbox));
      if (i === 0) continue; // leave one pending approval
      for (const approver of [am, owner].filter(Boolean) as string[]) {
        await withUser(approver, async (db) => {
          const access = await accessFor(db, clientId);
          if (!access.canApproveGbs && !access.canApproveClient) return;
          const st = await db.one<{ status: string }>("select status from comments where id = $1", [gen.selectedId]);
          if (st?.status !== "pending_approval") return;
          await approveComment(db, sessionUser(approver, ids.org, approver === am ? "account_manager" : "client_user"), access, gen.selectedId, outbox);
        });
      }
      const approved = await withSystem((db) => db.one<{ status: string }>("select status from comments where id = $1", [gen.selectedId]));
      if (approved?.status !== "approved") continue;
      await withUser(am, async (db) => enqueuePublishing(db, sessionUser(am, ids.org, "account_manager"), await accessFor(db, clientId), gen.selectedId));
      if (i % 2 === 1) {
        const job = await withSystem((db) => db.one<{ id: string }>("select id from publishing_jobs where comment_id = $1", [gen.selectedId]));
        await withUser(am, async (db) =>
          recordManualPublication(db, sessionUser(am, ids.org, "account_manager"), await accessFor(db, clientId), job!.id, `https://www.instagram.com/p/seed${i}/c/1`),
        );
      }
    }
  }

  // Spread history over the last two weeks so analytics have a trend to show.
  await withSystem(async (db) => {
    const comments = await db.query<{ id: string; client_id: string; organization_id: string; platform: string; status: string }>(
      "select id, client_id, organization_id, platform, status from comments where status not in ('superseded')",
    );
    for (const [i, c] of comments.entries()) {
      const daysAgo = i % 12;
      await db.query(
        `update comments set created_at = now() - make_interval(days => $2), published_at = case when status = 'published' then now() - make_interval(days => $2) end where id = $1`,
        [c.id, daysAgo],
      );
      if (c.status === "published") {
        await db.query(
          `insert into engagement_metrics (organization_id, client_id, comment_id, platform, metric_date, likes, replies, source)
           values ($1, $2, $3, $4, current_date - $5::int, $6, $7, 'seed')`,
          [c.organization_id, c.client_id, c.id, c.platform, daysAgo, 3 + (i % 9), i % 4],
        );
      }
    }
    await db.query(
      `insert into engagement_metrics (organization_id, client_id, social_account_id, platform, metric_date, followers, profile_visits, source)
       select sa.organization_id, sa.client_id, sa.id, sa.platform, current_date - d, 1800 + (14 - d) * 9, 40 + (d % 5) * 6, 'seed'
       from social_accounts sa cross join generate_series(0, 13) d`,
    );
  });

  console.log("Seeded demo data. Sign in with any of these (password below):");
  console.log("  admin@getbeeseen.com   super admin");
  console.log("  mehul@getbeeseen.com   account manager (Wudgres, Thrishank, Bharatwood)");
  console.log("  priya@getbeeseen.com   account manager (Lykes, Assetz)");
  console.log("  owner@wudgres.example  client owner (Wudgres)");
  console.log("  team@wudgres.example   client team member (Wudgres)");
  console.log("  owner@lykes.example    client owner (Lykes)");
  console.log(`Password: ${password}`);
  await getPool().end();
}

function sessionUser(id: string, org: string, role: SessionUser["platformRole"]): SessionUser {
  return { id, organizationId: org, email: "", fullName: role === "account_manager" ? "Mehul" : "Client approver", platformRole: role, sessionId: "seed" };
}

async function accessFor(db: Db, clientId: string): Promise<ClientAccess> {
  const r = (await db.one<{ gbs: boolean; role: "owner" | "member" | null; manage: boolean; edit: boolean; approve_client: boolean }>(
    `select app.is_gbs_manager($1) as gbs, app.client_role($1) as role, app.can_manage_client($1) as manage,
            app.can_edit_comments($1) as edit, app.can_approve_client($1) as approve_client`,
    [clientId],
  ))!;
  return {
    clientId,
    isGbsManager: r.gbs,
    clientRole: r.role,
    canManage: r.manage,
    canEditComments: r.edit,
    canApproveGbs: r.gbs,
    canApproveClient: r.approve_client,
  };
}

void systemRunner;
main().catch(async (e) => {
  console.error(e);
  await getPool().end();
  process.exit(1);
});
