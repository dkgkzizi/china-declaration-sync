import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // 이미지 최적화 관련 경고 방지
  images: {
    unoptimized: true,
  }
};

export default nextConfig;
