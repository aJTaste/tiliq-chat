import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Cloudinary配信画像を next/image で最適化表示するための許可設定
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
  },
};

export default nextConfig;
