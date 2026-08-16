import { SiteLanding } from "@/components/site-landing";
import { getNicheMetadata, getNicheStructuredData, nicheLandings } from "@/lib/niche-landings";

const content = nicheLandings.fisioterapia;
export const metadata = getNicheMetadata(content);

export default function FisioterapiaPage() {
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
