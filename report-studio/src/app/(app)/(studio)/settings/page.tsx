import type { Metadata } from "next";
import { saveDefaultTemplate } from "@/app/(app)/actions";
import { PageHeader } from "@/components/studio/views";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { aiConfigured } from "@/lib/ai/client";
import { getSettings } from "@/lib/data/repo";

export const metadata: Metadata = { title: "Settings" };

const Row = ({ label, ok, okText, noText }: { label: string; ok: boolean; okText: string; noText: string }) => (
  <li className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2.5 last:border-0">
    <span className="font-medium">{label}</span>
    <Badge variant={ok ? "ok" : "warn"}>{ok ? okText : noText}</Badge>
  </li>
);

export default async function SettingsPage() {
  const settings = await getSettings();
  return (
    <>
      <PageHeader title="Settings" sub="Studio defaults and server set-up." />
      <div className="grid grid-cols-2 items-start gap-5 max-[860px]:grid-cols-1">
        <Card>
          <CardTitle>Default template</CardTitle>
          <CardDescription>Used for new reports. Each report can still choose its own.</CardDescription>
          <form action={saveDefaultTemplate} className="flex flex-wrap gap-2">
            <select name="template" defaultValue={settings.defaultTemplate} aria-label="Default template" className="h-9 rounded-xl border border-input bg-card px-2.5 text-sm text-foreground">
              <option value="premium">Premium</option><option value="minimal">Minimal</option><option value="dark">Dark</option>
            </select>
            <Button type="submit">Save</Button>
          </form>
        </Card>
        <Card>
          <CardTitle>Server set-up</CardTitle>
          <CardDescription>These are environment variables on the server; see README.md. Values are never shown here.</CardDescription>
          <ul className="text-[13.5px]">
            <Row label="Studio password (STUDIO_PASSWORD)" ok={!!process.env.STUDIO_PASSWORD} okText="Set" noText="Not set: anyone can sign in" />
            <Row label="Session secret (SESSION_SECRET)" ok={!!process.env.SESSION_SECRET} okText="Set" noText="Not set" />
            <Row label="Claude (ANTHROPIC_API_KEY)" ok={aiConfigured()} okText="Ready" noText="Not set: Claude features off" />
            <Row label="Public address for client links (PUBLIC_URL)" ok={!!process.env.PUBLIC_URL} okText={process.env.PUBLIC_URL ?? ""} noText="Not set: uses the address in use" />
          </ul>
        </Card>
      </div>
    </>
  );
}
