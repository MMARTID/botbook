import type { Metadata } from "next";
import { PanelInicio } from "@/components/panel-inicio";
import { noindexMetadata } from "@/lib/seo";

// "/" es el panel autenticado (para visitantes sin sesión redirige a /landing
// en cliente): no debe indexarse ni aparecer en el sitemap. El contenido real
// vive en components/panel-inicio.tsx porque es un componente cliente y la
// metadata solo puede exportarse desde un componente servidor.
export const metadata: Metadata = {
  title: "Panel",
  ...noindexMetadata,
};

export default function Home() {
  return <PanelInicio />;
}
