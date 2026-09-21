import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Plantilla única de las imágenes de Open Graph (lo que se ve al compartir
 * un enlace por WhatsApp, el canal principal del sector). Cada página pasa
 * su etiqueta, su titular y su lado derecho: la foto real del sector con
 * su color de acento, las tarjetas de precios en /planes o el panel morado
 * del blog. Tipografía Geist (la de la web), isotipo real y la paleta del
 * rediseño negro/blanco/morado (DESIGN.md).
 *
 * Los ficheros (fuentes, isotipo, fotos) se leen del disco en runtime Node:
 * `next.config.mjs` los incluye en el trazado de las funciones de
 * `opengraph-image` para que Vercel los empaquete.
 */
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const TINTA = "#0a0a0a";
const GRIS = "#52525b";
const MORADO = "#8b5cf6";
const MORADO_PROFUNDO = "#6d28d9";
const MORADO_LAVADO = "#f3eeff";

export type LadoDerecho =
  | {
      tipo: "foto";
      fichero: string;
      acento: { strong: string; deep: string };
      /** Tarjeta blanca sobre la foto; por defecto la de «llamada atendida». */
      tarjeta?: { titulo: string; texto: string };
    }
  | {
      tipo: "precios";
      planes: { nombre: string; precio: string; destacado?: boolean }[];
    }
  | { tipo: "panel"; grande: string; pequeno?: string };

export type DatosDeImagen = {
  /** Pastilla junto al logo: sector, «Planes y precios», «Blog»… */
  etiqueta: string;
  titulo: string;
  subtitulo?: string;
  /** Texto del pie, a la derecha de la pastilla de precio. */
  pie?: string;
  /** Pastilla negra del pie. Por defecto «Desde 69 €/mes»; `null` la quita. */
  pastilla?: string | null;
  /** Color de la pastilla de etiqueta; por defecto el morado de marca. */
  acento?: { strong: string; soft: string; deep: string };
  derecha: LadoDerecho;
};

