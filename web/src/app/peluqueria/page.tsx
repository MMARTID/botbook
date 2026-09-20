import { SiteLanding } from "@/components/site-landing";
import { getNicheMetadata, getNicheStructuredData, nicheLandings } from "@/lib/niche-landings";

const content = nicheLandings.peluqueria;
export const metadata = getNicheMetadata(content);

export default function PeluqueriaPage() {
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
