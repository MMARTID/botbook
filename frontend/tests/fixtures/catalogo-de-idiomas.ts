import type { CatalogoDeIdiomas } from "@/lib/types";

/**
 * Lo que devuelve GET /business/me/idiomas para el mercado de España
 * (catalogoParaElPanel en backend/src/lib/idiomas/panel.ts). Si el catálogo
 * del backend cambia, hay que regenerarlo con:
 *   cd backend && npx tsx -e 'import { catalogoParaElPanel } from "./src/lib/idiomas/panel.ts"; console.log(JSON.stringify(catalogoParaElPanel(), null, 2))'
 */
export const CATALOGO_DE_IDIOMAS: CatalogoDeIdiomas = {
  obligatorio: {
    codigo: "es-ES",
    etiqueta: "Español",
  },
  principales: [
    {
      codigo: "es-ES",
      etiqueta: "Español",
      secundariosCompatibles: ["en-GB", "fr-FR"],
      vozMultilingue: false,
    },
    {
      codigo: "ca-ES",
      etiqueta: "Catalán",
      secundariosCompatibles: ["en-GB", "fr-FR"],
      vozMultilingue: true,
    },
    {
      codigo: "eu-ES",
      etiqueta: "Euskera",
      secundariosCompatibles: ["en-GB", "fr-FR"],
      vozMultilingue: true,
    },
    {
      codigo: "gl-ES",
      etiqueta: "Gallego",
      secundariosCompatibles: ["en-GB", "fr-FR"],
      vozMultilingue: true,
    },
  ],
  secundarios: [
    {
      codigo: "en-GB",
      etiqueta: "Inglés",
    },
    {
      codigo: "fr-FR",
      etiqueta: "Francés",
    },
  ],
  etiquetas: {
    "es-ES": "Español",
    "en-GB": "Inglés",
    "fr-FR": "Francés",
    "ca-ES": "Catalán",
    "eu-ES": "Euskera",
    "gl-ES": "Gallego",
    "de-DE": "Alemán",
    "it-IT": "Italiano",
    "pt-PT": "Portugués",
    "nl-NL": "Neerlandés",
  },
};
