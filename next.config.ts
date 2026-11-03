import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: false,

  // Impede que os pacotes pesados sejam incluídos no bundle analisado pelo worker de build
  serverExternalPackages: [
    "xlsx",
    "html-to-image",
    "@google/genai",
    "@supabase/supabase-js",
  ],

  typescript: {
    ignoreBuildErrors: true,
  },

  // Desativa a coleta pesada de arquivos em memória
  outputFileTracingIncludes: {},
  outputFileTracingExcludes: {
    "*": [
      "node_modules/xlsx/**/*",
      "node_modules/@google/genai/**/*",
      "node_modules/@supabase/**/*",
    ],
  },

  experimental: {
    cpus: 1,
    // Desativa paralelismo excessivo na compilação do servidor
    parallelServerCompiles: false,
  },
};

export default nextConfig;