/** @type {import('next').NextConfig} */
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
      { source: "/peluquerias", destination: "/peluqueria", permanent: true },
      { source: "/barberias", destination: "/barberia", permanent: true },
      { source: "/centros-de-estetica", destination: "/centro-de-estetica", permanent: true },
      { source: "/salones-de-unas", destination: "/salon-de-unas", permanent: true },
      { source: "/fisioterapeutas", destination: "/fisioterapia", permanent: true },
    ];
  },
};

export default nextConfig;

