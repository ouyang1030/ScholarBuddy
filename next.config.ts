import type { NextConfig } from "next";
import { SECURITY_HEADERS } from "./shared/security-headers.mjs";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: Object.entries(SECURITY_HEADERS).map(([key, value]) => ({ key, value })),
      },
    ];
  },
};

export default nextConfig;
