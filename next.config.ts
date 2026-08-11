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
  devIndicators: false,
  async headers() {
    return [
      {
        // Service Workerの更新が確実に反映されるよう、ブラウザ・中間キャッシュに
        // 一切キャッシュさせない（Next.js公式PWAガイド「Securing your application」推奨）。
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
