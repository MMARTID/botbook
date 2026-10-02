import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/app-shell";
import { AnaliticaDeLaApp } from "@/components/analitica-de-la-app";
import { defaultDescription, noindexMetadata, siteName, siteUrl } from "@/lib/seo";
import { SCRIPT_DE_TEMA } from "@/lib/tema-inicial";
import { SeguidorDelTema } from "@/lib/tema";

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
  // La app no se indexa (docs/historico/PLAN-APP-DOMINIO.md): lo público vive
  // en la web.
  ...noindexMetadata,
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
  },
};

// La barra del navegador en el móvil sigue al tema del sistema.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0e" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // `data-tema` lo pone el script antes de hidratar: React no debe quejarse.
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Antes del primer pintado: sin él, el modo oscuro arrancaría con
            un destello blanco. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_DE_TEMA }} />
      </head>
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
        <SeguidorDelTema />
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
        <AnaliticaDeLaApp />
      </body>
    </html>
  );
}
