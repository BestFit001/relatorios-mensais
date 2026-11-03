import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: false,
  
  // Isola dependências de binários pesados do bundle do servidor
  serverExternalPackages: [
    "xlsx",
    "html-to-image",
    "@google/genai"
  ],

  typescript: {
    ignoreBuildErrors: true,
  },

  // Otimização Webpack para limitar alocação de memória nos chunks
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.optimization = {
        ...config.optimization,
        minimize: false, // Não minifica código de servidor para economizar 1.2 GB de RAM no build
      };
    }
    return config;
  },
};

export default nextConfig;