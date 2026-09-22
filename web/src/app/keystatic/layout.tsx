import type { Metadata } from "next";
import { noindexMetadata } from "@/lib/seo";

// El editor del blog es privado (entra solo quien tiene acceso al repo en
// GitHub): fuera del índice de buscadores.
export const metadata: Metadata = {
  ...noindexMetadata,
  title: "Editor del blog",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
