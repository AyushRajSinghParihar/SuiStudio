import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['@mysten/sui'],
  experimental: {
    serverComponentsExternalPackages: ['@mysten/sui']
    }
};

export default nextConfig;
