import type { NextConfig } from "next";
const config: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_URL ?? "http://localhost:4000"}/api/:path*`,
      },
    ];
  },
};
export default config;
