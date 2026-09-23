import type { Metadata } from "next";
import localFont from "next/font/local";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/app-shell";
import { GoogleAnalytics } from "@/components/google-analytics";
import { defaultDescription, noindexMetadata, siteName, siteUrl } from "@/lib/seo";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl ?? "https://app.alhabla.ai"),
  title: {
    default: `Panel | ${siteName}`,
    template: `%s | ${siteName}`,
  },
  description: defaultDescription,
  applicationName: siteName,
  // La app no se indexa (PLAN-APP-DOMINIO.md): lo público vive en la web.
  ...noindexMetadata,
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/*
          IMPECCABLE DIRECTION CONTRACT
          THESIS: Alhabla rompe con el papel verde de mostrador hacia un editorial de
          alto contraste — cada llamada perdida se muestra con la contundencia de una
          hoja de cálculo, no de un folleto.
          OWN-WORLD: blanco puro, tinta casi negra, un único acento morado
          (#8B5CF6 / #A78BFA) reservado a badges, iconos, CTA secundario y cifras
          clave. Tarjetas de borde gris 1px y radio grande; CTA primario negro sólido
          en píldora.
          STORY: el dueño entiende en un vistazo que cada llamada sin contestar es
          dinero que se va a la competencia, y actúa viendo cómo funciona o empezando.
          FIRST VIEWPORT: badge morado con flecha, H1 negro bold de dos líneas,
          subtítulo, dos CTAs (negro + outline), checkmarks morados, y debajo una
          tarjeta mockup de llamada entrante estilo terminal (dots rojo/ámbar/verde)
          con conversación real y confirmación morada.
          FORM: dirección fijada por el brief del usuario (PDF transcrito por el
          cliente), sin ronda de dados — new-work.md: "el brief gana".
          FINISH: unreviewed and undocumented is unfinished; this build ends with the
          finish review, the verdict, DESIGN.md, and every shipping raster carrying
          its provenance.
        */}
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
        <GoogleAnalytics />
        <Analytics />
      </body>
    </html>
  );
}
