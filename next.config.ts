import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: false,
  serverExternalPackages: ["xlsx", "html-to-image", "@google/genai"],
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;