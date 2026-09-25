import { notFound } from "next/navigation";
import { CityNicheLanding } from "@/components/city-niche-landing";
import { CITY_SLUGS, getCityNicheMetadata, getCityNicheStructuredData, type CitySlug } from "@/lib/city-landings";

type Props = { params: { ciudad: string } };

export function generateStaticParams() {
  return CITY_SLUGS.map((ciudad) => ({ ciudad }));
}

function parseCiudad(ciudad: string): CitySlug | null {
  return (CITY_SLUGS as string[]).includes(ciudad) ? (ciudad as CitySlug) : null;
}

export function generateMetadata({ params }: Props) {
  const ciudad = parseCiudad(params.ciudad);
  if (!ciudad) return {};
  return getCityNicheMetadata("salon-de-unas", ciudad);
}

export default function SalonDeUnasCiudadPage({ params }: Props) {
  const ciudad = parseCiudad(params.ciudad);
  if (!ciudad) notFound();

  return (
    <>
      <CityNicheLanding nicho="salon-de-unas" ciudad={ciudad} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(getCityNicheStructuredData("salon-de-unas", ciudad)) }}
      />
    </>
  );
}
