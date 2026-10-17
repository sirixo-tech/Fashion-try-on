import type { NextConfig } from "next";

import { apiRewriteConfig } from "./lib/api-routing";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@selfx/shared", "@selfx/ui"],
  async rewrites() {
    return apiRewriteConfig();
  },
  async headers() {
    return [
      {
        source: "/upload/:path*",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
      {
        source: "/reset-password",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
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
