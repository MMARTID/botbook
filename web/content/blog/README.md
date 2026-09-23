# Cómo escribir un artículo del blog

Cada artículo es un fichero `.mdx` en esta carpeta. El **nombre del fichero es la URL**:
`cuantas-llamadas-pierde-una-peluqueria.mdx` → `alhabla.ai/blog/cuantas-llamadas-pierde-una-peluqueria`.
Solo minúsculas, números y guiones; corto y con la palabra clave (no `articulo-1`).

Al fusionar en `main`, la web se reconstruye sola y el artículo aparece en `/blog`, en el
`sitemap.xml`, en el RSS y con su imagen para compartir generada automáticamente. No hay que tocar
nada más.

## La forma fácil: el editor en alhabla.ai/keystatic

Entra en **[alhabla.ai/keystatic](https://alhabla.ai/keystatic)** con tu cuenta de GitHub (solo
pueden entrar los colaboradores del repositorio). Es un editor visual con todos los campos de
abajo como formulario (con sus límites y sus ayudas), el texto con negritas, listas, enlaces y
subtítulos, y las fotos del cuerpo se arrastran al artículo (te pide el texto alternativo). Al
guardar crea una rama `blog/…` y un *pull request* en GitHub: revisas la vista previa que enlaza
Vercel y le das a **Merge**. No hay base de datos: el resultado son los mismos ficheros de esta
carpeta.

En local también funciona: `cd web && npm run dev` y abre `http://localhost:3002/keystatic`; en
ese caso escribe directamente en tu disco, sin GitHub.

El resto de esta guía explica el formato de los ficheros, útil si prefieres escribirlos a mano o
con ChatGPT/Claude.

## Plantilla

```mdx
---
titulo: "Cuánto cuesta una cita perdida en una barbería"
resumen: "Una o dos frases (máximo 160 caracteres): salen en la lista del blog, en Google y en la vista previa de WhatsApp."
fecha: "2026-09-25"
autor: "Miguel Martín"
sector: "barberia"
imagen: "/blog/cuanto-cuesta-una-cita-perdida-barberia/portada.jpg"
imagenAlt: "Barbero afeitando a un cliente mientras suena el teléfono del mostrador"
---

Primer párrafo: responde en dos frases a lo que busca quien llega desde Google.

## Un subtítulo con la pregunta que la gente escribe

Texto en Markdown normal. Párrafos cortos, separados por una línea en blanco.

- Listas con guion
- **Negrita** con dos asteriscos

Enlaces así: [ver planes](/planes) o [cómo atiende Alhabla una barbería](/barberia).

![Agenda de una barbería con los huecos de la tarde llenos](/blog/cuanto-cuesta-una-cita-perdida-barberia/agenda.jpg "Pie de foto opcional")
```

### Campos

| Campo | Obligatorio | Qué es |
|---|---|---|
| `titulo` | sí | ≤ 60 caracteres. Es el `<title>` y el H1. Con la búsqueda real que quieres atraer. |
| `resumen` | sí (en la práctica) | ≤ 160 caracteres. Descripción en Google, lista del blog y vista previa al compartir. |
| `fecha` | sí | `AAAA-MM-DD`. Ordena el listado y sale en el artículo. |
| `actualizado` | no | `AAAA-MM-DD` de la última revisión de fondo. Sale como «Actualizado el…» y va a Google como `dateModified`. Ponla cuando cambies datos, no por una errata. |
| `autor` | no | Nombre de quien firma (por defecto «Equipo de Alhabla»). Un nombre real da confianza a lectores y a Google. |
| `idioma` | no | `es` (por defecto) o `ca`. El artículo se marca en ese idioma para Google y el navegador. Útil para las zonas donde la búsqueda se hace en catalán. |
| `sector` | no | `peluqueria`, `barberia`, `centro-de-estetica`, `salon-de-unas` o `fisioterapia`. Añade la pastilla del sector, las migas, el bloque final con enlace a su landing y la foto de ese sector en la imagen para compartir. |
| `imagen` | no | Foto de cabecera: ruta bajo `public/` o URL de Unsplash/Pexels (ver abajo). Con ella hace falta `imagenAlt`. Cada artículo debería llevar una portada distinta. |
| `imagenAlt` | si hay `imagen` | Qué se ve en la foto, en una frase. |
| `borrador` | no | `true` para dejarlo escrito sin publicar (no sale en el listado, el sitemap ni el RSS). |

## Bloques de marca

En el editor, escribe `/` en una línea vacía y elige uno; en el fichero quedan como etiquetas y
también se pueden escribir a mano:

```mdx
<Dato cifra="1 de cada 3" texto="llamadas perdidas acaba en una cita que se va a otro sitio." fuente="Nombre de la fuente" fuenteUrl="https://…" />

<Aviso tipo="consejo" titulo="Opcional">Texto del aviso. Tipos: consejo, importante, ejemplo.</Aviso>

<Pasos pasos={[{ titulo: "Primer paso", texto: "Explicación" }, { titulo: "Segundo paso" }]} />

<Faq preguntas={[{ pregunta: "¿…?", respuesta: "…" }]} />

<Cta titulo="¿Y si nadie volviera a quedarse sin respuesta?" texto="Opcional" destino="planes" boton="Opcional" />
```

`destino` de la Cta: `planes`, `demo`, `como_funciona` o el slug de un sector (`barberia`…).
Una sola Cta por artículo, hacia el final; los datos siempre con fuente.

