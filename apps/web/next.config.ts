import type { NextConfig } from "next";
const config: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${new URL(process.env.API_URL?.trim() || "http://localhost:4000").origin}/api/:path*`,
      },
    ];
  },
};
export default config;
