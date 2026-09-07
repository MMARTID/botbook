## Cómo se construye con Alhabla

SaaS de recepcionistas de voz con IA para negocios tradicionales españoles
(peluquerías, barberías, centros de estética, fisioterapia). Estética editorial
de alto contraste: **blanco, tinta casi negra y un único acento morado**. Nada
de look de startup. Todo el copy va en **español**.

### Envolver: `PreviewProviders`

Los componentes del grupo `panel` (`RecentCalls`, `OnboardingChecklist`,
`UpcomingCalendarEvents`, `CallDetailModal`) leen sus datos con TanStack Query,
y algunos de `marketing` usan el router. Sin contexto **renderizan vacío o
lanzan**. Envuelve la raíz una sola vez:

```jsx
const { PreviewProviders, RecentCalls } = window.Alhabla;

<PreviewProviders>
  <RecentCalls />
</PreviewProviders>
```

`PreviewProviders` trae la caché ya sembrada con datos realistas de una
peluquería. Las claves que resuelven sin red son fijas: `RecentCalls` y
`OnboardingChecklist` no reciben props, y `UpcomingCalendarEvents` **exige**
`businessId="biz-demo"` — con cualquier otro cae en su estado de error.

### El idioma visual: Tailwind + clases del sistema

Es Tailwind. Para tu propia maquetación usa utilidades normales, pero **los
elementos recurrentes ya tienen clase propia** — úsalas en vez de recomponerlas:

| Clase | Qué es |
|---|---|
| `.panel` | Tarjeta/panel: `rounded-3xl`, borde `#e5e5e5`, sin sombra |
| `.field` | Input de 44 px, `rounded-full`, focus morado |
| `.btn-primary` | CTA principal: píldora negra sólida |
| `.btn-secondary` | CTA secundario: píldora blanca con borde negro |
| `.btn-purple` | CTA de acento morado |
| `.badge-soft` | Chip morado sobre `--purple-wash` |
| `.text-muted` | Texto secundario |

La forma es la mitad de la marca: **píldora** (`rounded-full`) en botones,
inputs y badges; **`rounded-3xl`** en paneles. Nunca radios pequeños.

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

El bundle exporta el contenido del propio producto: `nicheLandings`
(copy completo por nicho — `peluqueria`, con su `accent` rosa propio),
`DEFAULT_AGENT_SETTINGS`, `DEFAULT_BUSINESS_SCHEDULE` y `getScheduleSummary`.
Úsalos en vez de inventar copy de relleno.

Varios componentes de `marketing` aceptan un `accent` de nicho que los retinta
enteros; sin él usan el morado de marca.

### Dónde está la verdad

- `_ds/<carpeta>/styles.css` y lo que importa (`fonts/fonts.css`,
  `_ds_bundle.css`): los tokens y las clases reales.
- `components/<grupo>/<Nombre>/<Nombre>.prompt.md`: cómo se usa cada
  componente, con sus avisos. **Léelo antes de componer con uno.**
- `guidelines/`: `DESIGN.md`, la doctrina de diseño del producto.

### Ejemplo idiomático

```jsx
const { PreviewProviders, SettingsSection, RangeSlider } = window.Alhabla;

<PreviewProviders>
  <div className="mx-auto max-w-2xl space-y-4 p-6">
    <span className="badge-soft">Configuración</span>
    <h1 className="text-3xl font-black tracking-tight text-[#0a0a0a]">
      Ajustes del negocio
    </h1>
    <p className="text-sm leading-6 text-muted">
      El agente comprueba estos datos antes de confirmar cualquier cita.
    </p>
    <SettingsSection
      id="capacity" icon={CalendarClock}
      title="Capacidad de reservas" summary="2 plazas simultáneas"
      open onToggle={() => {}}
    >
      <div className="p-5">
        <button type="button" className="btn-primary">Guardar</button>
      </div>
    </SettingsSection>
  </div>
</PreviewProviders>
```
