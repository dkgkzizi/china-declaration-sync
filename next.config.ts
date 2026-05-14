import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  eslint: {
    // 빌드 시 에러가 있어도 무시하고 진행하도록 설정
    ignoreDuringBuilds: true,
  },
  typescript: {
    // 타입 에러가 있어도 무시하고 진행하도록 설정
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
