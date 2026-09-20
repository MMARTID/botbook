import type { Metadata } from "next";
import { noindexMetadata } from "@/lib/seo";

// Ruta privada (panel o flujo de cuenta): fuera del índice de buscadores.
export const metadata: Metadata = noindexMetadata;

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
