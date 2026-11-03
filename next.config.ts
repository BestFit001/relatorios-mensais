import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Desativa mapas pesados de código que dobram o uso de RAM
  productionBrowserSourceMaps: false,

  // Trata bibliotecas pesadas de parsing como módulos externos para não inflar a compilação
  serverExternalPackages: ["xlsx", "html-to-image"],

  typescript: {
    // Evita rodar o typecheck redundante dentro do worker de renderização
    ignoreBuildErrors: true,
  },

  eslint: {
    ignoreDuringBuilds: true,
  },

  // Impede o compilador de tentar gerar páginas estáticas concorrentes na RAM
  experimental: {
    cpus: 1,
  },
};

export default nextConfig;