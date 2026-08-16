import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "AsistAI — Recepción telefónica para negocios con cita previa";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Imagen que se ve al compartir el enlace por WhatsApp, el canal principal de
 * este sector. Se dibuja con los tokens del sistema: papel verde, tinta Verde
 * Mostrador y un solo acento en Brote Claro.
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
          backgroundColor: "#eef2eb",
          backgroundImage:
            "radial-gradient(circle at 88% 8%, rgba(184,217,110,0.45), transparent 45%), linear-gradient(160deg, #f7f8f5 0%, #eef2eb 55%, #e7ece4 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "16px",
              backgroundColor: "#1e2b22",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#b8d96e",
              fontSize: "38px",
              fontWeight: 700,
            }}
          >
            A
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: "38px", fontWeight: 700, color: "#1e2b22", letterSpacing: "-0.02em" }}>
              AsistAI
            </span>
            <span style={{ fontSize: "24px", color: "#54634b" }}>Recepción telefónica con IA</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
          <span
            style={{
              fontSize: "76px",
              lineHeight: 1.06,
              fontWeight: 600,
              color: "#1e2b22",
              letterSpacing: "-0.03em",
              maxWidth: "980px",
            }}
          >
            No pierdas otra reserva por no contestar el teléfono
          </span>
          <span style={{ fontSize: "30px", lineHeight: 1.4, color: "#54634b", maxWidth: "860px" }}>
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
              backgroundColor: "#1e2b22",
              color: "#ffffff",
              padding: "16px 32px",
              fontSize: "26px",
              fontWeight: 600,
            }}
          >
            Desde 69 €/mes
          </div>
          <span style={{ fontSize: "26px", color: "#54634b" }}>
            7 días de prueba · Sin permanencia · Peluquerías, barberías, uñas, estética y fisioterapia
          </span>
        </div>
      </div>
    ),
    size
  );
}
