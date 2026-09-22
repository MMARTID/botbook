import { fields } from "@keystatic/core";
import { block, wrapper } from "@keystatic/core/content-components";

/**
 * Bloques de marca disponibles en el editor del blog. Cada uno tiene su
 * formulario (schema) y una vista dentro del editor (ContentView) que imita
 * el bloque real; en la web los pinta components/blog/bloques.tsx. Los
 * nombres (Cta, Dato, Aviso, Pasos, Faq) son las etiquetas JSX que quedan
 * en el .mdx.
 */
const DESTINOS = [
  { label: "Planes y precios", value: "planes" },
  { label: "Escuchar la demo", value: "demo" },
  { label: "Cómo funciona", value: "como_funciona" },
  { label: "Landing de peluquerías", value: "peluqueria" },
  { label: "Landing de barberías", value: "barberia" },
  { label: "Landing de centros de estética", value: "centro-de-estetica" },
  { label: "Landing de salones de uñas", value: "salon-de-unas" },
  { label: "Landing de fisioterapia", value: "fisioterapia" },
] as const;

const TIPOS_DE_AVISO = {
  consejo: {
    etiqueta: "Consejo",
    fondo: "#f3eeff",
    borde: "#ddd6fe",
    color: "#6d28d9",
  },
  importante: {
    etiqueta: "Importante",
    fondo: "#fef8e7",
    borde: "#f0dfa8",
    color: "#9f7a15",
  },
  ejemplo: {
    etiqueta: "Ejemplo real",
    fondo: "#fafafa",
    borde: "#e5e5e5",
    color: "#52525b",
  },
} as const;

const tarjeta: React.CSSProperties = {
  border: "1px solid #ddd6fe",
  background: "#f3eeff",
  borderRadius: 20,
  padding: 20,
};

const etiqueta: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

