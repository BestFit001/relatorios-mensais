import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: false,
  serverExternalPackages: [
    "xlsx",
    "html-to-image",
    "@google/genai"
  ],
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    // Reduz workers concorrentes para manter o heap do processo sob controle
    cpus: 1,
  },
};

export default nextConfig;