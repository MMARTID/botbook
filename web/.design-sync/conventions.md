## Cómo se construye con Alhabla (web pública)

SaaS de recepcionistas de voz con IA para negocios tradicionales españoles
(peluquerías, barberías, centros de estética, fisioterapia). Estética editorial
de alto contraste: **blanco, tinta casi negra y un único acento morado**. Nada
de look de startup. Todo el copy va en **español**.

Este sistema es el de **la web pública** (`alhabla.ai`: portada, landings por
sector, planes, legal y registro). El panel del negocio es otro proyecto de
diseño con su propio bundle, `window.Alhabla`; sus piezas no están aquí.

### Envolver: `PreviewProviders`

La web no tiene sesión ni caché de datos: lo único que falta fuera de Next es
el router. `RevenueLossCalculator` lo pide con `useRouter()` y sin él
**lanza** (`next/link` también lo lee, para el prefetch). Envuelve la raíz una
sola vez:

```jsx
const { PreviewProviders, LandingHero, nicheLandings } = window.AlhablaWeb;

<PreviewProviders>
  <LandingHero content={nicheLandings.peluqueria} />
</PreviewProviders>
```

### El idioma visual: Tailwind + clases del sistema

Es Tailwind. Para tu propia maquetación usa utilidades normales, pero **los
elementos recurrentes ya tienen clase propia** — úsalas en vez de recomponerlas:

| Clase | Qué es |
|---|---|
| `.panel` | Tarjeta/panel: `rounded-3xl`, borde `#e5e5e5`, sin sombra |
| `.field` | Input de 44 px, `rounded-[10px]`, focus morado |
| `.btn-primary` | CTA principal: negro sólido, 48 px, `rounded-[10px]` |
| `.btn-secondary` | CTA secundario: blanco con borde negro, `rounded-[10px]` |
| `.btn-purple` | CTA de acento morado, `rounded-[10px]` |
| `.badge-soft` | Chip morado en píldora sobre `--purple-wash` |
| `.text-muted` | Texto secundario |

La forma es la mitad de la marca, con una escala de radios cerrada:
**`rounded-[10px]`** en botones y campos, **`rounded-3xl`** en paneles y
**píldora** (`rounded-full`) solo para badges, chips y lo que es un círculo.
Nunca píldora en un botón ni `rounded-lg` (8 px) en nada (`DESIGN.md`).

Los colores viven en tokens CSS, no en hexadecimales sueltos: `--background`,
`--surface`, `--surface-soft`, `--border`, `--foreground`, `--muted`,
`--accent`, `--accent-strong`, `--purple`, `--purple-strong`, `--purple-wash`,
`--purple-ink`, `--purple-ring`, `--accent-soft`, `--success`,
`--success-surface`, `--warning`, `--error`.

El morado es **acento, no fondo**: iconos, badges, focus rings, cifras clave y
CTA secundario. El CTA principal es negro. Los iconos son Lucide dentro de un
contenedor `rounded-xl` con `bg-[#f3eeff]` y `text-[#8b5cf6]`.

Tipografía **Geist** vía `--font-geist-sans` (y `--font-geist-mono` para el
código y los números de teléfono). Titulares en `font-black tracking-tight`.

### Componer con datos reales

El bundle exporta `nicheLandings`: el copy completo de cada landing de sector
(`peluqueria`, `barberia`, `centro-de-estetica`, `salon-de-unas`,
`fisioterapia`) — titular, descripción, bloque de la calculadora
(`calculator`), datos del sector (`sectorData`, opcional) y su `accent`
propio. Úsalo en vez de inventar copy de relleno.

`SectorDataSection` y `RevenueLossCalculator` aceptan un `accent` de nicho
(`nicheLandings.<nicho>.accent`) que los retinta enteros; sin él usan el morado
de marca. `LandingHero` lo toma del propio `content`.

### Dónde está la verdad

- `_ds/<carpeta>/styles.css` y lo que importa (`fonts/fonts.css`,
  `_ds_bundle.css`): los tokens y las clases reales.
- `components/<grupo>/<Nombre>/<Nombre>.prompt.md`: cómo se usa cada
  componente, con sus avisos. **Léelo antes de componer con uno.**
- `guidelines/`: `DESIGN.md`, la doctrina de diseño del producto.

### Ejemplo idiomático

```jsx
const { PreviewProviders, Reveal, SectorDataSection, nicheLandings } =
  window.AlhablaWeb;
const peluqueria = nicheLandings.peluqueria;

<PreviewProviders>
  <main className="mx-auto max-w-5xl space-y-12 px-6 py-16">
    <Reveal>
      <span className="badge-soft">Peluquerías</span>
      <h2 className="mt-4 text-4xl font-black tracking-tight text-[#0a0a0a]">
        Cada llamada sin contestar es una clienta que reserva en otro sitio
      </h2>
      <p className="mt-3 max-w-2xl text-base leading-7 text-muted">
        El agente contesta, consulta tu agenda y reserva mientras trabajas.
      </p>
      <a href="#planes" className="btn-primary mt-6">
        Empezar 7 días gratis
      </a>
    </Reveal>
    <SectorDataSection data={peluqueria.sectorData} accent={peluqueria.accent} />
  </main>
</PreviewProviders>
```
