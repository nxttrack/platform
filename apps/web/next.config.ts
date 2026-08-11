import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const securityHeaders = [
  { key: "Content-Security-Policy", value: "base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(), payment=(), usb=()" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" }
] as const;

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    serverActions: {
      // The application validates participant media at 20 MB; this only adds
      // enough multipart overhead for that explicit limit.
      bodySizeLimit: "22mb"
    }
  },
  turbopack: {
    root: join(projectRoot, "../..")
  },
  async headers() {
    return [
      {
        source: "/portal-themes/:path*",
        headers: [
          ...securityHeaders,
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" }
        ]
      },
      { source: "/:path*", headers: [...securityHeaders] }
    ];
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
