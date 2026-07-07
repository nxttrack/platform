import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const projectRoot = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: {
    root: join(projectRoot, "../..")
  },
  async redirects() {
    return [
      {
        source: "/parent",
        destination: "/portaal",
        permanent: false
      },
      {
        source: "/parent/:path*",
        destination: "/portaal/:path*",
        permanent: false
      }
    ];
  }
};

export default nextConfig;
