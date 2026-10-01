import { ComingInStep } from "@/components/studio/views";
export const metadata = { title: "Brand assets" };
export default function Page() {
  return <ComingInStep title="Brand assets" step={5}>Client logos, cover images and palettes, stored in the private bucket and served by signed URL. A palette is derived from the logo when none is supplied.</ComingInStep>;
}
