/** @type {import('next').NextConfig} */
const webUrl = (process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3002").replace(/\/$/, "");

const nextConfig = {
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
      // Lo público vive en la web (PLAN-APP-DOMINIO.md): quien llegue a la
      // app con una ruta de marketing va allí. El registro de cuenta también;
      // el asistente del negocio de después ya es /bienvenida, aquí.
      ...["/landing", "/peluqueria", "/barberia", "/centro-de-estetica", "/salon-de-unas", "/fisioterapia", "/planes", "/blog"].map(
        (source) => ({ source, destination: `${webUrl}${source === "/landing" ? "/" : source}`, permanent: true }),
      ),
      { source: "/legal/:path*", destination: `${webUrl}/legal/:path*`, permanent: true },
      { source: "/blog/:path*", destination: `${webUrl}/blog/:path*`, permanent: true },
      { source: "/register", destination: `${webUrl}/register`, permanent: true },
      { source: "/register/business", destination: "/bienvenida", permanent: true },
      { source: "/register/business/:path*", destination: "/bienvenida/:path*", permanent: true },
      // Destino del botón «Ir a Ajustes» de las alertas por WhatsApp: la
      // plantilla de Meta solo admite un sufijo bajo /ajustes/. El calendario
      // vive en /agente; /ajustes/telefono es ya una pantalla propia.
      { source: "/ajustes/calendario", destination: "/agente", permanent: false },
      // «Tu Gestor» pasó a llamarse «Tu asistente» (22-09-2026).
      { source: "/gestor", destination: "/asistente", permanent: true },
    ];
  },
};

export default nextConfig;
