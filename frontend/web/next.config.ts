import type { NextConfig } from "next";

import { apiRewriteConfig } from "./lib/api-routing";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@selfx/shared", "@selfx/ui"],
  async rewrites() {
    return apiRewriteConfig();
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      crypto: false,
      fs: false,
      path: false,
    };
    return config;
  },
};

export default nextConfig;
