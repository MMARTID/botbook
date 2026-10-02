import type { Config } from "tailwindcss";

/** Los colores del sistema, como en la app (frontend/tailwind.config.ts):
 * los componentes compartidos usan estas clases. */
const TOKENS = [
  "lienzo",
  "superficie",
  "elevada",
  "relleno",
  "relleno-fuerte",
  "oscuro",
  "linea-suave",
  "linea",
  "linea-fuerte",
  "tinta",
  "tinta-2",
  "tinta-3",
  "tinta-hover",
  "sobre-tinta",
  "apagado",
  "apagado-2",
  "tenue",
  "morado",
  "morado-claro",
  "morado-hondo",
  "morado-tinta",
  "lavado",
  "lavado-2",
  "lavado-3",
  "lavado-borde",
  "exito",
  "exito-fondo",
  "exito-borde",
  "aviso",
  "aviso-icono",
  "aviso-fondo",
  "aviso-fondo-2",
  "aviso-borde",
  "error",
  "error-hondo",
  "error-fondo",
  "error-fondo-2",
  "error-borde",
  "peligro",
  "peligro-hondo",
  "urgente",
  "urgente-fondo",
] as const;

const colores = Object.fromEntries(TOKENS.map((token) => [token, `rgb(var(--${token}) / <alpha-value>)`]));


const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        ...colores,
      },
    },
  },
  plugins: [],
};
export default config;
