import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion', 'date-fns'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'www.googleapis.com',
      },
    ],
  },
};

export default nextConfig;
