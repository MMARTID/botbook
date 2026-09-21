import type { Metadata } from "next";
import { SiteLanding } from "@/components/site-landing";
import { HOME_QUICK_FAQS } from "@/lib/home-faqs";
import { absoluteUrl, buildFaqPageStructuredData, defaultDescription, landingStructuredData, ogImages, seoKeywords, siteName } from "@/lib/seo";

export const metadata: Metadata = {
  title: { absolute: "Asistente telefónico con IA para reservas 24/7 | Alhabla" },
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
    canonical: absoluteUrl("/"),
  },
  openGraph: {
    title: "Asistente telefónico con IA para reservas 24/7 | Alhabla",
    description: defaultDescription,
    url: absoluteUrl("/"),
    siteName,
    locale: "es_ES",
    type: "website",
    images: ogImages(),
  },
  twitter: {
    card: "summary_large_image",
    title: "Asistente telefónico con IA para reservas 24/7 | Alhabla",
    description: defaultDescription,
    images: ogImages(),
  },
};

const faqStructuredData = {
  "@context": "https://schema.org",
  ...buildFaqPageStructuredData(HOME_QUICK_FAQS),
};

export default function LandingPage() {
  return (
    <>
      <SiteLanding />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(landingStructuredData) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
      />
    </>
  );
}
