import type { Metadata } from "next";
import { SiteLanding } from "@/components/site-landing";
import { absoluteUrl, defaultDescription, landingStructuredData, seoKeywords, siteName } from "@/lib/seo";

export const metadata: Metadata = {
  title: { absolute: "Asistente telefónico con IA para reservas 24/7 | BotBook" },
  description: defaultDescription,
  keywords: [
    ...seoKeywords,
    "asistente telefónico para peluquerías",
    "recepcionista virtual para centros de estética",
    "asistente telefónico para salones de uñas",
    "recepcionista virtual para barberías",
    "asistente telefónico para fisioterapia",
  ],
  alternates: {
    canonical: absoluteUrl("/landing"),
  },
  openGraph: {
    title: "Asistente telefónico con IA para reservas 24/7 | BotBook",
    description: defaultDescription,
    url: absoluteUrl("/landing"),
    siteName,
    locale: "es_ES",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Asistente telefónico con IA para reservas 24/7 | BotBook",
    description: defaultDescription, 
    
  },
};

export default function LandingPage() {
  return (
    <>
      <SiteLanding />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(landingStructuredData) }}
      />
    </>
  );
}
