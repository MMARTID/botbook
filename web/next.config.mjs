/** @type {import('next').NextConfig} */
const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001").replace(/\/$/, "");

// Rutas que antes del reparto vivían en alhabla.ai y ahora son de la app
// (PLAN-APP-DOMINIO.md § 4, fase 3). Un 301 con la misma ruta y query salva
// marcadores, emails ya enviados y los botones URL de las plantillas de Meta
// (`alhabla.ai/ajustes/{{1}}`), que llevan el dominio horneado.
const APP_PATHS = [
  "/login",
  "/agenda",
  "/agenda/:path*",
  "/llamadas",
  "/llamadas/:path*",
  "/agente",
  "/gestor",
  "/asistente",
  "/ajustes",
  "/ajustes/:path*",
  "/checkout",
  "/checkout/:path*",
  "/elegir-plan",
  "/auth/:path*",
  "/settings",
  "/recuperar-contrasena",
  "/restablecer-contrasena",
  "/dev/:path*",
];

// Las imágenes de Open Graph (lib/og/plantilla.tsx) leen del disco las
// fuentes, el isotipo y las fotos de sector con rutas calculadas en
// runtime; sin declararlas aquí, el trazado de Vercel no las empaqueta en
// las funciones y la imagen sale sin foto ni tipografía.
const OG_ASSETS = ["./src/lib/og/*.woff", "./public/brand/alhabla-isotipo.png", "./public/heroes/*.jpg"];

const nextConfig = {
  experimental: {
    outputFileTracingIncludes: {
      "/opengraph-image": OG_ASSETS,
      "/**/opengraph-image": OG_ASSETS,
    },
  },
  images: {
    // Fotos de banco con licencia libre usadas en el cuerpo de los artículos
    // del blog (content/blog/README.md: Unsplash y Pexels). La cabecera de
    // cada artículo sigue siendo un fichero local bajo public/.
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "images.pexels.com" },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: "http://localhost:3000/:path*",
      },
    ];
  },
  async redirects() {
    return [
      { source: "/landing", destination: "/", permanent: true },
      { source: "/peluquerias", destination: "/peluqueria", permanent: true },
      { source: "/barberias", destination: "/barberia", permanent: true },
      { source: "/centros-de-estetica", destination: "/centro-de-estetica", permanent: true },
      { source: "/salones-de-unas", destination: "/salon-de-unas", permanent: true },
      { source: "/fisioterapeutas", destination: "/fisioterapia", permanent: true },
      // El asistente del negocio tras el registro se mudó a la app.
      { source: "/register/business", destination: `${appUrl}/bienvenida`, permanent: true },
      { source: "/register/business/:path*", destination: `${appUrl}/bienvenida/:path*`, permanent: true },
      ...APP_PATHS.map((source) => ({ source, destination: `${appUrl}${source}`, permanent: true })),
    ];
  },
};

export default nextConfig;
