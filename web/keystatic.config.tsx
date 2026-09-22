import { collection, config, fields } from "@keystatic/core";
import { bloquesDelEditor } from "./src/lib/keystatic/bloques";

/**
 * Editor del blog (Keystatic) en alhabla.ai/keystatic. No hay CMS ni base de
 * datos: el editor lee y escribe los mismos ficheros del repositorio
 * (`content/blog/<slug>.mdx` y las fotos en `public/blog/<slug>/`) a
 * través de GitHub, y cada guardado es un commit. Solo entran los
 * colaboradores del repo, con su cuenta de GitHub. En local (`npm run dev`)
 * escribe directamente en disco, sin GitHub.
 *
 * Los campos, sus límites y sus descripciones siguen content/blog/README.md:
 * lo que el editor no deja hacer mal, no hay que revisarlo después.
 */
const SECTORES = [
  { label: "Sin sector concreto", value: "" },
  { label: "Peluquerías", value: "peluqueria" },
  { label: "Barberías", value: "barberia" },
  { label: "Centros de estética", value: "centro-de-estetica" },
  { label: "Salones de uñas", value: "salon-de-unas" },
  { label: "Fisioterapia", value: "fisioterapia" },
] as const;

/** Nombre de fichero de imagen «SEO»: minúsculas, sin acentos ni espacios. */
function nombreDeImagen(original: string): string {
  const punto = original.lastIndexOf(".");
  const base = punto > 0 ? original.slice(0, punto) : original;
  const ext = punto > 0 ? original.slice(punto).toLowerCase() : "";
  const limpio = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${limpio || "imagen"}${ext}`;
}

const enProduccion = process.env.NODE_ENV === "production";

export default config({
  locale: "es-ES",
  storage: enProduccion
    ? {
        kind: "github",
        repo: { owner: "MMARTID", name: "botbook" },
        // La web vive en `web/` dentro del monorepo.
        pathPrefix: "web",
        // Cada artículo nuevo va en su rama (blog/…) y se publica con el PR,
        // igual que cualquier otro cambio; nada entra en main sin CI.
        branchPrefix: "blog/",
      }
    : { kind: "local" },
  ui: {
    brand: {
      name: "Alhabla · Blog",
      // eslint-disable-next-line @next/next/no-img-element
      mark: () => (
        <img
          src="/brand/alhabla-isotipo.svg"
          alt=""
          style={{ height: 24, width: 24 }}
        />
      ),
    },
    navigation: ["articulos"],
  },
  collections: {
    articulos: collection({
      label: "Artículos",
      path: "content/blog/*",
      slugField: "titulo",
      format: { contentField: "contenido" },
      entryLayout: "content",
      columns: ["fecha", "sector", "borrador"],
      // Abre la rama del artículo tal como la construye Vercel (app/preview).
      previewUrl: "/preview?branch={branch}&to=/blog/{slug}",
      schema: {
        titulo: fields.slug({
          name: {
            label: "Título",
            description:
              "Es el <title> de Google y el H1. Lo ideal son 60 caracteres o menos (Google corta a partir de ahí), con la búsqueda real que quieres atraer («cuántas llamadas pierde una peluquería»).",
            validation: { isRequired: true, length: { min: 10, max: 70 } },
          },
          slug: {
            label: "URL (slug)",
            description:
              "alhabla.ai/blog/<esto>. Se genera del título; corto, con la palabra clave, sin cambiarlo después de publicar.",
            validation: { length: { min: 3, max: 80 } },
          },
        }),
        resumen: fields.text({
          label: "Resumen",
          description:
            "Una o dos frases (máximo 160 caracteres). Es la descripción en Google, la tarjeta del blog y la vista previa al compartir por WhatsApp.",
          multiline: true,
          validation: { isRequired: true, length: { min: 40, max: 160 } },
        }),
        fecha: fields.date({
          label: "Fecha de publicación",
          description: "Ordena el listado y sale en el artículo.",
          defaultValue: { kind: "today" },
          validation: { isRequired: true },
        }),
        actualizado: fields.date({
          label: "Última revisión de fondo",
          description:
            "Solo cuando cambies datos o secciones, no por una errata. Sale como «Actualizado el…» y va a Google como fecha de modificación.",
        }),
        autor: fields.text({
          label: "Autor",
          description:
            "Quien firma. Un nombre real da más confianza que «Equipo de Alhabla».",
          defaultValue: "Equipo de Alhabla",
          validation: { length: { max: 60 } },
        }),
        sector: fields.select({
          label: "Sector",
          description:
            "Añade la pastilla del sector, las migas, el bloque final con enlace a su landing y la foto del sector en la imagen para compartir.",
          options: SECTORES,
          defaultValue: "",
        }),
        imagen: fields.image({
          label: "Foto de cabecera",
          description:
            "Opcional. 1600 px de ancho y menos de 300 KB (JPG para fotos, PNG para capturas). Sin foto propia se usa la del sector.",
          directory: "public/blog",
          publicPath: "/blog/",
          transformFilename: nombreDeImagen,
        }),
        imagenAlt: fields.text({
          label: "Qué se ve en la foto de cabecera (alt)",
          description:
            "Obligatorio si hay foto. Una frase natural describiendo la imagen; ni «foto de» ni listas de palabras clave.",
          validation: { length: { max: 160 } },
        }),
        idioma: fields.select({
          label: "Idioma",
          description:
            "Idioma en que está escrito el artículo. Google y el navegador lo usan para mostrarlo a quien busca en ese idioma.",
          options: [
            { label: "Castellano", value: "es" },
            { label: "Català", value: "ca" },
          ],
          defaultValue: "es",
        }),
        borrador: fields.checkbox({
          label: "Borrador (no publicar todavía)",
          description:
            "Marcado, el artículo no sale en el blog, el sitemap ni el RSS aunque esté en la web.",
          defaultValue: false,
        }),
        contenido: fields.mdx({
          label: "Artículo",
          description:
            "Sin título principal (ya lo pone el sistema). Subtítulos con las preguntas que la gente escribe, párrafos cortos, enlaces a la landing del sector y a /planes. Entre 600 y 1.200 palabras.",
          options: {
            // Un solo H1 por página: el título. Dentro, H2 y H3.
            heading: [2, 3],
            image: {
              directory: "public/blog",
              publicPath: "/blog/",
              transformFilename: nombreDeImagen,
            },
          },
          // Bloques de marca (tarjeta CTA, dato, aviso, pasos, FAQ): en el
          // editor salen en el menú «/» y se pintan con los componentes de
          // la web (components/blog/bloques.tsx).
          components: bloquesDelEditor,
        }),
      },
    }),
  },
});
