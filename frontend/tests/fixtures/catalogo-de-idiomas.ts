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
      secundariosCompatibles: [
        "en-GB",
        "fr-FR",
        "de-DE",
        "it-IT",
        "pt-PT",
        "nl-NL",
      ],
      voces: [
        {
          id: "Telnyx.Ultra.538a8872-3799-4df5-b373-b78493b766c6",
          nombre: "Blanca",
          genero: "femenina",
          habla: [
            "es-ES",
            "en-GB",
            "fr-FR",
            "de-DE",
            "it-IT",
            "pt-PT",
            "nl-NL",
          ],
          expresiva: true,
          muestra: "/voces/es/blanca.mp3",
        },
        {
          id: "Telnyx.Ultra.13ff5deb-2591-42ad-a356-63a04e524411",
          nombre: "Marcos",
          genero: "masculina",
          habla: [
            "es-ES",
            "en-GB",
            "fr-FR",
            "de-DE",
            "it-IT",
            "pt-PT",
            "nl-NL",
          ],
          expresiva: true,
          muestra: "/voces/es/marcos.mp3",
        },
      ],
    },
    {
      codigo: "ca-ES",
      etiqueta: "Catalán",
      secundariosCompatibles: [
        "en-GB",
        "fr-FR",
        "de-DE",
        "it-IT",
        "pt-PT",
        "nl-NL",
      ],
      voces: [
        {
          id: "Soniox.tts-rt-v2.Marta",
          nombre: "Marta",
          genero: "femenina",
          habla: "todos",
          expresiva: false,
          muestra: "/voces/ca/marta.mp3",
        },
        {
          id: "Soniox.tts-rt-v2.Sergio",
          nombre: "Sergio",
          genero: "masculina",
          habla: "todos",
          expresiva: false,
          muestra: "/voces/ca/sergio.mp3",
        },
      ],
    },
    {
      codigo: "eu-ES",
      etiqueta: "Euskera",
      secundariosCompatibles: [
        "en-GB",
        "fr-FR",
        "de-DE",
        "it-IT",
        "pt-PT",
        "nl-NL",
      ],
      voces: [
        {
          id: "Soniox.tts-rt-v2.Marta",
          nombre: "Marta",
          genero: "femenina",
          habla: "todos",
          expresiva: false,
          muestra: "/voces/eu/marta.mp3",
        },
        {
          id: "Soniox.tts-rt-v2.Sergio",
          nombre: "Sergio",
          genero: "masculina",
          habla: "todos",
          expresiva: false,
          muestra: "/voces/eu/sergio.mp3",
        },
      ],
    },
    {
      codigo: "gl-ES",
      etiqueta: "Gallego",
      secundariosCompatibles: [
        "en-GB",
        "fr-FR",
        "de-DE",
        "it-IT",
        "pt-PT",
        "nl-NL",
      ],
      voces: [
        {
          id: "Soniox.tts-rt-v2.Marta",
          nombre: "Marta",
          genero: "femenina",
          habla: "todos",
          expresiva: false,
          muestra: "/voces/gl/marta.mp3",
        },
        {
          id: "Soniox.tts-rt-v2.Sergio",
          nombre: "Sergio",
          genero: "masculina",
          habla: "todos",
          expresiva: false,
          muestra: "/voces/gl/sergio.mp3",
        },
      ],
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
    {
      codigo: "de-DE",
      etiqueta: "Alemán",
    },
    {
      codigo: "it-IT",
      etiqueta: "Italiano",
    },
    {
      codigo: "pt-PT",
      etiqueta: "Portugués",
    },
    {
      codigo: "nl-NL",
      etiqueta: "Neerlandés",
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
