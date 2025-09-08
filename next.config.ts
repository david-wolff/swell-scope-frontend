// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Não deixe o lint quebrar o build em CI/Render
    ignoreDuringBuilds: true,
  },
  // (opcional) se o type-check do Next acusar algo, não falhe o build
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
