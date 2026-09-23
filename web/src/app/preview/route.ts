import { NextResponse } from "next/server";
import { esRamaDePrevisualizacion } from "@/lib/blog";
import { esDestinoInterno } from "@/lib/preview/url";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rama = searchParams.get("branch") ?? "main";
  const destino = searchParams.get("to") ?? "/blog";
  if (!esDestinoInterno(destino) || !esRamaDePrevisualizacion(rama)) {
    return new NextResponse("Destino no válido", { status: 400 });
  }
  const url = new URL(destino, request.url);
  url.searchParams.set("branch", rama);
  return NextResponse.redirect(url, 302);
}