export const bloquesDelEditor = {
  Cta: block({
    label: "Llamada a la acción",
    description:
      "Tarjeta morada con un botón. Una por artículo, hacia el final.",
    schema: {
      titulo: fields.text({
        label: "Título",
        validation: { isRequired: true, length: { max: 90 } },
      }),
      texto: fields.text({
        label: "Texto",
        multiline: true,
        validation: { length: { max: 200 } },
      }),
      destino: fields.select({
        label: "Adónde lleva el botón",
        options: DESTINOS,
        defaultValue: "planes",
      }),
      boton: fields.text({
        label: "Texto del botón (opcional)",
        validation: { length: { max: 40 } },
      }),
    },
    ContentView: (props) => (
      <div style={tarjeta}>
        <div style={{ ...etiqueta, color: "#6d28d9" }}>Alhabla</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginTop: 6 }}>
          {props.value.titulo || "Título de la llamada a la acción"}
        </div>
        {props.value.texto ? (
          <div style={{ marginTop: 6, color: "#52525b" }}>
            {props.value.texto}
          </div>
        ) : null}
        <div
          style={{
            marginTop: 12,
            display: "inline-block",
            background: "#0a0a0a",
            color: "#fff",
            borderRadius: 999,
            padding: "8px 16px",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {props.value.boton ||
            DESTINOS.find((d) => d.value === props.value.destino)?.label ||
            "Ver planes"}{" "}
          →
        </div>
      </div>
    ),
  }),
  Dato: block({
    label: "Dato destacado",
    description:
      "Una cifra grande con su explicación y su fuente. Solo datos con fuente externa.",
    schema: {
      cifra: fields.text({
        label: "Cifra",
        description: "Por ejemplo «1 de cada 3» o «600 €/mes».",
        validation: { isRequired: true, length: { max: 20 } },
      }),
      texto: fields.text({
        label: "Qué significa",
        multiline: true,
        validation: { isRequired: true, length: { max: 200 } },
      }),
      fuente: fields.text({
        label: "Fuente (nombre)",
        validation: { length: { max: 80 } },
      }),
      fuenteUrl: fields.url({ label: "Fuente (enlace)" }),
    },
    ContentView: (props) => (
      <div style={{ ...tarjeta, background: "#fff", borderColor: "#e5e5e5" }}>
        <div
          style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.03em" }}
        >
          {props.value.cifra || "42 %"}
        </div>
        <div style={{ marginTop: 6 }}>
          {props.value.texto || "Qué significa la cifra"}
        </div>
        {props.value.fuente ? (
          <div style={{ marginTop: 8, fontSize: 12, color: "#52525b" }}>
            Fuente: {props.value.fuente}
          </div>
        ) : null}
      </div>
    ),
  }),
  Aviso: wrapper({
    label: "Aviso",
    description: "Consejo, advertencia o ejemplo real, con el texto dentro.",
    schema: {
      tipo: fields.select({
        label: "Tipo",
        options: [
          { label: "Consejo", value: "consejo" },
          { label: "Importante", value: "importante" },
          { label: "Ejemplo real", value: "ejemplo" },
        ],
        defaultValue: "consejo",
      }),
      titulo: fields.text({
        label: "Título (opcional)",
        validation: { length: { max: 60 } },
      }),
    },
    ContentView: (props) => {
      const t = TIPOS_DE_AVISO[props.value.tipo] ?? TIPOS_DE_AVISO.consejo;
      return (
        <div
          style={{
            ...tarjeta,
            background: t.fondo,
            borderColor: t.borde,
            borderRadius: 16,
          }}
        >
          <div style={{ ...etiqueta, color: t.color }}>
            {props.value.titulo || t.etiqueta}
          </div>
          {/* @keystar/ui trae su propio @types/react: el children es el mismo ReactNode. */}
          <div style={{ marginTop: 6 }}>
            {props.children as React.ReactNode}
          </div>
        </div>
      );
    },
  }),
  Pasos: block({
    label: "Pasos numerados",
    description: "Una lista de pasos con título y explicación.",
    schema: {
      pasos: fields.array(
        fields.object({
          titulo: fields.text({
            label: "Título del paso",
            validation: { isRequired: true, length: { max: 80 } },
          }),
          texto: fields.text({
            label: "Explicación",
            multiline: true,
            validation: { length: { max: 240 } },
          }),
        }),
        { label: "Pasos", itemLabel: (p) => p.fields.titulo.value || "Paso" }
      ),
    },
    ContentView: (props) => (
      <div style={{ display: "grid", gap: 8 }}>
        {(props.value.pasos.length
          ? props.value.pasos
          : [{ titulo: "Primer paso", texto: "" }]
        ).map((p, i) => (
          <div
            key={i}
            style={{
              ...tarjeta,
              background: "#fff",
              borderColor: "#e5e5e5",
              borderRadius: 16,
              display: "flex",
              gap: 12,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                background: "#0a0a0a",
                color: "#fff",
                display: "grid",
                placeItems: "center",
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {i + 1}
            </div>
            <div>
              <div style={{ fontWeight: 600 }}>{p.titulo}</div>
              {p.texto ? (
                <div style={{ fontSize: 13, color: "#52525b", marginTop: 2 }}>
                  {p.texto}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    ),
  }),
  Faq: block({
    label: "Preguntas frecuentes",
    description:
      "Preguntas con su respuesta, desplegables. Van bien al final del artículo.",
    schema: {
      preguntas: fields.array(
        fields.object({
          pregunta: fields.text({
            label: "Pregunta",
            validation: { isRequired: true, length: { max: 120 } },
          }),
          respuesta: fields.text({
            label: "Respuesta",
            multiline: true,
            validation: { isRequired: true, length: { max: 400 } },
          }),
        }),
        {
          label: "Preguntas",
          itemLabel: (p) => p.fields.pregunta.value || "Pregunta",
        }
      ),
    },
    ContentView: (props) => (
      <div
        style={{
          ...tarjeta,
          background: "#fff",
          borderColor: "#e5e5e5",
          padding: 0,
          overflow: "hidden",
        }}
      >
        {(props.value.preguntas.length
          ? props.value.preguntas
          : [{ pregunta: "¿Primera pregunta?", respuesta: "" }]
        ).map((p, i) => (
          <div
            key={i}
            style={{
              padding: "14px 20px",
              borderTop: i ? "1px solid #e5e5e5" : "none",
            }}
          >
            <div style={{ fontWeight: 600 }}>{p.pregunta}</div>
            {p.respuesta ? (
              <div style={{ fontSize: 13, color: "#52525b", marginTop: 4 }}>
                {p.respuesta}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    ),
  }),
};
