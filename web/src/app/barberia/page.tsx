import { SiteLanding } from "@/components/site-landing";
import { getNicheMetadata, getNicheStructuredData, nicheLandings } from "@/lib/niche-landings";

const content = nicheLandings.barberia;
export const metadata = getNicheMetadata(content);

export default function BarberiaPage() {
  return (
    <>
      <SiteLanding content={content} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(getNicheStructuredData(content)) }}
      />
    </>
  );
}