## Vista previa desde el editor

El botón **Preview** del editor abre el artículo tal como está guardado en su rama, en el
despliegue de previsualización de Vercel (tarda un par de minutos en construirse tras guardar).
Los borradores (`borrador: true`) se ven en esas previsualizaciones y en local; en alhabla.ai no
existen hasta que se desmarca.

## Imágenes: dónde van y cómo se ponen bien

**Dónde**: en `web/public/blog/<slug>/`, una carpeta por artículo con el mismo nombre que el fichero.
En el texto se referencian desde la raíz: `/blog/<slug>/nombre.jpg`.

**La portada** (`imagen`) admite además URLs de Unsplash/Pexels
(`https://images.unsplash.com/…`, `https://images.pexels.com/…`, con
`?auto=format&fit=crop&w=1600&q=80`): en el editor es un campo de texto, pega la ruta o la URL.
Sin `imagen` se usa la foto del sector — justo lo que no conviene en todos los artículos, porque
el listado repetiría la misma foto; elige una portada distinta para cada uno.

**Cómo se insertan** (las dos formas son equivalentes):

```mdx
![Peluquera cortando el pelo con el teléfono sonando al fondo](/blog/mi-articulo/mostrador.jpg "Pie de foto")

<Imagen src="/blog/mi-articulo/mostrador.jpg" alt="Peluquera cortando el pelo con el teléfono sonando al fondo" pie="Pie de foto" />
```

Pasan por `next/image`: se sirven en el tamaño y el formato que pide cada pantalla y no provocan
saltos al cargar. **Una imagen sin `alt` no se muestra**: es a propósito.

**Reglas que sí cuentan para Google (y para el lector)**

1. **Nombre de fichero con palabras, no `IMG_4821.jpg`**: `peluqueria-telefono-mostrador.jpg`. En
   minúsculas, con guiones, sin acentos ni espacios.
2. **`alt` que describa lo que se ve**, en una frase natural, con la palabra clave si aparece de
   verdad en la foto. Ni «imagen», ni «foto de», ni listas de palabras clave. Si es un gráfico,
   di lo que muestra: «Gráfico: llamadas perdidas por hora del día en una peluquería».
3. **Tamaño**: 1600 px de ancho es suficiente para todo (se reduce solo). JPG para fotos, PNG para
   capturas con texto, WebP si ya lo tienes. Que no pase de **300 KB**; comprime antes de subir
   (Squoosh, ImageOptim, o «Exportar para web»).
4. **Proporción**: la de cabecera funciona mejor en 16:10 o 3:2 (1600×1000). En el cuerpo, la que
   tenga sentido.
5. **Una imagen relevante vale más que tres de relleno**. Si no aporta información (una foto de
   stock sin relación), mejor sin ella. Un gráfico propio o una captura del panel aportan más que
   cualquier foto de banco.
6. **Derechos**: fotos propias, de clientes con permiso, o de bancos con licencia libre (Unsplash,
   Pexels). Guarda el origen en el pie si la licencia lo pide.
7. **Pie de foto** cuando aporte contexto; el título del Markdown (`"…"` tras la ruta) o el `pie`
   del componente lo pintan bajo la imagen.

La **imagen para compartir** (WhatsApp, LinkedIn) se genera sola con el título, el sector y la
fecha; no hay que preparar nada. Si el artículo lleva `imagen`, esa foto también se manda a Google
como imagen principal del artículo.

## Redacción que posiciona

- **Una intención de búsqueda por artículo**, en el título y en el primer párrafo. Piensa en lo que
  escribiría el dueño de una peluquería en Google: «cuántas llamadas pierde una peluquería», «cómo
  reducir las citas que no se presentan», «recepcionista virtual para fisioterapia precio».
- **Estructura**: un solo título (lo pone la plantilla, no escribas `#` en el texto), subtítulos
  `##` con las preguntas reales, párrafos de tres o cuatro líneas, listas cuando enumeres. Entre
  600 y 1.200 palabras.
- **Enlaces internos en el texto**: a la landing del sector, a `/planes` y a otros artículos. El
  bloque del final se añade solo, pero un enlace dentro del texto vale más.
- **Cifras con fuente**: Alhabla está en prelanzamiento; nada de «nuestros clientes ahorran X».
  Si das un dato externo, enlázalo.
- **Tono**: el de la web. Tuteo, concreto, sin humo ni anglicismos; escribe como le explicarías a
  un cliente en el mostrador.
- **Cadencia**: dos o cuatro artículos al mes valen más que veinte de golpe.

## Ver el artículo antes de publicarlo

- En local: `cd web && npm run dev` y abre `http://localhost:3002/blog/<slug>`.
- Sin instalar nada: abre el PR y Vercel enlaza un *preview* del sitio con tu artículo.

## Subirlo

1. Desde GitHub: en esta carpeta, **Add file → Create new file**, nombre `<slug>.mdx`, pega el
   contenido, y abajo elige **Create a new branch and start a pull request**. Las fotos se suben
   igual a `web/public/blog/<slug>/` (**Add file → Upload files**) en la misma rama.
2. Desde tu ordenador: crea el fichero y las fotos, `git checkout -b blog/<slug>`, commit, push y
   abre el PR.

Cuando el PR esté en verde, **Merge**. En un par de minutos está en `alhabla.ai/blog`.
