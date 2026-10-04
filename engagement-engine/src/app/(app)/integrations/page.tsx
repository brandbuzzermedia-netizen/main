import { requireStaff } from "@/lib/auth/session";
import { enabledPlatforms } from "@/lib/env";
import { getAdapter, oauthConfigFor } from "@/lib/platforms/registry";
import { PLATFORMS, PLATFORM_LABELS, type Capability, type PlatformCapabilities } from "@/lib/platforms/types";
import { Badge, Card, CardHeader, Notice, PageHeader, PlatformIcon, Table, Td, Th } from "@/components/ui";

export const metadata = { title: "Integrations" };

const ROWS: [keyof PlatformCapabilities, string][] = [
  ["connect", "Connect account"],
  ["discoverByHashtag", "Discover by hashtag"],
  ["discoverByKeyword", "Discover by keyword"],
  ["monitorProfiles", "Monitor target profiles"],
  ["ownPostComments", "Comments on own posts"],
  ["mentions", "Mentions / tags"],
  ["getAuthor", "Author profile"],
  ["publishReplyOnOwnPost", "Publish reply on own post"],
  ["publishMentionReply", "Publish reply to mention"],
  ["publishOnThirdPartyPost", "Publish on others' posts"],
  ["commentMetrics", "Comment metrics"],
  ["profileMetrics", "Profile metrics"],
];

function Cell({ c }: { c: Capability }) {
  const map = { supported: ["good", "Yes"], limited: ["warn", "Limited"], manual: ["accent", "Manual"], unsupported: ["neutral", "No"], prohibited: ["bad", "Not allowed"] } as const;
  const [tone, word] = map[c.status];
  return <span title={c.note}><Badge tone={tone}>{word}</Badge></span>;
}

export default async function IntegrationsPage() {
  await requireStaff();
  const enabled = new Set(enabledPlatforms());
  const ai = process.env.ANTHROPIC_API_KEY ? "Claude (Anthropic API)" : "Offline drafts — set ANTHROPIC_API_KEY";
  return (
    <>
      <PageHeader title="Integrations" description="What each platform's official API allows. The engine never works around a missing capability — no scraping, browser automation or unofficial endpoints." />
      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <Notice tone={process.env.ANTHROPIC_API_KEY ? "good" : "warn"}>AI provider: {ai}</Notice>
        <Notice tone={process.env.VOYAGE_API_KEY ? "good" : "info"}>Duplicate detection: {process.env.VOYAGE_API_KEY ? "Voyage embeddings" : "local embeddings (no text leaves the server)"}</Notice>
        <Notice tone={process.env.TOKEN_ENCRYPTION_KEY ? "good" : "bad"}>Token encryption key {process.env.TOKEN_ENCRYPTION_KEY ? "configured" : "missing"}</Notice>
      </div>
      <Card>
        <CardHeader title="Platform capabilities" description="Hover a badge for details. Manual = approved, then posted by a person from the client's account." />
        <Table>
          <thead>
            <tr>
              <Th>Capability</Th>
              {PLATFORMS.map((p) => (
                <Th key={p}>
                  <span className="flex flex-col items-start gap-1">
                    <span className="flex items-center gap-1.5"><PlatformIcon platform={p} size={16} />{PLATFORM_LABELS[p]}</span>
                    <span className="text-[10px] font-normal">{enabled.has(p) ? (oauthConfigFor(p) ? "Enabled · app configured" : "Enabled · app keys missing") : "Not enabled"}</span>
                  </span>
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([key, label]) => (
              <tr key={key}>
                <Td className="font-medium text-ink">{label}</Td>
                {PLATFORMS.map((p) => <Td key={p}><Cell c={getAdapter(p).capabilities[key]} /></Td>)}
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <p className="mt-4 text-xs text-ink-3">Details and sources: docs/platform-capabilities.md. Re-check against each platform&apos;s current documentation and your approved app permissions before production use.</p>
    </>
  );
}
