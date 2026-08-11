import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@selfx/shared", "@selfx/ui"],
};

export default nextConfig;