/** Satori no entiende el hex de 8 dígitos (#rrggbbaa): rgba a mano. */
function conAlfa(hex: string, alfa: number) {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`;
}

function ruta(...partes: string[]) {
  return path.join(process.cwd(), ...partes);
}

async function fuentes() {
  const [regular, semibold, bold] = await Promise.all(
    ["Geist-Regular.woff", "Geist-SemiBold.woff", "Geist-Bold.woff"].map((f) =>
      readFile(ruta("src", "lib", "og", f))
    )
  );
  return [
    {
      name: "Geist",
      data: regular,
      weight: 400 as const,
      style: "normal" as const,
    },
    {
      name: "Geist",
      data: semibold,
      weight: 600 as const,
      style: "normal" as const,
    },
    {
      name: "Geist",
      data: bold,
      weight: 700 as const,
      style: "normal" as const,
    },
  ];
}

async function dataUrl(fichero: string, mime: string) {
  const bytes = await readFile(fichero);
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

/** Tamaño del titular según su longitud: tres líneas como máximo. */
function tamanoDelTitulo(titulo: string) {
  if (titulo.length <= 40) return 66;
  if (titulo.length <= 64) return 58;
  if (titulo.length <= 90) return 50;
  return 42;
}

export async function imagenOg(datos: DatosDeImagen) {
  const [tipografias, isotipo] = await Promise.all([
    fuentes(),
    dataUrl(ruta("public", "brand", "alhabla-isotipo.png"), "image/png"),
  ]);
  const foto =
    datos.derecha.tipo === "foto"
      ? await dataUrl(
          ruta("public", "heroes", datos.derecha.fichero),
          "image/jpeg"
        )
      : null;
  const acento = datos.acento ?? {
    strong: MORADO,
    soft: MORADO_LAVADO,
    deep: MORADO_PROFUNDO,
  };
  const pastilla =
    datos.pastilla === undefined ? "Desde 69 €/mes" : datos.pastilla;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        backgroundColor: "#ffffff",
        fontFamily: "Geist",
      }}
    >
      {/* Columna izquierda: marca, titular y pie */}
      <div
        style={{
          width: "720px",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px 56px 52px 64px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={isotipo}
            width={64}
            height={64}
            alt=""
            style={{ borderRadius: "16px" }}
          />
          <span
            style={{
              fontSize: "36px",
              fontWeight: 700,
              color: TINTA,
              letterSpacing: "-0.02em",
            }}
          >
            Alhabla
          </span>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              marginLeft: "6px",
              padding: "8px 18px",
              borderRadius: "9999px",
              backgroundColor: acento.soft,
              color: acento.deep,
              fontSize: "22px",
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            {datos.etiqueta}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
          <span
            style={{
              fontSize: `${tamanoDelTitulo(datos.titulo)}px`,
              lineHeight: 1.08,
              fontWeight: 700,
              color: TINTA,
              letterSpacing: "-0.03em",
            }}
          >
            {datos.titulo}
          </span>
          {datos.subtitulo ? (
            <span
              style={{
                fontSize: "26px",
                lineHeight: 1.4,
                color: GRIS,
                fontWeight: 400,
              }}
            >
              {datos.subtitulo}
            </span>
          ) : null}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
          {pastilla ? (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                padding: "14px 26px",
                borderRadius: "9999px",
                backgroundColor: TINTA,
                color: "#ffffff",
                fontSize: "24px",
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              {pastilla}
            </span>
          ) : null}
          {datos.pie ? (
            <span
              style={{
                fontSize: "21px",
                color: GRIS,
                lineHeight: 1.3,
                whiteSpace: "nowrap",
              }}
            >
              {datos.pie}
            </span>
          ) : null}
        </div>
      </div>

      {/* Columna derecha */}
      {datos.derecha.tipo === "foto" && foto ? (
        <div
          style={{
            width: "480px",
            height: "100%",
            display: "flex",
            position: "relative",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={foto}
            width={480}
            height={630}
            alt=""
            style={{ width: "480px", height: "630px", objectFit: "cover" }}
          />
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "480px",
              height: "630px",
              display: "flex",
              backgroundImage: `linear-gradient(180deg, rgba(10,10,10,0) 35%, ${conAlfa(datos.derecha.acento.deep, 0.85)} 100%)`,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "36px",
              right: "36px",
              bottom: "40px",
              display: "flex",
              alignItems: "center",
              gap: "14px",
              padding: "18px 22px",
              borderRadius: "20px",
              backgroundColor: "rgba(255,255,255,0.94)",
            }}
          >
            <span
              style={{
                display: "flex",
                width: "14px",
                height: "14px",
                borderRadius: "9999px",
                backgroundColor: "#2c7334",
              }}
            />
            <span style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: "22px", fontWeight: 600, color: TINTA }}>
                {datos.derecha.tarjeta?.titulo ??
                  "Llamada atendida · cita reservada"}
              </span>
              <span style={{ fontSize: "18px", color: GRIS }}>
                {datos.derecha.tarjeta?.texto ??
                  "Recepcionista con IA, 24 horas"}
              </span>
            </span>
          </div>
        </div>
      ) : null}

      {datos.derecha.tipo === "precios" ? (
        <div
          style={{
            width: "480px",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: "16px",
            padding: "56px 48px",
            backgroundImage: `linear-gradient(160deg, ${MORADO_LAVADO} 0%, #ffffff 100%)`,
          }}
        >
          {datos.derecha.planes.map((plan) => (
            <div
              key={plan.nombre}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "22px 28px",
                borderRadius: "22px",
                backgroundColor: plan.destacado ? TINTA : "#ffffff",
                color: plan.destacado ? "#ffffff" : TINTA,
                border: plan.destacado
                  ? "2px solid #0a0a0a"
                  : "2px solid #e5e5e5",
              }}
            >
              <span style={{ fontSize: "28px", fontWeight: 600 }}>
                {plan.nombre}
              </span>
              <span
                style={{ display: "flex", alignItems: "baseline", gap: "6px" }}
              >
                <span
                  style={{
                    fontSize: "38px",
                    fontWeight: 700,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {plan.precio}
                </span>
                <span
                  style={{
                    fontSize: "20px",
                    color: plan.destacado ? "#d4d4d8" : GRIS,
                  }}
                >
                  /mes
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {datos.derecha.tipo === "panel" ? (
        <div
          style={{
            width: "480px",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            padding: "56px 48px",
            backgroundImage: `linear-gradient(160deg, ${MORADO} 0%, #4f27fc 100%)`,
            color: "#ffffff",
          }}
        >
          <span
            style={{
              fontSize: "96px",
              fontWeight: 700,
              letterSpacing: "-0.04em",
              lineHeight: 1,
            }}
          >
            {datos.derecha.grande}
          </span>
          {datos.derecha.pequeno ? (
            <span
              style={{
                marginTop: "18px",
                fontSize: "26px",
                lineHeight: 1.35,
                color: "rgba(255,255,255,0.85)",
              }}
            >
              {datos.derecha.pequeno}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>,
    { ...OG_SIZE, fonts: tipografias }
  );
}
