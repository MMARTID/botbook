import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Alhabla — Recepción telefónica para negocios con cita previa";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Imagen que se ve al compartir el enlace por WhatsApp, el canal principal de
 * este sector. Se dibuja con los tokens actuales del sistema (rediseño
 * negro/blanco/morado, agosto 2026, ver DESIGN.md): blanco puro, tinta casi
 * negra (#0a0a0a) y el acento morado de marca (#8b5cf6 / #f3eeff) reservado
 * a badges y al precio — la misma paleta que `globals.css`, no la del papel
 * verde de mostrador anterior.
 */
export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          backgroundColor: "#ffffff",
          backgroundImage:
            "radial-gradient(circle at 88% 8%, rgba(139,92,246,0.14), transparent 45%), linear-gradient(160deg, #ffffff 0%, #fafafa 55%, #f3eeff 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "16px",
              backgroundColor: "#0a0a0a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              fontSize: "38px",
              fontWeight: 700,
            }}
          >
            A
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: "38px", fontWeight: 700, color: "#0a0a0a", letterSpacing: "-0.02em" }}>
              Alhabla
            </span>
            <span style={{ fontSize: "24px", color: "#52525b" }}>Recepción telefónica con IA</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
          <span
            style={{
              fontSize: "76px",
              lineHeight: 1.06,
              fontWeight: 600,
              color: "#0a0a0a",
              letterSpacing: "-0.03em",
              maxWidth: "980px",
            }}
          >
            No pierdas otra reserva por no contestar el teléfono
          </span>
          <span style={{ fontSize: "30px", lineHeight: 1.4, color: "#52525b", maxWidth: "860px" }}>
            Atiende llamadas, resuelve dudas y reserva citas en tu agenda 24/7 — incluso mientras atiendes a otro
            cliente.
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              borderRadius: "9999px",
              backgroundColor: "#0a0a0a",
              color: "#ffffff",
              padding: "16px 32px",
              fontSize: "26px",
              fontWeight: 600,
            }}
          >
            Desde 69 €/mes
          </div>
          <span style={{ fontSize: "26px", color: "#52525b" }}>
            7 días de prueba · Sin permanencia · Peluquerías, barberías, uñas, estética y fisioterapia
          </span>
        </div>
      </div>
    ),
    size
  );
}
