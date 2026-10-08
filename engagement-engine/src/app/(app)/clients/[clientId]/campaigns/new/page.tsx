import { requireClientAccess } from "@/lib/auth/session";
import { withUser } from "@/lib/db";
import { notFound } from "next/navigation";
import { Card, CardBody, PageHeader } from "@/components/ui";
import { CampaignForm } from "../campaign-form";
import { campaignFormData } from "../data";

export const metadata = { title: "New campaign" };

export default async function NewCampaign({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const { user, access } = await requireClientAccess(clientId);
  if (!access.canManage) notFound();
  const { segments, targets } = await withUser(user.id, (db) => campaignFormData(db, clientId));
  return (
    <>
      <PageHeader title="New campaign" description="Campaigns start paused. Activate one when its accounts are connected." />
      <Card>
        <CardBody>
          <CampaignForm clientId={clientId} segments={segments} targets={targets} isGbs={access.isGbsManager} />
        </CardBody>
      </Card>
    </>
  );
}
