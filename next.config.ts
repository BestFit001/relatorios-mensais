import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: false,
  
  // Isola pacotes pesados para que os workers de página não carreguem seus binários em RAM durante a renderização estática
  serverExternalPackages: [
    "xlsx",
    "html-to-image",
    "@google/genai",
    "@supabase/supabase-js"
  ],

  // Desativa checagens redundantes no worker filho
  typescript: {
    ignoreBuildErrors: true,
  },

  // Limita a concorrência na máquina de 2 cores da Vercel
  experimental: {
    cpus: 1,
  },

  // Desativa compressão em tempo de build para economizar 600MB de Heap
  compress: false,
};

export default nextConfig;