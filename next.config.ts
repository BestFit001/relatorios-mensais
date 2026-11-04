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

  // Desativa a coleta pesada de arquivos em memória.
  // ATENÇÃO: não excluir @supabase nem @google/genai aqui. As rotas de API (/api/exportar-tiny, /api/descricao-ia,
  // /api/tarefas/alertas) usam esses pacotes em tempo de execução: sem eles dentro da função publicada na Vercel a rota
  // falha ao carregar e responde 500 com corpo vazio. O xlsx só roda no navegador, então pode continuar excluído.
  outputFileTracingIncludes: {},
  outputFileTracingExcludes: {
    "*": [
      "node_modules/xlsx/**/*",
    ],
  },

  experimental: {
    cpus: 1,
    // Desativa paralelismo excessivo na compilação do servidor
    parallelServerCompiles: false,
  },
};

export default nextConfig;