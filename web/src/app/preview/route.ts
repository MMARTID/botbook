import { NextResponse } from "next/server";
import { esDestinoInterno, urlDePrevisualizacion } from "@/lib/preview/url";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rama = searchParams.get("branch") ?? "main";
  const destino = searchParams.get("to") ?? "/blog";
  if (!esDestinoInterno(destino)) {
    return new NextResponse("Destino no válido", { status: 400 });
  }
  const url = urlDePrevisualizacion(rama, destino, {
    enVercel: Boolean(process.env.VERCEL),
    sitio: process.env.NEXT_PUBLIC_SITE_URL ?? "https://alhabla.ai",
  });
  return NextResponse.redirect(new URL(url, request.url), 302);
}
