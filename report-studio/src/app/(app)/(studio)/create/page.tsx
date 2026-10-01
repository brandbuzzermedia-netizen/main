import { ComingInStep } from "@/components/studio/views";
export const metadata = { title: "Create report" };
export default function Page() {
  return <ComingInStep title="Create report" step={3}>Upload screenshots in bulk (duplicates detected by file hash), extract figures with per-field confidence, then review conflicts before anything is written into a report.</ComingInStep>;
}
